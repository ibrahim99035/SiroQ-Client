"use client";

import { useState } from "react";

/**
 * Contact form.
 *
 * Posts to `/api/contact`. The one behaviour worth calling out: the server's
 * failure message is shown verbatim rather than replaced with a friendlier one.
 * If mail is down, the visitor needs to know their message did not arrive —
 * silently swallowing the error would mean they believe a person had read it.
 */

const TOPICS = [
  "Pricing and plans",
  "Security review",
  "Compliance and DPA",
  "Pilot or evaluation",
  "Support",
  "Something else",
];

type State =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent" }
  | { phase: "failed"; message: string };

export function ContactForm() {
  const [state, setState] = useState<State>({ phase: "idle" });
  const [field, setField] = useState<string | undefined>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    setState({ phase: "sending" });
    setField(undefined);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = (await response.json()) as { ok: boolean; error?: string; field?: string };

      if (body.ok) {
        form.reset();
        setState({ phase: "sent" });
        return;
      }
      setField(body.field);
      setState({
        phase: "failed",
        message: body.error ?? "Something went wrong. Please try again.",
      });
    } catch {
      setState({
        phase: "failed",
        message: "We could not reach the server. Check your connection and try again.",
      });
    }
  }

  const busy = state.phase === "sending";
  const inputClass =
    "w-full rounded-[10px] border border-hairline bg-paper-raised px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-accent";

  if (state.phase === "sent") {
    return (
      <div className="card p-8">
        <h3 className="text-[15px] font-medium text-ink">Message sent</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Thanks — that reached us. We read contact messages ourselves and usually reply within two
          working days.
        </p>
        <button
          type="button"
          onClick={() => setState({ phase: "idle" })}
          className="mt-6 text-[13px] font-medium text-accent underline underline-offset-2"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card p-7" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="req-field-label">Name</span>
          <input name="name" required autoComplete="name" maxLength={120} className={`mt-1.5 ${inputClass}`} />
        </label>
        <label className="block">
          <span className="req-field-label">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            maxLength={200}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
      </div>

      <label className="mt-5 block">
        <span className="req-field-label">Organisation</span>
        <input
          name="organisation"
          autoComplete="organization"
          maxLength={160}
          className={`mt-1.5 ${inputClass}`}
        />
      </label>

      <label className="mt-5 block">
        <span className="req-field-label">Topic</span>
        <select name="topic" defaultValue={TOPICS[0]} className={`mt-1.5 ${inputClass}`}>
          {TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-5 block">
        <span className="req-field-label">Message</span>
        <textarea
          name="message"
          required
          rows={5}
          maxLength={4000}
          placeholder="What are you trying to do, and what would you like to know?"
          className={`mt-1.5 resize-y ${inputClass}`}
        />
      </label>

      {/* Honeypot: visually and semantically hidden from people, filled in by bots. */}
      <label className="absolute left-[-9999px]" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>

      {state.phase === "failed" ? (
        <p role="alert" className="mt-5 text-[13px] text-status-rejected">
          {state.message}
        </p>
      ) : null}
      {field ? <span className="sr-only">Check the highlighted field</span> : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 rounded-[10px] bg-[linear-gradient(180deg,var(--accent),var(--accent-strong))] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
