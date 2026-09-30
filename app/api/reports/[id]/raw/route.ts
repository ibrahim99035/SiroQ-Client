import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applicationWhere } from "@/lib/scopes";

/**
 * GET /api/reports/[id]/raw
 *
 * The attached document, fetched only when the report panel's raw toggle is
 * opened.
 *
 * This exists so `raw_data` can be up to 4 MB without being inlined into every
 * application row: a list of 50 filings would otherwise carry 200 MB of report
 * text that the list never renders. It is still scope-checked through
 * `applicationWhere`, because a report is reachable by guessing its id
 * otherwise — and the report is the deliverable the pharmacy receives.
 */
export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That report does not exist.", 404);
    }

    const report = await prisma.report.findFirst({
      where: {
        id,
        // Scope is resolved through the parent filing, so a report inherits
        // exactly the visibility of the filing it belongs to.
        application: { AND: [applicationWhere(actor)] },
      },
      select: { rawData: true, applicationId: true },
    });

    if (!report) {
      return apiError("not_found", "That report does not exist.", 404);
    }

    return NextResponse.json({
      ok: true,
      applicationId: report.applicationId,
      rawData: report.rawData,
    });
  },
);
