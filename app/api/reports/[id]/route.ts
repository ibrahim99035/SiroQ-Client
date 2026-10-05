import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { applicationWhere } from "@/lib/scopes";

/**
 * 4 MB of UTF-8 text, matching the manual attach limit in
 * `app/api/applications/[id]/report/route.ts`. Without a ceiling, a save from
 * the rich-text editor could grow a report past what the attach path accepts,
 * and then the filing could never be re-reported.
 */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const patchSchema = z.object({
  /**
   * The whole projection is replaced rather than merged. The editor holds the
   * document it was given and writes back a complete one, so a merge would
   * resurrect keys a super admin had just deleted.
   */
  resultData: z.record(z.string(), z.unknown()).optional(),
  rawData: z.string().optional(),
});

export const PATCH = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();

    try {
      requirePermission(actor, "editReport");
    } catch {
      return apiError("forbidden", "Only super admins may edit reports.", 403);
    }

    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That report does not exist.", 404);
    }

    let body: z.infer<typeof patchSchema>;
    try {
      body = patchSchema.parse(await request.json());
    } catch (_) {
      return apiError("invalid", "Invalid report update payload.", 400);
    }

    const existing = await prisma.report.findFirst({
      where: {
        id,
        application: { AND: [applicationWhere(actor)] },
      },
      select: { id: true, rawData: true },
    });

    if (!existing) {
      return apiError("not_found", "That report does not exist.", 404);
    }

    // Measured on bytes, not string length: the limit is a storage limit, and a
    // document full of multi-byte characters is fewer characters than bytes.
    const nextRaw = body.rawData ?? existing.rawData;
    if (Buffer.byteLength(nextRaw, "utf8") > MAX_DOCUMENT_BYTES) {
      return apiError(
        "invalid",
        `The report document is ${Math.round(Buffer.byteLength(nextRaw, "utf8") / 1024)} KB. The limit is 4096 KB.`,
        413,
      );
    }

    const updated = await prisma.report.update({
      where: { id },
      data: {
        ...(body.resultData !== undefined
          ? { resultData: body.resultData as object }
          : {}),
        ...(body.rawData !== undefined ? { rawData: body.rawData } : {}),
      },
      select: {
        id: true,
        applicationId: true,
        resultData: true,
        rawData: true,
        status: true,
        source: true,
        generatedAt: true,
        engineVersion: true,
      },
    });

    return NextResponse.json({ ok: true, report: updated });
  },
);
