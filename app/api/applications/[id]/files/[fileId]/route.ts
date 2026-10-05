import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  contentTypeForName,
  humanExtensionList,
  SUPPORTED_EXTENSIONS,
} from "@/lib/file-types";
import { applicationWhere } from "@/lib/scopes";
import { deleteObject, putObject, storageDriver } from "@/lib/storage";
import { canEditApplicationFile } from "@/lib/upload-access";
import {
  buildStorageKey,
  classify,
  inspectBytes,
  maxUploadBytes,
  sanitiseFileName,
  sha256Hex,
} from "@/lib/uploads";

const uuid = z.string().uuid();

const replaceSchema = z.object({
  /** Base64 bytes of the replacement. */
  dataBase64: z.string().min(1),
  /** Optional new name; defaults to the name the file already has. */
  filename: z.string().min(1).max(200).optional(),
  note: z.string().max(500).optional(),
});

/**
 * Resolve a file for mutation: the parent filing is authorized first through
 * `applicationWhere` — the same scoping rule the list, detail and download
 * routes use — and the file is then ANDed onto that filing's id rather than
 * looked up by its own. A file that does not exist and a file belonging to
 * another tenant both answer 404, so probing ids reveals nothing.
 */
async function resolveFile(
  actor: Awaited<ReturnType<typeof requireUser>>,
  id: string,
  fileId: string,
) {
  if (!uuid.safeParse(id).success || !uuid.safeParse(fileId).success)
    return null;

  const filing = await prisma.application.findFirst({
    where: { AND: [applicationWhere(actor), { id }] },
    select: { id: true, associationId: true, pharmacyId: true },
  });
  if (!filing) return null;

  const file = await prisma.applicationFile.findFirst({
    where: { AND: [{ applicationId: filing.id }, { id: fileId }] },
    select: {
      id: true,
      applicationId: true,
      originalName: true,
      kind: true,
      mimeType: true,
      sizeBytes: true,
      checksumSha256: true,
      storageKey: true,
      storageDriver: true,
      uploadedById: true,
    },
  });
  if (!file) return null;

  return { filing, file };
}

/**
 * PATCH /api/applications/[id]/files/[fileId] — replace a file's contents.
 *
 * The ledger keeps one row per file: the new bytes, checksum, name and
 * validation verdict overwrite the old ones, and the previous object is removed
 * from storage. What was there before is preserved in the `FileEvent` written in
 * the same transaction, which is what the custody log renders.
 *
 * Order matters. The new object is written under a *fresh* storage key, the row
 * is repointed at it, and only then is the old object deleted. Overwriting the
 * existing key in place would be shorter but destroys the evidence before the
 * database agrees to the swap: if the transaction then failed, the ledger would
 * still describe the old file while the bytes at its key were the new ones.
 * With a new key, any failure before the commit leaves the original intact and
 * downloadable, and the only cost is an unreferenced object, which the reaper
 * collects.
 *
 * Bytes arrive base64 in the JSON body, mirroring the local branch of
 * `POST /api/uploads/[id]/complete`. That proxies the file through the app rather
 * than presigning a direct PUT, so it is not the path for large workbooks on the
 * object-store driver; the size cap is the same `UPLOAD_MAX_BYTES` as intake.
 */
export const PATCH = withErrorHandling(
  async (
    request: Request,
    context: { params: Promise<{ id: string; fileId: string }> },
  ) => {
    const actor = await requireUser();
    const { id, fileId } = await context.params;

    const parsed = replaceSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return apiError(
        "invalid",
        parsed.error.issues[0]?.message ?? "Invalid request.",
        400,
      );
    }

    const resolved = await resolveFile(actor, id, fileId);
    if (!resolved) {
      return apiError("not_found", "That file does not exist.", 404);
    }
    const { filing, file } = resolved;

    if (!canEditApplicationFile(actor, file, filing)) {
      return apiError(
        "forbidden",
        "Only a super admin or the person who uploaded this file can replace it.",
        403,
      );
    }

    const fileName = sanitiseFileName(
      parsed.data.filename ?? file.originalName,
    );
    const kind = classify(fileName);
    if (!kind) {
      return apiError(
        "invalid",
        // Listed from the shared policy rather than written out here, so this
        // message cannot drift from what intake actually accepts.
        `Only ${humanExtensionList(SUPPORTED_EXTENSIONS)} files are accepted.`,
        400,
      );
    }

    const bytes = Buffer.from(parsed.data.dataBase64, "base64");
    if (bytes.byteLength === 0) {
      return apiError("invalid", "The replacement file is empty.", 400);
    }
    const cap = maxUploadBytes();
    if (bytes.byteLength > cap) {
      return apiError(
        "invalid",
        `That file exceeds the ${cap} byte limit.`,
        413,
      );
    }

    const storageKey = buildStorageKey(fileName, actor.id);
    const mimeType = contentTypeForName(fileName);
    await putObject(storageKey, bytes, mimeType);

    // Re-derived from the bytes that arrived, never taken from the request.
    const report = inspectBytes(kind, bytes);
    const checksum = sha256Hex(bytes);

    const event = await prisma.$transaction(async (tx) => {
      await tx.applicationFile.update({
        where: { id: file.id },
        data: {
          originalName: fileName,
          kind,
          mimeType,
          sizeBytes: BigInt(bytes.byteLength),
          checksumSha256: checksum,
          storageKey,
          storageDriver: storageDriver(),
          parseState: report.state === "invalid" ? "failed" : "pending",
          parseError: report.state === "invalid" ? report.reason : null,
          rowCount: report.rowCount,
          columnCount: report.columnCount,
          detectedColumns: report.detectedColumns,
          sheetNames: report.sheetNames,
          validationState: report.state,
          validationReason: report.reason,
          // The replacement is this actor's act, so the file becomes theirs to
          // replace again. Leaving the original uploader would let them keep
          // editing a file they never supplied.
          uploadedById: actor.id,
          uploadedAt: new Date(),
        },
      });

      return tx.fileEvent.create({
        data: {
          applicationId: file.applicationId,
          fileId: file.id,
          kind: "replaced",
          actorId: actor.id,
          filename: fileName,
          sizeBytes: BigInt(bytes.byteLength),
          checksumSha256: checksum,
          previousFilename: file.originalName,
          previousSizeBytes: file.sizeBytes,
          previousChecksumSha256: file.checksumSha256,
          note: parsed.data.note ?? null,
        },
        select: { id: true, createdAt: true },
      });
    });

    // Best effort, after the swap is committed: a surviving old object is inert,
    // whereas deleting it first and failing the transaction would leave the
    // ledger pointing at bytes that no longer exist.
    if (file.storageKey !== storageKey && file.storageDriver !== "seed") {
      await deleteObject(file.storageKey).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      file: { id: file.id },
      validation: {
        state: report.state,
        reason: report.reason,
        rowCount: report.rowCount,
        columnCount: report.columnCount,
        detectedColumns: report.detectedColumns,
      },
      fileEvent: { id: event.id, createdAt: event.createdAt.toISOString() },
    });
  },
);

/**
 * DELETE /api/applications/[id]/files/[fileId] — remove a file from a filing.
 *
 * The `FileEvent` for the removal is written in the same transaction that drops
 * the row, and it is not deletable afterwards: the point of the record is to
 * outlive the thing it describes. Its `fileId` is a plain uuid rather than a
 * foreign key for exactly that reason — with a real relation, deleting the file
 * would cascade the log away or be refused outright.
 *
 * The stored object is removed after the commit. The reverse order would be
 * worse in the failure case: a row left pointing at deleted bytes is a ledger
 * entry whose download 404s, which reads as data loss to whoever sees it.
 */
export const DELETE = withErrorHandling(
  async (
    request: Request,
    context: { params: Promise<{ id: string; fileId: string }> },
  ) => {
    const actor = await requireUser();
    const { id, fileId } = await context.params;

    const resolved = await resolveFile(actor, id, fileId);
    if (!resolved) {
      return apiError("not_found", "That file does not exist.", 404);
    }
    const { filing, file } = resolved;

    if (!canEditApplicationFile(actor, file, filing)) {
      return apiError(
        "forbidden",
        "Only a super admin or the person who uploaded this file can remove it.",
        403,
      );
    }

    const note = await readNote(request);

    const event = await prisma.$transaction(async (tx) => {
      await tx.applicationFile.delete({ where: { id: file.id } });

      return tx.fileEvent.create({
        data: {
          applicationId: file.applicationId,
          // Kept as a bare id: the row it points at is gone by design.
          fileId: file.id,
          kind: "deleted",
          actorId: actor.id,
          filename: file.originalName,
          sizeBytes: file.sizeBytes,
          checksumSha256: file.checksumSha256,
          note,
        },
        select: { id: true, createdAt: true },
      });
    });

    if (file.storageDriver !== "seed") {
      await deleteObject(file.storageKey).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,
      file: { id: file.id },
      fileEvent: { id: event.id, createdAt: event.createdAt.toISOString() },
    });
  },
);


/** Optional body note. Tolerates an empty body so a bare DELETE works. */
async function readNote(request: Request): Promise<string | null> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return null;
  const note = (body as { note?: unknown }).note;
  if (typeof note !== "string") return null;
  const trimmed = note.trim().slice(0, 500);
  return trimmed.length > 0 ? trimmed : null;
}
