import "server-only";

import { extractorSystemPrompt } from "./prompt";

export type GeminiErrorCode =
  | "DISABLED"
  | "INPUT_UNREADABLE"
  | "TOO_LARGE"
  | "UPSTREAM_QUOTA"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_REFUSED"
  | "BLOCKED_BY_SAFETY"
  | "OUTPUT_TRUNCATED";

export class GeminiError extends Error {
  code: GeminiErrorCode;
  status: number;
  constructor(code: GeminiErrorCode, message: string, status: number) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
    this.status = status;
  }
}

function keys(): string[] {
  const raw = (process.env.GEMINI_API_KEYS || "").trim();
  if (!raw) return [];
  const parts = raw.split(",").map((k) => k.trim()).filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((k) => {
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function geminiEnabled(): boolean {
  const ks = keys();
  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  return ks.length > 0 && model.length > 0;
}

interface ExtractTablesResult {
  text: string;
  finishReason?: string;
  keySlot: number;
  attempts: number;
}

interface CooldownMap {
  map: Map<number, number>;
}

interface GeminiContentPart {
  text?: string;
  inlineData?: { data?: string };
}

interface GeminiCandidate {
  content?: { parts?: GeminiContentPart[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

function cooldowns(): CooldownMap {
  const g = globalThis as unknown as { __geminiCooldowns?: CooldownMap };
  if (!g.__geminiCooldowns) g.__geminiCooldowns = { map: new Map() };
  return g.__geminiCooldowns;
}

function now(): number {
  return Date.now();
}

export async function extractTables(input: {
  mimeType: string;
  base64: string;
  maxOutputTokens?: number;
}): Promise<ExtractTablesResult> {
  if (!geminiEnabled()) {
    throw new GeminiError("DISABLED", "Extractor is not configured on this deployment.", 409);
  }

  const ks = keys();
  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const timeoutMs = Math.max(1000, Number(process.env.GEMINI_TIMEOUT_MS) || 45000);
  const maxOut = Number(input.maxOutputTokens ?? process.env.EXTRACTOR_MAX_OUTPUT_TOKENS ?? 32768) || 32768;
  const cooldownMs = Math.max(0, Number(process.env.EXTRACTOR_KEY_COOLDOWN_MS) || 60000);
  const baseUrl = (process.env.GEMINI_BASE_URL || "").trim() || `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const cd = cooldowns();

  let attempts = 0;
  const systemPrompt = extractorSystemPrompt();

  for (let i = 0; i < ks.length; i += 1) {
    const slot = i;
    const until = cd.map.get(slot);
    if (until && until > now()) continue;

    const key = ks[slot];
    let triesOnKey = 0;
    while (triesOnKey < 3) {
      attempts += 1;
      triesOnKey += 1;
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(baseUrl.includes("generativelanguage") ? `${baseUrl}?key=${encodeURIComponent(String(key))}` : baseUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ inlineData: { mimeType: input.mimeType, data: input.base64 } }] }],
            generationConfig: { temperature: 0, maxOutputTokens: maxOut, responseMimeType: "text/plain" },
          }),
          signal: controller.signal,
        });
        clearTimeout(t);

        if (res.status === 429) {
          cd.map.set(slot, now() + cooldownMs);
          break; // rotate
        }
        if (res.status === 401 || res.status === 403) {
          const body = await res.text().catch(() => "");
          if (body.includes("quota") || body.includes("RESOURCE_EXHAUSTED") || body.includes("rate")) {
            cd.map.set(slot, now() + cooldownMs);
            break; // rotate
          }
          // auth issue for this key
          cd.map.set(slot, now() + cooldownMs * 10);
          break; // rotate
        }
        if (res.status === 400) {
          const body = await res.text().catch(() => "");
          if (body.includes("INVALID_ARGUMENT") || body.includes("invalid argument")) {
            throw new GeminiError("UPSTREAM_REFUSED", "Gemini rejected the request. Check GEMINI_MODEL and GEMINI_API_KEYS.", 400);
          }
          throw new GeminiError("UPSTREAM_REFUSED", "Gemini rejected the request.", 400);
        }
        if (res.status >= 500) {
          if (triesOnKey < 3) {
            const backoff = triesOnKey === 1 ? 500 : 1500 + Math.floor(Math.random() * 250);
            await new Promise((r) => setTimeout(r, backoff));
            continue; // retry same key
          }
          break; // rotate
        }
        if (!res.ok) {
          break; // rotate
        }

        const json = (await res.json().catch(() => null)) as GeminiResponse | null;
        const parts = json?.candidates?.[0]?.content?.parts;
        let text = "";
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p?.text) text += p.text;
            const d = p?.inlineData?.data;
            if (d) text += Buffer.from(String(d), "base64").toString("utf8");
          }
        }
        const finishReason = json?.candidates?.[0]?.finishReason;
        const blockReason = json?.promptFeedback?.blockReason;
        if (blockReason) {
          throw new GeminiError("BLOCKED_BY_SAFETY", "Gemini's safety filter stopped this document.", 422);
        }
        if (finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
          throw new GeminiError("BLOCKED_BY_SAFETY", "Gemini's safety filter stopped this document.", 422);
        }

        return { text, finishReason, keySlot: slot, attempts };
      } catch (err: unknown) {
        clearTimeout(t);
        if (err instanceof Error && err.name === "AbortError") {
          if (triesOnKey < 2) {
            continue; // retry same key
          }
          break; // rotate
        }
        if (err instanceof GeminiError) throw err;
        if (triesOnKey < 2) {
          const backoff = 500 + Math.floor(Math.random() * 200);
          await new Promise((r) => setTimeout(r, backoff));
          continue; // retry same key
        }
        break; // rotate
      }
    }
  }

  throw new GeminiError("UPSTREAM_QUOTA", "Every configured Gemini key is over quota. Try again shortly or ask an administrator to add keys.", 503);
}