import "server-only";

import { createTransport, type Transporter } from "nodemailer";

/**
 * Outbound mail.
 *
 * Delivery is best-effort by design: a password reset must not become an
 * enumeration oracle, and a mail outage must not 500 the request that triggered
 * it. Callers get `true`/`false` and decide. When SMTP is not configured — the
 * default in development — the message body is written to the server log so the
 * flow stays testable end to end.
 */

const globalForMail = globalThis as unknown as { siroqMail?: Transporter | null };

function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD,
  );
}

export function isMailConfigured(): boolean {
  return smtpConfigured();
}

function transport(): Transporter | null {
  if (!smtpConfigured()) return null;
  if (globalForMail.siroqMail !== undefined) return globalForMail.siroqMail;

  const port = Number.parseInt(process.env.SMTP_PORT ?? "465", 10);
  const client = createTransport({
    host: process.env.SMTP_HOST,
    port: Number.isFinite(port) ? port : 465,
    // Port 465 is implicit TLS; 587 is STARTTLS. Getting this wrong is the most
    // common SMTP misconfiguration, so it is derived rather than configured.
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });

  if (process.env.NODE_ENV !== "production") {
    globalForMail.siroqMail = client;
  }
  return client;
}

function fromAddress(): string {
  return process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@siroq.local";
}

/** Absolute URL for links in mail bodies, derived from the incoming request. */
export function absoluteUrl(path: string, request: Request): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return new URL(path, configured).toString();

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return path;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

export interface MailResult {
  delivered: boolean;
  reason?: string;
}

async function send(to: string, subject: string, text: string): Promise<MailResult> {
  const client = transport();
  if (!client) {
    console.info(`[mail] SMTP not configured — not sending "${subject}" to ${to}:\n${text}`);
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await client.sendMail({ from: fromAddress(), to, subject, text });
    return { delivered: true };
  } catch (error) {
    // Never surface the transport error to the caller: SMTP failures carry
    // host names and auth detail that would help an attacker fingerprint the
    // account, and the generic response must stay identical either way.
    console.error(`[mail] failed to send "${subject}" to ${to}:`, error);
    return { delivered: false, reason: "smtp_error" };
  }
}

export function sendPasswordReset(params: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<MailResult> {
  const { to, name, resetUrl } = params;
  return send(
    to,
    "Reset your SiroQ password",
    `Hi ${name},

Someone asked to reset the password for your SiroQ account. Open the link below to choose a new one:

${resetUrl}

The link expires in 60 minutes and can only be used once. If you did not ask for this, you can ignore this email — your password will not change.

— SiroQ`,
  );
}

export function sendWorkspaceInvite(params: {
  to: string;
  name: string;
  inviterName: string;
  inviteUrl: string;
}): Promise<MailResult> {
  const { to, name, inviterName, inviteUrl } = params;
  return send(
    to,
    `${inviterName} invited you to SiroQ`,
    `Hi ${name},

${inviterName} invited you to join their workspace on SiroQ. Accept the invitation to set a password and get access:

${inviteUrl}

If you were not expecting this, ignore this email — no account will be created.

— SiroQ`,
  );
}

/** Where contact-form submissions are delivered. */
function contactInbox(): string | null {
  return process.env.CONTACT_INBOX_EMAIL || process.env.MAIL_FROM || process.env.SMTP_USER || null;
}

/**
 * A message from the public contact form.
 *
 * Two deliberate differences from the transactional mail above:
 *
 *  - it fails loudly. A password reset that silently does nothing is a security
 *    problem; a contact form that silently drops enquiries loses business. The
 *    caller surfaces the failure so the visitor can retry or email instead.
 *  - the visitor's address goes in the reply-to header, so a reply reaches them
 *    without us ever handling an inbound mailbox of unknown provenance.
 */
export async function sendContactMessage(params: {
  name: string;
  email: string;
  organisation: string;
  topic: string;
  message: string;
}): Promise<MailResult> {
  const inbox = contactInbox();
  if (!inbox) return { delivered: false, reason: "no_contact_inbox" };

  const client = transport();
  if (!client) {
    console.info(
      `[mail] SMTP not configured — contact form submission from ${params.email} (${params.topic}) not sent:\n${params.message}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  const ref = `contact-${Date.now().toString(36)}`;
  try {
    await client.sendMail({
      from: fromAddress(),
      to: inbox,
      replyTo: params.email,
      subject: `[SiroQ ${ref}] ${params.topic} — ${params.organisation || "no organisation"}`,
      text: [
        `Topic:     ${params.topic}`,
        `Name:      ${params.name}`,
        `Email:     ${params.email}`,
        `Org:       ${params.organisation || "—"}`,
        `Reference: ${ref}`,
        "",
        params.message,
      ].join("\n"),
    });
    return { delivered: true };
  } catch (error) {
    console.error(`[mail] failed to send contact form message ${ref}:`, error);
    return { delivered: false, reason: "smtp_error" };
  }
}

/* ---------------------------------------------------------------------- */
/* Filing notifications                                                   */
/* ---------------------------------------------------------------------- */

/** Human wording for a status value, used in subjects and bodies. */
const STATUS_LABEL = {
  pending: "Pending",
  in_review: "In review",
  reported: "Reported",
  rejected: "Rejected",
} as const;

export type FilingStatus = keyof typeof STATUS_LABEL;

/**
 * Notifies the person who staged a filing that a reviewer moved it.
 *
 * Only the two terminal outcomes notify. `pending` and `in_review` are progress
 * the submitter can already see on the filing itself, and mail-per-transition
 * trains people to ignore status mail — which is exactly how a rejection or a
 * delivered report gets missed.
 *
 * `to` is the submitting user rather than the actor: the person who pressed the
 * button already knows.
 */
export function sendFilingStatusChanged(params: {
  to: string;
  submitterName: string;
  reference: string;
  title: string;
  from: FilingStatus;
  to_: FilingStatus;
  changedByName: string;
  note: string;
  filingUrl: string;
}): Promise<MailResult> {
  const { to, submitterName, reference, title, from, to_, changedByName, note, filingUrl } = params;

  const subject =
    to_ === "rejected"
      ? `Filing ${reference} was rejected`
      : `Report ready for filing ${reference}`;

  return send(
    to,
    subject,
    [
      `Hi ${submitterName},`,
      "",
      to_ === "rejected"
        ? `A reviewer rejected the filing "${title}" (${reference}).`
        : `The report for "${title}" (${reference}) is ready. The filing is now marked reported and the document is available to download.`,
      "",
      `Status: ${STATUS_LABEL[from]} → ${STATUS_LABEL[to_]}`,
      `Changed by: ${changedByName}`,
      "",
      "Reviewer's note:",
      note,
      "",
      "Open the filing:",
      filingUrl,
      "",
      to_ === "rejected"
        ? "A rejected filing can be reopened for more information. If the rejection looks wrong, reply to an administrator with the reference above."
        : "This is the final status. A reported filing cannot be re-statused, so the delivered document is the record.",
      "",
      "— SiroQ",
    ].join("\n"),
  );
}
