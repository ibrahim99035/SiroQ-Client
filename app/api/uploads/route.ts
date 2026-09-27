import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { presignPut, storageDriver } from "@/lib/storage";
import {
  buildStorageKey,
  classify,
  maxUploadBytes,
  sanitiseFileName,
} from "@/lib/uploads";
import { canAttachToApplication } from "@/lib/upload-access";

const createSchema = z.object({
  fileName: z.string().min(1).max(255),
  declaredBytes: z.number().int().positive(),
  mimeType: z.string().max(128).optional(),
  applicationId: z.string().uuid().optional(),
});

/** How long a reserved slot stays claimable before it is treated as abandoned. */
const SLOT_TTL_MINUTES = 30;

/**
 * POST /api/uploads
 *
 * Reserves a storage slot and returns a presigned PUT so the browser sends
 * bytes straight to object storage. The slot stays `pending` until
 * /complete confirms the object is really there.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUser();

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const originalName = sanitiseFileName(parsed.data.fileName);
  const kind = classify(originalName);
  if (!kind) {
    return apiError(
      "invalid",
      "Only .xlsx and .csv filings are accepted.",
      400,
    );
  }

  const cap = maxUploadBytes();
  if (parsed.data.declaredBytes > cap) {
    return apiError(
      "invalid",
      `That file is ${formatBytes(parsed.data.declaredBytes)}. The limit is ${formatBytes(cap)}.`,
      413,
    );
  }

  if (parsed.data.applicationId) {
    const application = await prisma.application.findUnique({
      where: { id: parsed.data.applicationId },
      select: { id: true, associationId: true, pharmacyId: true },
    });
    if (!application) {
      return apiError("not_found", "That filing does not exist.", 404);
    }
    // Binding the slot to a filing is a write against that filing's tenant, so
    // the caller must be allowed to attach reports there. Without this check
    // any signed-in user could reserve a slot against another tenant's filing.
    if (!canAttachToApplication(user, application)) {
      return apiError("forbidden", "You cannot add files to that filing.", 403);
    }
  }

  const driver = storageDriver();
  const key = buildStorageKey(originalName, user.id);
  const mimeType =
    parsed.data.mimeType ||
    (kind === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const upload = await prisma.upload.create({
    data: {
      uploadedById: user.id,
      applicationId: parsed.data.applicationId ?? null,
      originalName,
      kind,
      mimeType,
      declaredBytes: BigInt(parsed.data.declaredBytes),
      storageKey: key,
      storageDriver: driver,
      expiresAt: new Date(Date.now() + SLOT_TTL_MINUTES * 60 * 1000),
    },
    select: { id: true, storageKey: true, expiresAt: true },
  });

  if (driver === "local") {
    // No bucket to presign against: the browser posts the bytes to /complete.
    return NextResponse.json({
      ok: true,
      uploadId: upload.id,
      storageKey: upload.storageKey,
      mode: "direct" as const,
      completeUrl: `/api/uploads/${upload.id}/complete`,
      expiresAt: upload.expiresAt,
    });
  }

  const presigned = await presignPut(key, mimeType);
  return NextResponse.json({
    ok: true,
    uploadId: upload.id,
    storageKey: upload.storageKey,
    mode: "presigned" as const,
    method: "PUT" as const,
    url: presigned.url,
    headers: { "Content-Type": mimeType },
    expiresIn: presigned.expiresIn,
    completeUrl: `/api/uploads/${upload.id}/complete`,
    expiresAt: upload.expiresAt,
  });
});

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
