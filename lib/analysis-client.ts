import "server-only";

/**
 * HTTP client for the SiroQ Analysis Service.
 *
 * Server-only by construction: it holds the service API key, which must never
 * reach the browser. Every route that touches it runs on the server.
 *
 * The service is treated as unreliable infrastructure, not a local function. It
 * is separately deployed, separately scaled and can be down while the filing
 * system is up, so every failure mode here surfaces as a typed error the routes
 * can turn into a message the user can act on — never as a hung request or an
 * unhandled rejection.
 */

const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api/v1";
const DEFAULT_TIMEOUT_MS = 30_000;

export type AnalysisStatus = "queued" | "running" | "completed" | "failed";

export interface AnalysisJob {
  application_id: string;
  analysis_id: string;
  status: AnalysisStatus;
  created_at: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  summary?: unknown;
  report?: unknown;
}

export class AnalysisServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AnalysisServiceError";
    this.status = status;
  }
}

function baseUrl(): string {
  const raw = (process.env.ANALYSIS_SERVICE_BASE_URL || DEFAULT_BASE_URL).trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function apiKey(): string {
  return (process.env.ANALYSIS_SERVICE_API_KEY || "").trim();
}

/**
 * Is the integration switched on *and* usable?
 *
 * Enabled but unconfigured is treated as off. A half-configured integration
 * should not produce a button that fails on click; it should not appear at all.
 */
export function analysisServiceEnabled(): boolean {
  return (
    (process.env.ANALYSIS_SERVICE_ENABLED || "").toLowerCase() === "true" &&
    apiKey().length > 0
  );
}

function timeoutMs(): number {
  const raw = Number(process.env.ANALYSIS_SERVICE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * Deadline for the wake probe specifically, and it is deliberately the one call
 * that outranks `ANALYSIS_SERVICE_TIMEOUT_MS`.
 *
 * Waking a suspended service is the *point* of the call: measured ~27s on the
 * free Render deployment, against a 20s budget for ordinary work. Sharing that
 * budget guaranteed the button's first press always timed out — and since the
 * timeout still finishes the boot, the second press would succeed and look like
 * the first had merely been unlucky.
 *
 * Capped below this runtime's own function ceiling, because a value above the
 * platform limit is not patience: it is a timeout that can never fire, and the
 * request dies with an opaque platform error instead of our own.
 */
const WAKE_TIMEOUT_MS = 45_000;

function wakeTimeoutMs(): number {
  const raw = Number(process.env.ANALYSIS_WAKE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, WAKE_TIMEOUT_MS) : WAKE_TIMEOUT_MS;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${baseUrl()}${path}`;
  // `fetch` derives the multipart boundary itself, and only if it is allowed to
  // set the header. Declaring `application/json` over a FormData body sends a
  // request the service cannot parse — a confusing 422 that looks like a schema
  // problem rather than the transport being wrong.
  const multipart = typeof FormData !== "undefined" && init.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs()),
      headers: {
        ...(multipart ? {} : { "Content-Type": "application/json" }),
        "X-API-Key": apiKey(),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AnalysisServiceError(
      `The analysis service could not be reached (${reason}). It may be starting up or temporarily unavailable.`,
      503,
    );
  }

  if (!response.ok) {
    throw new AnalysisServiceError(await readDetail(response), response.status);
  }
  return (await response.json()) as T;
}

/**
 * Turn an error response into something a user can read.
 *
 * The service puts its reason in `detail`, which is a string for its own
 * HTTPException and a list for a pydantic validation failure. Both are handled,
 * because the difference decides whether the message is "no files to analyze"
 * or "field required".
 */
async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: unknown };
      if (typeof first?.msg === "string") return first.msg;
    }
  } catch {
    // Fall through: a non-JSON error body is still an error worth reporting.
  }
  return `The analysis service returned HTTP ${response.status}.`;
}

/**
 * The analysis service's application for this filing, created on first use.
 *
 * Idempotent by name: the client stores the id on its own Application row, so a
 * retry after a timeout reuses the same service-side application instead of
 * leaving an orphan behind.
 */
export async function ensureAnalysisApplication(params: {
  name: string;
  metadata: Record<string, unknown>;
}): Promise<{ id: string }> {
  return request<{ id: string }>("/applications", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * The SHA-256 of every file the service has finished fetching for an application.
 *
 * Registration on the service is a plain insert, so re-analysing a filing would
 * otherwise append a second copy of every file to the same service-side
 * application and quietly double the work each time. Asking the service what it
 * holds is the only check that stays correct without extra bookkeeping: it also
 * covers the case where registration succeeded but the response never made it
 * back here.
 *
 * Both sides hash the whole file the same way — the client when the upload
 * completes, the service when it stores the bytes it fetched — so the digests
 * are directly comparable.
 *
 * Files the service has registered but not yet fetched are deliberately absent.
 * They are transient, they have no digest to compare, and handing over a fresh
 * URL for one is exactly what a retry needs after the old URL expired.
 */
export async function fetchStoredDigests(analysisApplicationId: string): Promise<Set<string>> {
  const body = await request<{
    files: Array<{ sha256: string | null }>;
  }>(`/applications/${analysisApplicationId}`);

  return new Set((body.files ?? []).map((file) => file.sha256).filter((d): d is string => !!d));
}

/** Register files the service will fetch itself, given signed read URLs. */
export async function registerFilesByUrl(
  analysisApplicationId: string,
  files: Array<{ original_filename: string; source_url: string }>,
): Promise<{
  application_id: string;
  registered: Array<{ file_id: string; original_filename: string; status: string }>;
}> {
  return request(`/applications/${analysisApplicationId}/files/by-url`, {
    method: "POST",
    body: JSON.stringify({ files }),
  });
}

/**
 * Register files by streaming them through this request.
 *
 * Only for the local storage driver, which cannot produce a signed URL. The
 * bytes are short-lived and only exist locally, so this path is for development
 * — production hands over URLs and keeps the file off the request entirely.
 */
export async function registerFilesByUpload(
  analysisApplicationId: string,
  files: Array<{ originalFilename: string; bytes: Buffer; mimeType: string }>,
): Promise<{ application_id: string; registered: Array<{ file_id: string }> }> {
  const form = new FormData();
  for (const file of files) {
    form.append(
      "files",
      new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }),
      file.originalFilename,
    );
  }
  return request(`/applications/${analysisApplicationId}/files?defer=true`, {
    method: "POST",
    body: form,
  });
}

/** Queue an analysis. Returns as soon as the job is durably recorded. */
export async function enqueueAnalysis(analysisApplicationId: string): Promise<AnalysisJob> {
  return request(`/applications/${analysisApplicationId}/analyses`, { method: "POST" });
}

/** Poll one job. Cheap: it is a single indexed row. */
export async function getAnalysis(
  analysisApplicationId: string,
  analysisId: string,
): Promise<AnalysisJob> {
  return request(
    `/applications/${analysisApplicationId}/analyses/${analysisId}`,
    { method: "GET" },
  );
}

/**
 * The report, projected into the shape the client's renderer consumes.
 *
 * Returns `null` when the job has not produced one yet. The service answers 409
 * in that case, which is a normal state of the world rather than a failure, so
 * it is translated here instead of surfacing as an error the caller must know to
 * ignore.
 */
export async function fetchClientReport(
  analysisApplicationId: string,
  analysisId: string,
): Promise<Record<string, unknown> | null> {
  const url = `${baseUrl()}/applications/${analysisApplicationId}/analyses/${analysisId}/report?format=client`;
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs()),
      headers: { "X-API-Key": apiKey() },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AnalysisServiceError(
      `The analysis service could not be reached (${reason}).`,
      503,
    );
  }
  if (response.status === 409) return null;
  if (!response.ok) {
    throw new AnalysisServiceError(await readDetail(response), response.status);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Engine version recorded alongside a stored report, for provenance. */
  export function engineVersionFromReport(report: Record<string, unknown> | null): string | null {
    if (!report) return null;
    const value = report["Engine version"];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  /** What `/health` reports. */
  export interface ServiceHealth {
    status: string;
    service?: string;
    db?: string;
  }

  /**
   * The service's origin, with the API prefix stripped off.
   *
   * `/health` is registered on the app itself rather than on the `/api/v1`
   * router, so it is not reachable through the configured API root: asking
   * `baseUrl()` for it yields a 404 that reads exactly like a wrong deployment.
   * Stripping the suffix — rather than asking for a second configured URL —
   * keeps one setting as the single source of the service's address.
   */
  function originUrl(): string {
    return baseUrl().replace(/\/api\/v\d+$/, "");
  }

  /**
   * Probe `/health`, which is also what wakes a suspended service.
   *
   * The service runs on Render's free tier, so it suspends after a spell of no
   * traffic and cold-starts on the next request. Nothing in this client polls it:
   * a repeating probe would keep the process awake and spend the monthly
   * allowance that suspending exists to protect. Reachability is therefore
   * checked only when someone asks — from the sidebar card's Refresh button, or
   * at the head of a status read.
   *
   * Worth exposing separately from real work, because the first request after idle
   * pays the cold start and measured ~27s on the free deployment. Probing on its
   * own lets the UI report "waking" instead of failing the call that was meant to
   * do the work.
   */
  export async function pingService(): Promise<ServiceHealth> {
    const response = await fetch(`${originUrl()}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(wakeTimeoutMs()),
      headers: { "X-API-Key": apiKey() },
    });
    if (!response.ok) {
      throw new AnalysisServiceError(await readDetail(response), response.status);
    }
    return (await response.json()) as ServiceHealth;
  }
