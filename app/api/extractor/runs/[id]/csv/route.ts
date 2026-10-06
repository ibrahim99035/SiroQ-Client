import "server-only";

import { NextResponse } from "next/server";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";
import type { NormalisedTable } from "@/lib/extractor/csv";
import { contentDisposition } from "@/lib/content-disposition";

interface StoredTable {
  headers?: string[];
  rows?: string[][];
}

export const GET = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requirePermission(actor, "useExtractor");

  const { id } = await params;
  const run = await prisma.extractionRun.findUnique({ where: { id } });
  if (!run || run.requestedById !== actor.id) {
    return apiError("not_found", "Run not found.", 404);
  }
  if (run.status !== "succeeded" || !run.outputKey || !run.outputName) {
    return apiError("invalid", "Run not complete.", 400);
  }

  const url = new URL(request.url);
  const idx = url.searchParams.get("index");
  const index = idx ? Number.parseInt(idx, 10) : null;

  const objBody = await getObject(run.outputKey);
  const body = objBody ? objBody.body : Buffer.from("");
  if (index !== null && !Number.isNaN(index) && run.tables && Array.isArray(run.tables)) {
    const t = run.tables[index] as unknown as StoredTable | null;
    if (typeof t !== "object" || t === null) return apiError("not_found", "Table not found.", 404);
    const headers = t.headers || [];
    const rows = t.rows || [];
    const { buildCsv } = await import("@/lib/extractor/csv");
    const nt: NormalisedTable = { headers, rows, headerInferred: false, raggedRows: 0 };
    const csv = buildCsv([nt], "separate");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`${run.outputName.replace(/\.csv$/i, "")}_table_${index + 1}.csv`),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  return new NextResponse(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(run.outputName),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
