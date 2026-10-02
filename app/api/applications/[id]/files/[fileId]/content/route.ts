import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { contentDisposition } from "@/lib/content-disposition";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import { applicationWhere } from "@/lib/scopes";

/**
 * GET /api/applications/[id]/files/[fileId]/content
 *
 * Streams one file attached to a filing. The browser gets a plain `attachment`
 * response, so a download button needs no JavaScript and no blob buffering — a
 * 50 MB workbook streams straight to disk instead of sitting in memory.
 *
 * Two ids, because a file is addressed *through* its filing. Authorising the
 * parent first (rather than looking the file up by its own id) is what keeps the
 * scoping rule in one place: the same `applicationWhere` the list and detail
 * routes use. Both an unknown filing and a file belonging to someone else's
 * filing answer 404, never 403 — a caller probing ids learns only that the row
 * does not exist for them.
 *
 * Note this is `ApplicationFile`, not `Upload`. The two ids are unrelated
 * (`ApplicationFile.id` is its own uuid, minted when a staged upload is bound to
 * a filing), so `/api/uploads/[id]/content` cannot serve this. That route keeps
 * the pre-attachment flow working, where the object has no filing yet.
 */
export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string; fileId: string }> }) => {
    const actor = await requireUser();
    const { id, fileId } = await context.params;

    const uuid = z.string().uuid();
    if (!uuid.safeParse(id).success || !uuid.safeParse(fileId).success) {
      return apiError("not_found", "That file does not exist.", 404);
    }

    // Parent scope first: `applicationWhere` is the maximal set this actor may
    // ever see, and the id is ANDed onto it rather than trusted on its own.
    const filing = await prisma.application.findFirst({
      where: { AND: [applicationWhere(actor), { id }] },
      select: { id: true },
    });
    if (!filing) {
      return apiError("not_found", "That file does not exist.", 404);
    }

    const file = await prisma.applicationFile.findFirst({
      where: { AND: [{ applicationId: filing.id }, { id: fileId }] },
      select: {
        originalName: true,
        mimeType: true,
        storageKey: true,
        sizeBytes: true,
        storageDriver: true,
      },
    });
    if (!file) {
      return apiError("not_found", "That file does not exist.", 404);
    }

    // Seeded fixtures carry metadata but no stored bytes (`prisma/seed.ts`
    // documents this contract). Answering here keeps the route honest and
    // skips a storage round trip that can only ever miss.
    if (file.storageDriver === "seed") {
      return apiError("not_found", "That file is recorded but missing from storage.", 404);
    }

    const stored = await getObject(file.storageKey);
    if (!stored) {
      return apiError("not_found", "The file is recorded but missing from storage.", 404);
    }

    return new NextResponse(new Uint8Array(stored.body), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType || stored.contentType,
        "Content-Length": String(file.sizeBytes),
        // The filename is server-chosen: the client's `download` attribute, if it
        // set one, would rename the file the operator actually uploaded. RFC 5987
        // because a real name is usually not Latin-1.
        "Content-Disposition": contentDisposition(file.originalName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);