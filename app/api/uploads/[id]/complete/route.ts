import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteObject, getObject, putObject, storageDriver } from "@/lib/storage";
import { canAddFilesToFiling } from "@/lib/upload-access";
import { inspectBytes, maxUploadBytes, sha256Hex } from "@/lib/uploads";

const completeSchema = z.object({
  /** Base64 body, only used by the local driver where there is no presign step. */
  dataBase64: z.string().optional(),
  applicationId: z.string().uuid().optional(),
});

/**
 * POST /api/uploads/[id]/complete
 *
 * Two jobs: prove the object is actually present, and re-derive every field the
 * browser claimed. Nothing the client sends is trusted — the byte count and the
 * checksum both come from the stored object.
 */
export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const upload = await prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      return apiError("not_found", "That upload does not exist.", 404);
    }
    if (upload.uploadedById !== user.id) {
      return apiError("forbidden", "That upload belongs to someone else.", 403);
    }
    if (upload.state === "ready") {
      return apiError("conflict", "That upload is already complete.", 409);
    }
    if (upload.expiresAt.getTime() <= Date.now()) {
      await prisma.upload.update({
        where: { id: upload.id },
        data: { state: "expired", failureReason: "The upload slot expired before completion." },
      });
      return apiError("invalid", "That upload slot has expired. Start again.", 410);
    }

    const parsed = completeSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    // Resolve and authorize the target filing before any bytes are written.
    // The request may attach this upload to a filing other than the one the
    // slot was reserved against, so the target is re-checked here rather than
    // trusting the check done at creation time. Owning the slot proves nothing
    // about the right to write into another tenant's filing.
    const applicationId = parsed.data.applicationId ?? upload.applicationId;
    // Hoisted out of the `if` below: the custody event written inside the
    // transaction needs the same filing this block resolved, and re-querying it
    // there would be a second round trip for a value already in hand.
    let targetFiling: {
      id: string;
      associationId: string;
      pharmacyId: string;
    } | null = null;
    if (applicationId) {
      targetFiling = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          associationId: true,
          pharmacyId: true,
        },
      });
      if (!targetFiling) {
        return apiError("not_found", "That filing does not exist.", 404);
      }
      // The same tenant-scoped write as attaching during filing creation, and
      // deliberately the same rule: `canAddFilesToFiling` delegates rather than
      // narrowing it. Note that no `status` is read — adding to a reported
      // filing is allowed, and the re-analysis is what keeps its analysis true.
      if (!canAddFilesToFiling(user, targetFiling)) {
        return apiError("forbidden", "You cannot add files to that filing.", 403);
      }
    }

    const cap = maxUploadBytes();

    // Local driver: the bytes arrive with this request.
    if (storageDriver() === "local") {
      if (!parsed.data.dataBase64) {
        return apiError("invalid", "No file data was received.", 400);
      }
      const bytes = Buffer.from(parsed.data.dataBase64, "base64");
      if (bytes.byteLength === 0) {
        return apiError("invalid", "The uploaded file is empty.", 400);
      }
      if (bytes.byteLength > cap) {
        return apiError("invalid", `That file exceeds the ${cap} byte limit.`, 413);
      }
      await putObject(upload.storageKey, bytes, upload.mimeType);
    }

    // Read the bytes back so size, checksum and contents all come from storage.
    const stored = await getObject(upload.storageKey);
    if (!stored) {
      await prisma.upload.update({
        where: { id: upload.id },
        data: { state: "failed", failureReason: "No object was found at the reserved key." },
      });
      return apiError("invalid", "The file never arrived in storage. Try again.", 400);
    }

    if (stored.sizeBytes > cap) {
      await deleteObject(upload.storageKey).catch(() => undefined);
      await prisma.upload.update({
        where: { id: upload.id },
        data: {
          state: "failed",
          failureReason: `Stored object is ${stored.sizeBytes} bytes, over the ${cap} byte limit.`,
        },
      });
      return apiError("invalid", "That file is too large.", 413);
    }

    const report = inspectBytes(upload.kind, stored.body);
    const checksum = sha256Hex(stored.body);

    const [completed, file] = await prisma.$transaction(async (tx) => {
      const done = await tx.upload.update({
        where: { id: upload.id },
        data: {
          state: "ready",
          actualBytes: BigInt(stored.sizeBytes),
          checksumSha256: checksum,
          failureReason: null,
          completedAt: new Date(),
        },
        select: { id: true, storageKey: true, actualBytes: true, checksumSha256: true },
      });

      // Only `ready` uploads may be attached to a filing.
      const attached = applicationId
        ? await tx.applicationFile.create({
            data: {
              applicationId,
              originalName: upload.originalName,
              kind: upload.kind,
              mimeType: upload.mimeType,
              sizeBytes: BigInt(stored.sizeBytes),
              checksumSha256: checksum,
              storageKey: upload.storageKey,
              storageDriver: upload.storageDriver,
              parseState: report.state === "invalid" ? "failed" : "pending",
              parseError: report.state === "invalid" ? report.reason : null,
              rowCount: report.rowCount,
              columnCount: report.columnCount,
              detectedColumns: report.detectedColumns,
              sheetNames: report.sheetNames,
              validationState: report.state,
              validationReason: report.reason,
              uploadedById: user.id,
            },
            select: { id: true },
          })
        : null;

      // The first entry in this file's custody history. The `uploaded` kind was
      // modelled alongside `replaced` and `deleted` but nothing ever wrote it,
      // which left every log starting at a file's *first* replacement and made a
      // file nobody had touched look like it had appeared without provenance.
      //
      // Recorded even when intake rejected the contents: the bytes were still
      // stored and are still on the filing, so the fact of their arrival is part
      // of the chain of custody. `reason` carries the intake verdict, and an
      // `invalid` verdict is visible on the ledger row itself.
      if (attached) {
        await tx.fileEvent.create({
          data: {
            applicationId: targetFiling!.id,
            fileId: attached.id,
            kind: "uploaded",
            actorId: user.id,
            filename: upload.originalName,
            sizeBytes: BigInt(stored.sizeBytes),
            checksumSha256: checksum,
            note: report.reason,
          },
        });
      }

      return [done, attached] as const;
    });

    return NextResponse.json({
      ok: true,
      upload: {
        id: completed.id,
        storageKey: completed.storageKey,
        sizeBytes: Number(completed.actualBytes ?? 0),
        checksumSha256: completed.checksumSha256,
        completedAt: true,
      },
      file,
      validation: {
        state: report.state,
        reason: report.reason,
        rowCount: report.rowCount,
        columnCount: report.columnCount,
        detectedColumns: report.detectedColumns,
      },
    });
  },
);
