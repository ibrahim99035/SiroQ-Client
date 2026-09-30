import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { sendContactMessage } from "@/lib/mail";

/**
 * POST /api/contact — the public contact form.
 *
 * Unauthenticated by necessity, so the endpoint treats its input as hostile:
 * a bounded body size is checked *before* parsing, fields are capped, a honeypot
 * absorbs naive bots, and a per-process throttle blunts casual spam.
 *
 * That throttle is deliberately acknowledged as inadequate in `docs/PHASE3` and
 * on the compliance page: it is a counter in this process, so it resets on
 * deploy and does nothing across instances. It exists to stop casual form
 * filling, not to be a rate limiter.
 */

const contactSchema = z.object({
  name: z.string().trim().min(1, "Tell us who you are.").max(120),
  email: z.string().trim().email("That address does not look right.").max(200),
  organisation: z.string().trim().max(160).default(""),
  topic: z.string().trim().min(1, "Pick a topic.").max(80),
  message: z.string().trim().min(1, "Add a message.").max(4000),
  // Honeypot. Hidden from people, irresistible to scripts.
  // Handled by the honeypot check *before* this schema runs, and only ever
  // present when that check has already dropped the request. Accepted here so
  // a stray value cannot turn into a confusing validation error.
  website: z.string().optional(),
});

const TOPICS = [
  "Pricing and plans",
  "Security review",
  "Compliance and DPA",
  "Pilot or evaluation",
  "Support",
  "Something else",
];

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;

const globalForThrottle = globalThis as unknown as {
  siroqContactAttempts?: Map<string, number[]>;
};

function throttled(key: string): boolean {
  const now = Date.now();
  const store = (globalForThrottle.siroqContactAttempts ??= new Map<string, number[]>());
  const recent = (store.get(key) ?? []).filter((at) => now - at < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    store.set(key, recent);
    return true;
  }

  recent.push(now);
  store.set(key, recent);

  // Without this the map grows for the life of the process on a long-running
  // server, since keys are never removed once their window has passed.
  if (store.size > 5000) {
    for (const [entry, stamps] of store) {
      if (!stamps.some((at) => now - at < WINDOW_MS)) store.delete(entry);
    }
  }
  return false;
}

export async function POST(request: Request) {
  if (throttled(request.headers.get("x-forwarded-for") ?? "unknown")) {
    return NextResponse.json(
      { ok: false, error: "Too many messages just now. Try again in a minute." },
      { status: 429 },
    );
  }

  const raw = await request.text().catch(() => null);
  if (raw === null) {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }
  // Checked before parsing so an oversized payload is rejected without being
  // materialised as an object graph.
  if (raw.length > 16_000) {
    return NextResponse.json(
      { ok: false, error: "That message is too long." },
      { status: 413 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }

  // Honeypot checked before schema validation, and separately from it.
  //
  // It must not live in `contactSchema`: a `website` constraint inside the
  // schema produces a 400 whose `field` is `website`, which tells a bot
  // exactly which input gave it away. The form's own behaviour has to be
  // indistinguishable from success, so the submission is dropped here and the
  // caller gets the same 200 a human would.
  const honeypot =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).website
      : undefined;
  if (typeof honeypot === "string" && honeypot.length > 0) {
    console.info("[contact] honeypot tripped — submission dropped silently");
    return NextResponse.json({ ok: true });
  }

  const result = contactSchema.safeParse(parsed);
  if (!result.success) {
    const field = result.error.issues[0]?.path[0];
    const message = result.error.issues[0]?.message ?? "Check the form and try again.";
    return NextResponse.json(
      { ok: false, error: message, field: typeof field === "string" ? field : undefined },
      { status: 400 },
    );
  }

  const { name, email, organisation, topic, message } = result.data;
  if (!TOPICS.includes(topic)) {
    return NextResponse.json(
      { ok: false, error: "Pick one of the listed topics.", field: "topic" },
      { status: 400 },
    );
  }

  const sent = await sendContactMessage({ name, email, organisation, topic, message });

  if (!sent.delivered) {
    // Surfaced deliberately, unlike the transactional mail paths. A contact form
    // that reports success while dropping the message loses the enquiry and the
    // visitor has no way to know.
    return NextResponse.json(
      {
        ok: false,
        error:
          sent.reason === "no_contact_inbox"
            ? "The contact channel is not configured yet. Please email us directly instead."
            : "We could not send that just now. Please try again in a moment.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
