/**
 * Browser-side API client.
 *
 * Server routes answer with a normalised envelope — `{ ok: true, ... }` on
 * success, `{ error: { code, message } }` on failure — and every server helper
 * in `lib/api.ts` is `server-only`, so components cannot import it. This is the
 * client mirror: one place that unwraps the envelope, turns a failure into a
 * typed `ApiError`, and keeps network faults distinguishable from refusals.
 *
 * Note the non-JSON branch. A mis-deployed or partially built Next app can
 * answer an API path with an HTML error page (this happened in practice: a
 * stale `.next` made `/api/uploads/[id]/content` return the 404 page, and
 * `response.json()` failed with a bare "Unexpected token '<'" that told the user
 * nothing). Detecting the content type lets us say what actually happened.
 */

export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid"
  | "conflict"
  | "server_error";

/** A structured failure from the API, or a transport failure. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  /** True when the session is gone and the user must sign in again. */
  get isUnauthorized(): boolean {
    return this.code === "unauthorized";
  }

  /** True when the server could not be reached at all. */
  get isOffline(): boolean {
    return this.code === "server_error" && this.status === 0;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

const FALLBACK: Record<number, string> = {
  400: "That request could not be processed.",
  401: "Your session has expired. Sign in again to continue.",
  403: "You do not have permission to do that.",
  404: "That record no longer exists.",
  409: "That change conflicts with the current state.",
  500: "Something went wrong on our side. Please try again.",
};

function coerceCode(value: unknown): ApiErrorCode {
  switch (value) {
    case "unauthorized":
    case "forbidden":
    case "not_found":
    case "invalid":
    case "conflict":
    case "server_error":
      return value;
    default:
      return "server_error";
  }
}

/**
 * Performs a JSON request against an internal API route.
 *
 * Throws `ApiError` on any non-2xx response, on an unparseable body, and on a
 * transport failure (`status: 0`), so callers only need one `catch`.
 */
export async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const method = init?.method ?? "GET";
  const hasBody = init?.body !== undefined;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      // Session is an httpOnly cookie, so it rides along on same-origin fetch.
      // `credentials` is explicit because the default differs for some
      // fetch wrappers and a silently anonymous request looks like a permission
      // error rather than a bug.
      credentials: "same-origin",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(init?.body) : undefined,
      signal: init?.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("server_error", "Could not reach the server. Check your connection.", 0);
  }

  if (response.status === 204) return undefined as T;

  const isJson = response.headers.get("content-type")?.includes("application/json") ?? false;
  if (!isJson) {
    throw new ApiError(
      "server_error",
      response.ok
        ? "The server returned an unexpected response."
        : `The server returned an unexpected ${response.status} response. If this persists, rebuild the app.`,
      response.status,
    );
  }

  const payload = (await response.json().catch(() => null)) as (ErrorBody & T) | null;

  if (!response.ok) {
    const body = payload as ErrorBody | null;
    throw new ApiError(
      coerceCode(body?.error?.code),
      body?.error?.message ?? FALLBACK[response.status] ?? "The request failed.",
      response.status,
    );
  }

  return payload as T;
}

/** Convenience wrapper for a `POST`/`PATCH`/`DELETE` with a JSON body. */
export function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  return apiFetch<T>(path, { method, body });
}
