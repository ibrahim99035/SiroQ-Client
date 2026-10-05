import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AnalysisServiceError,
  analysisServiceEnabled,
  enqueueAnalysis,
  engineVersionFromReport,
  ensureAnalysisApplication,
  fetchClientReport,
  fetchStoredDigests,
  getAnalysis,
  registerFilesByUpload,
  registerFilesByUrl,
  type AnalysisStatus,
} from "@/lib/analysis-client";
import { apiError, withErrorHandling } from "@/lib/api";
import { isAnalysableKind } from "@/lib/file-types";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAttachToApplication } from "@/lib/upload-access";
import { getObject, presignGet, storageDriver } from "@/lib/storage";
import { applicationWhere } from "@/lib/scopes";

/**
 * How long a signed read URL has to stay usable.
 *
 * It is minted at enqueue time but spent when the worker gets to the job, so it
 * has to outlast the queue, not the request. Two things set the floor: a backlog
 * behind one worker (a large filing takes minutes), and the service's
 * stale-job window, after which a job whose worker died is requeued — an hour
 * later, with the original URL long expired.
 *
 * Two hours covers both. The trade is that a leaked URL stays valid longer, which
 * is cheap here: it grants read access to one file the caller already holds, and
 * the service clears the URL from its own database as soon as it has the bytes.
 */
const PRESIGN_TTL_SECONDS = 7200;

const postSchema = z.object({
  /** Re-run even if a job is already in flight. */
  force: z.boolean().optional(),
});

/** Service status -> the client's own enum. */
const RUN_STATUS: Record<AnalysisStatus, "queued" | "running" | "succeeded" | "failed"> = {
  queued: "queued",
  running: "running",
  completed: "succeeded",
  failed: "failed",
};

function toServiceError(error: unknown): ReturnType<typeof apiError> {
  if (error instanceof AnalysisServiceError) {
    // 4xx from the service is about this request (bad files, unknown job) and is
    // the caller's problem; 5xx and unreachable are ours to report as a fault.
    const status = error.status >= 400 && error.status < 500 ? 400 : 503;
    return apiError(status === 400 ? "invalid" : "server_error", error.message, status);
  }
  throw error;
}

async function loadFiling(actor: Awaited<ReturnType<typeof requireUser>>, id: string) {
  return prisma.application.findFirst({
    where: { AND: [applicationWhere(actor), { id }] },
    select: {
      id: true,
      title: true,
      reference: true,
      associationId: true,
      pharmacyId: true,
      analysisApplicationId: true,
      analysisName: true,
    },
  });
}

/**
 * POST /api/applications/[id]/analysis
 *
 * Sends a filing's files to the analysis service and queues one analysis of them.
 *
 * Returns as soon as the job is durably queued. The analysis itself takes
 * minutes on a large filing — far longer than any request here could stay open —
 * so the response carries a run id and the client polls GET.
 *
 * Files are handed over as short-lived signed read URLs rather than uploaded:
 * the client's bucket is a different Neon branch, so the service has no
 * credentials for it, and streaming the bytes through this function would put a
 * whole filing inside a serverless request's wall-clock and body budget.
 */
export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That filing does not exist.", 404);
    }
    const parsedBody = postSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsedBody.success) {
      return apiError("invalid", parsedBody.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    if (!analysisServiceEnabled()) {
      // Off, or on with no API key. A dead button is worse than an absent one,
      // so the UI hides this action entirely in that state.
      return apiError(
        "conflict",
        "The analysis service is not available. Ask an administrator to enable it.",
        409,
      );
    }

    const filing = await loadFiling(actor, id);
    if (!filing) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    // Tenant-scoped, pharmacy-side: asking for an analysis of your own filing is
    // the same class of write as filing it. Delivery stays SiroQ-side
    // (`attachReport`) — this produces a draft, it does not report the filing.
    if (!canAttachToApplication(actor, filing)) {
      return apiError("forbidden", "You cannot request an analysis for this filing.", 403);
    }

    const files = await prisma.applicationFile.findMany({
      where: { applicationId: id },
      orderBy: { uploadedAt: "asc" },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
        checksumSha256: true,
        kind: true,
        parseState: true,
      },
    });

    if (files.length === 0) {
      return apiError("invalid", "This filing has no files to analyse.", 400);
    }
    // Two independent exclusions.
    //
    // Kind: only a dispensing ledger is analysable. Attachments (Power BI,
    // Tableau, raw exports) are evidence the filing carries but the service has
    // no reader for, and handing it an opaque binary would either fail the run
    // outright or be silently ingested as a garbage single-column table. Their
    // `parseState` is `pending`, so the `failed` test below would otherwise wave
    // them straight through.
    //
    // Parse state: the enum runs `pending -> parsing -> parsed -> failed`, but
    // only the intake route ever writes it, and it stops at `pending` (or jumps
    // to `failed`) — sheet contents are parsed on demand rather than at upload.
    // So `parsed` is a state a real upload never reaches, and filtering on it
    // would reject every genuine filing while letting the seeded fixtures
    // through. `failed` is the only value that means the bytes are unreadable.
    const usable = files.filter(
      (file) =>
        isAnalysableKind(file.kind) && file.parseState !== "failed",
    );
    const unreadable = files.filter(
      (file) => isAnalysableKind(file.kind) && file.parseState === "failed",
    );
    if (usable.length === 0) {
      const hasAttachments = files.some((file) => !isAnalysableKind(file.kind));
      const hasLedgers = files.some((file) => isAnalysableKind(file.kind));
      // Distinct messages, because the two states mean opposite things and the
      // old single sentence covered both as "could not be read" — implying a
      // corrupt file where the real situation is evidence we never meant to read.
      return apiError(
        "invalid",
        hasAttachments && !hasLedgers
          ? "This filing has no dispensing ledger to analyse. The attached files are stored as supporting evidence and are not read by the analysis service."
          : hasAttachments
            ? "Every dispensing ledger on this filing could not be read, so there is nothing to analyse. The attached supporting files were skipped."
            : "None of this filing's files could be read, so there is nothing to analyse.",
        400,
      );
    }

    // One in-flight job per filing unless the caller insists. Two concurrent runs
    // of the same bytes would race to write the same report.
    const inFlight = await prisma.analysisRun.findFirst({
      where: { applicationId: id, status: { in: ["queued", "running"] } },
      select: { id: true },
    });
    if (inFlight && !parsedBody.data.force) {
      return NextResponse.json({
        ok: true,
        runId: inFlight.id,
        alreadyRunning: true,
        status: "running" as const,
      });
    }

    // Reuse the service-side application across runs so retries do not leave an
    // orphan application behind for every attempt.
    let analysisApplicationId = filing.analysisApplicationId;
    if (!analysisApplicationId) {
      try {
        const created = await ensureAnalysisApplication({
          name: filing.reference,
          metadata: {
            client_application_id: filing.id,
            title: filing.title,
          },
        });
        analysisApplicationId = created.id;
      } catch (error) {
        return toServiceError(error);
      }
      await prisma.application.update({
        where: { id },
        data: { analysisApplicationId, analysisName: filing.reference },
      });
    }

    const driver = storageDriver();
    try {
      // Registration is an insert on the service, so re-analysing a filing would
      // otherwise add a second copy of every file to the same service-side
      // application and double the work each time. Only files it does not already
      // hold are sent — and if it holds them all, there is nothing to hand over
      // and the job below is the only call needed.
      const stored = await fetchStoredDigests(analysisApplicationId);
      const missing = usable.filter((file) => !stored.has(file.checksumSha256));

      if (missing.length > 0) {
        if (driver === "neon") {
          const signed = await Promise.all(
            missing.map(async (file) => ({
              original_filename: file.originalName,
              source_url: (await presignGet(file.storageKey, PRESIGN_TTL_SECONDS)).url,
            })),
          );
          await registerFilesByUrl(analysisApplicationId, signed);
        } else {
          // Local driver: no bucket to sign against, so the bytes travel in the
          // body. Development only — this is exactly the path production avoids.
          const payloads = await Promise.all(
            missing.map(async (file) => {
              const object = await getObject(file.storageKey);
              if (!object) {
                throw new AnalysisServiceError(
                  `The stored file ${file.originalName} could not be read.`,
                  400,
                );
              }
              return {
                originalFilename: file.originalName,
                bytes: object.body,
                mimeType: object.contentType || file.mimeType,
              };
            }),
          );
          await registerFilesByUpload(analysisApplicationId, payloads);
        }
      }

      const job = await enqueueAnalysis(analysisApplicationId);

      const run = await prisma.analysisRun.create({
        data: {
          applicationId: id,
          status: RUN_STATUS[job.status] ?? "queued",
          analysisApplicationId,
          analysisId: job.analysis_id,
          requestedById: actor.id,
          requestPayload: {
            file_count: usable.length,
            registered_file_count: missing.length,
            // Split, because the two are different facts: an attachment was
            // never a candidate, whereas an unreadable ledger was one and
            // could not be used. One combined number implied the run had
            // rejected files it had simply never been offered.
            skipped_attachments: files.length - usable.length - unreadable.length,
            skipped_unreadable: unreadable.length,
            handoff: driver === "neon" ? "presigned-url" : "inline-upload",
          },
        },
        select: { id: true },
      });

      return NextResponse.json(
        { ok: true, runId: run.id, analysisId: job.analysis_id, status: job.status },
        { status: 202 },
      );
    } catch (error) {
      return toServiceError(error);
    }
  },
);

/**
 * GET /api/applications/[id]/analysis
 *
 * Polls the service for one run and, the first time it reports success, stores
 * the report against the filing.
 *
 * Storing on read rather than on write is deliberate: the service finishes the
 * job on its own schedule, so there is no callback to receive and nothing to
 * poll in the background. Whoever looks next is what collects the result. It is
 * idempotent — the same completed run returns the same stored report.
 */
export const GET = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    const filing = await loadFiling(actor, id);
    if (!filing) {
      return apiError("not_found", "That filing does not exist.", 404);
    }
    if (!canAttachToApplication(actor, filing)) {
      return apiError("forbidden", "You cannot view this filing's analysis.", 403);
    }

    const runId = new URL(request.url).searchParams.get("runId");
    const run = await prisma.analysisRun.findFirst({
      where: {
        applicationId: id,
        ...(runId ? { id: runId } : {}),
      },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        analysisApplicationId: true,
        analysisId: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
        requestedById: true,
      },
    });

    if (!run) {
      return NextResponse.json({ ok: true, status: null, runs: [] });
    }
    if (!run.analysisApplicationId || !run.analysisId) {
      return NextResponse.json({
        ok: true,
        status: run.status,
        runId: run.id,
        errorMessage: run.errorMessage,
      });
    }

    let job;
    try {
      job = await getAnalysis(run.analysisApplicationId, run.analysisId);
    } catch (error) {
      // A service outage must not look like a failed analysis, and must not
      // overwrite the run: the job may well still be going.
      return toServiceError(error);
    }

    const status = RUN_STATUS[job.status] ?? run.status;
    await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status,
        errorMessage: job.error_message ?? null,
        responseSummary: job.summary ?? undefined,
        completedAt: job.completed_at ? new Date(job.completed_at) : run.completedAt,
        startedAt: job.started_at ? new Date(job.started_at) : run.startedAt,
      },
    });

    if (status !== "succeeded") {
      return NextResponse.json({
        ok: true,
        runId: run.id,
        status,
        errorMessage: job.error_message ?? null,
      });
    }

    let report: Record<string, unknown> | null = null;
    try {
      report = await fetchClientReport(run.analysisApplicationId, run.analysisId);
    } catch (error) {
      return toServiceError(error);
    }

    if (!report) {
      return NextResponse.json({
        ok: true,
        runId: run.id,
        status,
        reportStored: false,
      });
    }

    // Only ever replaces a report this same integration wrote. A manually
    // attached report is a human decision about what was delivered, and a later
    // analysis must not quietly overwrite it.
    const existing = await prisma.report.findUnique({
      where: { applicationId: id },
      select: { id: true, source: true },
    });
    if (existing && existing.source !== "service") {
      return NextResponse.json({
        ok: true,
        runId: run.id,
        status,
        reportStored: false,
        reason: "A manually attached report already exists and was left untouched.",
      });
    }

    await prisma.report.upsert({
      where: { applicationId: id },
      create: {
        applicationId: id,
        status: "draft",
        source: "service",
        resultData: report as object,
        rawData: JSON.stringify(report, null, 2),
        generatedById: run.requestedById,
        engineVersion: engineVersionFromReport(report),
      },
      update: {
        status: "draft",
        source: "service",
        resultData: report as object,
        rawData: JSON.stringify(report, null, 2),
        generatedById: run.requestedById,
        engineVersion: engineVersionFromReport(report),
      },
    });

    return NextResponse.json({
      ok: true,
      runId: run.id,
      status,
      reportStored: true,
    });
  },
);
