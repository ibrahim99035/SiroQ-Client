import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getObject, putObject } from "@/lib/storage";
import { EXTRACTOR_EXTENSIONS } from "@/lib/file-types";
import { sniffMimeFromBytes } from "@/lib/extractor/source";
import { geminiEnabled } from "@/lib/extractor/gemini";

const postSchema = z.object({
  uploadId: z.string().uuid().optional(),
  url: z.string().url().optional(),
});

export const POST = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();
  requirePermission(actor, "useExtractor");

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const maxIn = Number(process.env.EXTRACTOR_MAX_INPUT_BYTES) || 15000000;
  const maxConc = Number(process.env.EXTRACTOR_MAX_CONCURRENT_PER_USER) || 2;
  const maxHr = Number(process.env.EXTRACTOR_MAX_RUNS_PER_USER_PER_HOUR) || 30;
  const allowUrl = (process.env.EXTRACTOR_ALLOW_URL || "false").trim() === "true";

  if (!geminiEnabled()) return apiError("conflict", "Extractor not configured.", 409);

  if (!parsed.data.uploadId && !parsed.data.url) return apiError("invalid", "uploadId or url required.", 400);
  if (parsed.data.url && !allowUrl) return apiError("invalid", "URL input disabled.", 400);

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const live = await prisma.extractionRun.count({
    where: { requestedById: actor.id, status: { in: ["queued", "running"] } },
  });
  if (live >= maxConc) return apiError("conflict", "Too many concurrent extractions.", 429);
  const hrCount = await prisma.extractionRun.count({
    where: { requestedById: actor.id, startedAt: { gt: hourAgo } },
  });
  if (hrCount >= maxHr) return apiError("conflict", "Hourly limit reached.", 429);

  if (parsed.data.uploadId) {
    const upload = await prisma.upload.findUnique({ where: { id: parsed.data.uploadId } });
    if (!upload || upload.uploadedById !== actor.id) return apiError("not_found", "Upload not found.", 404);
    if (upload.state !== "ready") return apiError("conflict", "Upload not ready.", 409);
    const liveUpload = await prisma.extractionRun.findFirst({
      where: { uploadId: upload.id, status: { in: ["queued", "running"] } },
    });
    if (liveUpload) {
      return NextResponse.json({ ok: true, runId: liveUpload.id, alreadyRunning: true }, { status: 202 });
    }
    const ext = upload.originalName.slice(upload.originalName.lastIndexOf(".")).toLowerCase();
    if (!([...EXTRACTOR_EXTENSIONS] as string[]).includes(ext)) {
      return apiError("invalid", "Unsupported file type.", 415);
    }
    const obj = await getObject(upload.storageKey);
    if (!obj) return apiError("not_found", "Upload object not found.", 404);
    const bytes = obj.body;
    if (bytes.length > maxIn) return apiError("invalid", `File too large. Limit ${Math.round(maxIn/1024/1024)} MB.`, 413);
    const sniff = sniffMimeFromBytes(bytes);
    const mime = sniff || upload.mimeType;
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const outKey = `extractions/source/${randomUUID()}`;
    await putObject(outKey, bytes, mime);
    const run = await prisma.extractionRun.create({
      data: {
        status: "queued",
        source: "upload",
        sourceName: upload.originalName,
        sourceMime: mime,
        sourceBytes: bytes.length,
        sourceChecksum: checksum,
        uploadId: upload.id,
        model,
        requestedById: actor.id,
        outputKey: outKey,
      },
    });
    return NextResponse.json({ ok: true, runId: run.id }, { status: 202 });
  }

  return apiError("invalid", "URL not implemented yet.", 400);
});
