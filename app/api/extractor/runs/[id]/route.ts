import "server-only";

import { NextResponse } from "next/server";

import type { ExtractionRun, ExtractionErrorCode as ExtractionErrorCodeDb, Prisma } from "@prisma/client";
import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { putObject } from "@/lib/storage";
import { extractTables, GeminiError, geminiEnabled, type GeminiErrorCode } from "@/lib/extractor/gemini";
import { buildCsv, normaliseTable, splitTables } from "@/lib/extractor/csv";
import { sniffMimeFromBytes } from "@/lib/extractor/source";

const GEMINI_TO_DB_CODE: Record<GeminiErrorCode, ExtractionErrorCodeDb> = {
  DISABLED: "UPSTREAM_UNAVAILABLE",
  INPUT_UNREADABLE: "INPUT_UNREADABLE",
  TOO_LARGE: "TOO_LARGE",
  UPSTREAM_QUOTA: "UPSTREAM_QUOTA",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  UPSTREAM_REFUSED: "UPSTREAM_REFUSED",
  BLOCKED_BY_SAFETY: "BLOCKED_BY_SAFETY",
  OUTPUT_TRUNCATED: "OUTPUT_TRUNCATED",
};

export const GET = withErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) => {
  const actor = await requireUser();
  requirePermission(actor, "useExtractor");

  const { id } = await params;
  const run = await prisma.extractionRun.findUnique({ where: { id } });
  if (!run || run.requestedById !== actor.id) {
    return apiError("not_found", "Run not found.", 404);
  }
  if (run.status === "succeeded") {
    return NextResponse.json({
      ok: true,
      run: serialise(run),
      csvUrl: run.outputKey ? `/api/extractor/runs/${run.id}/csv` : null,
    });
  }
  if (run.status === "failed") {
    return NextResponse.json({ ok: true, run: serialise(run), csvUrl: null });
  }

  // queued -> running, do work
  await prisma.extractionRun.update({ where: { id: run!.id }, data: { status: "running", startedAt: new Date() } });
  const maxIn = Number(process.env.EXTRACTOR_MAX_INPUT_BYTES) || 15000000;
  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();

  try {
    if (!geminiEnabled()) throw new GeminiError("DISABLED", "Extractor is not configured on this deployment.", 409);
    const { getObject } = await import("@/lib/storage");
    const objSrc = await getObject(run.outputKey || `extractions/source/${run.id}`);
    if (!objSrc) throw new GeminiError("INPUT_UNREADABLE", "Source missing.", 404);
    const bytes = objSrc.body;
    if (bytes.length > maxIn) {
      throw new GeminiError("TOO_LARGE", `That file is ${Math.round(bytes.length/1024/1024)} MB. The limit is ${Math.round(maxIn/1024/1024)} MB.`, 413);
    }
    const mime = sniffMimeFromBytes(bytes) || run.sourceMime;
    const base64 = bytes.toString("base64");
    const res = await extractTables({ mimeType: mime, base64 });
    const text = res.text.trim();
    const mode = ((process.env.EXTRACTOR_CSV_MODE || "separate") as "separate" | "concat");
    if (text === "NO_TABLE_FOUND") {
      await prisma.extractionRun.update({
        where: { id: run.id },
        data: { status: "failed", completedAt: new Date(), errorCode: "NO_TABLE_FOUND", errorMessage: "No tables found in the document." },
      });
      return NextResponse.json({ ok: true, run: serialise(await prisma.extractionRun.findUnique({ where: { id: run!.id } })!), csvUrl: null });
    }
    if (text === "INPUT_UNREADABLE") {
      await prisma.extractionRun.update({
        where: { id: run.id },
        data: { status: "failed", completedAt: new Date(), errorCode: "INPUT_UNREADABLE", errorMessage: "Input unreadable." },
      });
      return NextResponse.json({ ok: true, run: serialise(await prisma.extractionRun.findUnique({ where: { id: run!.id } })!), csvUrl: null });
    }
    const { blocks } = splitTables(text);
    const tables = blocks.map((b) => normaliseTable(b));
    const tableCount = tables.filter((t) => t.headers.length > 0 || t.rows.length > 0).length;
    const csv = buildCsv(tables, mode);
    const outKey = `extractions/${new Date().toISOString().slice(0,10)}/${run.id}/tables.csv`;
    await putObject(outKey, Buffer.from(csv, "utf8"), "text/csv; charset=utf-8");
    await prisma.extractionRun.update({
      where: { id: run.id },
      data: {
        status: "succeeded",
        completedAt: new Date(),
        tableCount,
tables: tables as unknown as Prisma.InputJsonValue,
        csvBytes: Buffer.byteLength(csv, "utf8"),
        csvTruncated: res.finishReason === "MAX_TOKENS",
        outputKey: outKey,
        outputName: `${run.sourceName.replace(/\.[^.]+$/, "")}_tables.csv`,
        finishReason: res.finishReason || null,
        keySlot: res.keySlot,
        attempts: res.attempts,
        model,
      },
    });
    const final = await prisma.extractionRun.findUnique({ where: { id: run.id } });
    return NextResponse.json({ ok: true, run: serialise(final!), csvUrl: `/api/extractor/runs/${run.id}/csv` });
  } catch (err: unknown) {
    if (err instanceof GeminiError) {
      await prisma.extractionRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          completedAt: new Date(),
          errorCode: GEMINI_TO_DB_CODE[err.code],
          errorMessage: err.message,
        },
      });
    } else {
      await prisma.extractionRun.update({
        where: { id: run.id },
        data: { status: "failed", completedAt: new Date(), errorCode: "UPSTREAM_UNAVAILABLE", errorMessage: err instanceof Error ? err.message : "upstream unavailable" },
      });
    }
    const final = await prisma.extractionRun.findUnique({ where: { id: run.id } });
    return NextResponse.json({ ok: true, run: serialise(final!), csvUrl: null });
  }
});

function serialise(run: ExtractionRun | null): ExtractionRun | null {
  return run;
}
