import "server-only";

import { NextResponse } from "next/server";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { contentDisposition } from "@/lib/content-disposition";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { canReadUpload, resolveUploadApplication } from "@/lib/upload-access";

/**
 * GET /api/uploads/[id]/content
 *
 * Streams a stored filing back to an authenticated caller. Files are never
 * served from a public URL — the bucket stays private and this route is the only
 * read path, so access follows the same permission rules as the rest of the app.
 */
export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const upload = await prisma.upload.findUnique({
      where: { id },
      select: {
        id: true,
        uploadedById: true,
        originalName: true,
        mimeType: true,
        state: true,
        storageKey: true,
        applicationId: true,
      },
    });
    if (!upload) {
      return apiError("not_found", "That upload does not exist.", 404);
    }

    const application = await resolveUploadApplication(upload);
    if (!canReadUpload(user, upload, application)) {
      return apiError("forbidden", "You cannot read that file.", 403);
    }

    if (upload.state !== "ready") {
      return apiError("invalid", "That upload is not complete yet.", 409);
    }

    const stored = await getObject(upload.storageKey);
    if (!stored) {
      return apiError("not_found", "The file is recorded but missing from storage.", 404);
    }

    return new NextResponse(new Uint8Array(stored.body), {
      status: 200,
      headers: {
        "Content-Type": stored.contentType,
        "Content-Length": String(stored.sizeBytes),
        "Content-Disposition": contentDisposition(upload.originalName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
