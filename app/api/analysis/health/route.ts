import "server-only";

import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api";
import { analysisServiceEnabled, pingService } from "@/lib/analysis-client";
import { requireUser } from "@/lib/auth";

/**
 * GET /api/analysis/health — is the analysis service awake?
 *
 * The one thing the rest of the analysis integration cannot answer. Starting and
 * polling runs live at `/api/applications/[id]/analysis`, and neither of those
 * reports on the service itself: an unreachable service surfaces as a failed run,
 * which reads like a bad filing rather than a sleeping deployment.
 *
 * ## Why this exists at all
 *
 * The service is on Render's free tier, so it suspends when idle and cold-starts
 * on the next request — measured ~27s here, against ~2s once warm. Two things
 * follow:
 *
 * - The sidebar's Wake button needs something to call that *only* checks
 *   reachability, so waking is a deliberate act rather than a side effect of
 *   trying to do real work.
 * - That wait has to be tolerated. It is why `pingService` carries its own, longer
 *   deadline than the rest of the client: sharing the 20s work budget guaranteed
 *   the button's first press timed out, and because a timed-out request still
 *   finishes booting the service, the second press would succeed and look like a
 *   flake.
 *
 * ## Why nothing polls it
 *
 * There is no interval on the caller and no background ping here. A probe that
 * repeated itself would hold the service awake almost permanently, spending the
 * monthly allowance that suspending exists to protect. Reachability is checked
 * when someone asks.
 */
export const GET = withErrorHandling(async () => {
  await requireUser();

  // Unconfigured deployments render no control at all, so there is nothing to
  // report — say so plainly rather than as a failure.
  if (!analysisServiceEnabled()) {
    return NextResponse.json({ enabled: false, reachable: null, service: null });
  }

  try {
    const health = await pingService();
    return NextResponse.json({
      enabled: true,
      reachable: true,
      service: { status: health.status, db: health.db },
    });
  } catch {
    // Deliberately not thrown. "Asleep" is an ordinary state for a service that
    // suspends on purpose, and it is exactly what the caller wants to draw; a
    // 5xx would collapse that into a generic error and lose the distinction
    // between "you pressed the button" and "something is broken".
    return NextResponse.json({ enabled: true, reachable: false, service: null });
  }
});