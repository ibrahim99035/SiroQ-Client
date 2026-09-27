import "server-only";

import { NextResponse } from "next/server";

import { AuthError } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";

/** Normalised error body returned by every API route. */
export interface ApiErrorBody {
  error: {
    code: "unauthorized" | "forbidden" | "not_found" | "invalid" | "conflict" | "server_error";
    message: string;
  };
}

export function apiError(
  code: ApiErrorBody["error"]["code"],
  message: string,
  status: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Maps a thrown value onto a safe HTTP response. Never leaks internals. */
export function handleApiError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof AuthError) {
    return apiError(
      error.status === 401 ? "unauthorized" : "forbidden",
      error.message,
      error.status,
    );
  }
  if (error instanceof PermissionError) {
    return apiError("forbidden", error.message, 403);
  }
  console.error("[api] unhandled error:", error);
  return apiError("server_error", "Something went wrong on our side. Please try again.", 500);
}

/** Wraps a route handler so thrown AuthErrors/PermissionErrors become proper status codes. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}
