import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Coarse authentication gate (Next 16 `proxy` convention).
 *
 * This is a UX shortcut only — it keeps signed-out visitors off the workspace
 * and off the server-rendered shell. It is deliberately NOT an authorization
 * boundary: it cannot see a role, and a cookie can be replayed. Every API route
 * re-checks the session and the caller's scope in `lib/auth.ts` /
 * `lib/scopes.ts`.
 *
 * Public routes are handled by the proxy matcher instead of a prefix list, so a
 * new authenticated route is protected by default rather than by remembering
 * to add it here. The exceptions below are the only intentional openings.
 */

/**
 * Routes reachable without a session. The marketing site is public; the auth
 * screens obviously are.
 *
 * `/dashboard` is intentionally absent: it renders its own signed-out state
 * rather than bouncing, so the user sees context instead of a redirect loop.
 */
const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/terms",
  "/privacy",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Presence check only. A forged or stale cookie passes this gate and is
  // rejected properly by the server-side session lookup.
  if (request.cookies.has("siroq_session")) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Protect everything except:
     *   - Next.js internals (`_next/static`, `_next/image`, ...)
     *   - files with a static extension (favicon, images, fonts, sitemap, ...)
     *   - `/api/*` — each route guards itself, so failures return JSON 401/403
     *     with a correct status instead of an HTML redirect.
     *
     * Public marketing pages are excluded via `PUBLIC_PATHS` above, not here.
     */
    "/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml|webmanifest)$).*)",
  ],
};

