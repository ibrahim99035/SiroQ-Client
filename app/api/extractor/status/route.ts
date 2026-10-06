import "server-only";

import { NextResponse } from "next/server";

import { withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { geminiEnabled } from "@/lib/extractor/gemini";

export const GET = withErrorHandling(async () => {
  const actor = await requireUser();
  requirePermission(actor, "useExtractor");

  const keysRaw = (process.env.GEMINI_API_KEYS || "").trim();
  const keyCount = keysRaw ? keysRaw.split(",").map((k) => k.trim()).filter(Boolean).length : 0;
  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const allowUrl = (process.env.EXTRACTOR_ALLOW_URL || "false").trim() === "true";
  return NextResponse.json({
    ok: true,
    enabled: geminiEnabled(),
    model,
    keyCount,
    allowUrl,
  });
});
