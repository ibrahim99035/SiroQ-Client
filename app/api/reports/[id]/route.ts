import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applicationWhere } from "@/lib/scopes";

const patchSchema = z.object({
  resultData: z.any().optional(),
  rawData: z.string().optional(),
});

export const PATCH = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    if (actor.role !== "super_admin") {
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
      select: { id: true },
    });

    if (!existing) {
      return apiError("not_found", "That report does not exist.", 404);
    }

    const updated = await prisma.report.update({
      where: { id },
      data: {
        ...(body.resultData !== undefined ? { resultData: body.resultData } : {}),
        ...(body.rawData !== undefined ? { rawData: body.rawData } : {}),
      },
      select: {
        id: true,
        applicationId: true,
        resultData: true,
        rawData: true,
        status: true,
        
        
        
      },
    });

    return NextResponse.json({ ok: true, report: updated });
  },
);
