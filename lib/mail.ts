import "server-only";

import { createTransport, type Transporter } from "nodemailer";

import {
  contactMessageEmail,
  filingStatusChangedEmail,
  passwordResetEmail,
  workspaceInviteEmail,
  type BrandLinks,
  type EmailMessage,
  type FilingStatus as TemplateFilingStatus,
} from "./email-templates";

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

/**
 * Absolute URLs for the branding in a message.
 *
 * The logo is an image with a relative path on disk, which resolves to nothing
 * in a mail client, so it needs a fully-qualified URL. `APP_BASE_URL` is the
 * only source that is correct for every recipient at once — a link derived from
 * the incoming request would break for anyone not already on that host.
 *
 * When it is unset the templates omit the logo and fall back to a text
 * wordmark, so a missing variable degrades the message instead of putting a
 * broken-image glyph in everyone's inbox.
 */
function brandLinks(): BrandLinks {
  const base = process.env.APP_BASE_URL;
  if (!base) return {};
  const absolute = (path: string) => new URL(path, base).toString();
  return {
    logoUrl: absolute("/brand/siroq-lockup-reversed.png"),
    brandUrl: absolute("/"),
    termsUrl: absolute("/terms"),
    privacyUrl: absolute("/privacy"),
    statusUrl: absolute("/status"),
  };
}

/**
 * Delivers a branded message.
 *
 * `text` and `html` go out together as `multipart/alternative`: a client that
 * cannot render HTML, or a reader who prefers plain text, gets the full message
 * rather than an empty shell. `text` is the authoritative version — the HTML is
 * presentation only, and no information may live solely in it.
 */
async function send(to: string, message: EmailMessage): Promise<MailResult> {
  const client = transport();
  if (!client) {
    console.info(
      `[mail] SMTP not configured — not sending "${message.subject}" to ${to}:\n${message.text}`,
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }

  try {
    await client.sendMail({
      from: fromAddress(),
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true };
  } catch (error) {
    // Never surface the transport error to the caller: SMTP failures carry
    // host names and auth detail that would help an attacker fingerprint the
    // account, and the generic response must stay identical either way.
    console.error(`[mail] failed to send "${message.subject}" to ${to}:`, error);
    return { delivered: false, reason: "smtp_error" };
  }
}

export function sendPasswordReset(params: {
  to: string;
  name: string;
  resetUrl: string;
}): Promise<MailResult> {
  const { to, name, resetUrl } = params;
  return send(to, passwordResetEmail({ name, resetUrl, ...brandLinks() }));
}

export function sendWorkspaceInvite(params: {
  to: string;
  name: string;
  inviterName: string;
  inviteUrl: string;
}): Promise<MailResult> {
  const { to, name, inviterName, inviteUrl } = params;
  return send(to, workspaceInviteEmail({ name, inviterName, inviteUrl, ...brandLinks() }));
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
  const message = contactMessageEmail({ ...params, ...brandLinks() });
  try {
    await client.sendMail({
      from: fromAddress(),
      to: inbox,
      replyTo: params.email,
      // The reference is kept in the subject so an operator can find the
      // matching row in the log, and in the body so it survives forwarding.
      subject: `[SiroQ ${ref}] ${message.subject}`,
      text: `${message.text}\nReference: ${ref}`,
      html: message.html,
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

export type FilingStatus = TemplateFilingStatus;

/**
 * Notifies a recipient that a reviewer moved a filing.
 *
 * Only the two terminal outcomes notify. `pending` and `in_review` are progress
 * the submitter can already see on the filing itself, and mail-per-transition
 * trains people to ignore status mail — which is exactly how a rejection or a
 * delivered report gets missed.
 *
 * The recipient is the person who staged the filing, not the actor: the person
 * who pressed the button already knows.
 */
export function sendFilingStatusChanged(params: {
  to: string;
  /** Name of whoever is being written to — the greeting, not the filing's author. */
  recipientName: string;
  reference: string;
  title: string;
  from: FilingStatus;
  to_: FilingStatus;
  changedByName: string;
  note: string;
  filingUrl: string;
}): Promise<MailResult> {
  const { to, recipientName, reference, title, from, to_, changedByName, note, filingUrl } = params;
  return send(
    to,
    filingStatusChangedEmail({
      recipientName,
      reference,
      title,
      from,
      to_,
      changedByName,
      note,
      filingUrl,
      ...brandLinks(),
    }),
  );
}

/**
 * The filing-notification arguments that do not vary per recipient.
 *
 * Split out because the fan-out below is the only caller that needs to know
 * which fields are shared, and a `Omit<>` of the single-recipient signature
 * would silently accept a missing `to` as if it were intentional.
 */
export type FilingStatusChangedContent = {
  reference: string;
  title: string;
  from: FilingStatus;
  to_: FilingStatus;
  changedByName: string;
  note: string;
  filingUrl: string;
};

/**
 * Fans a filing notification out to several people.
 *
 * Exists because an association admin manages every pharmacy in their
 * association, so a report on any one of those pharmacies is their business
 * even though they did not file it. They were previously told nothing.
 *
 * Every recipient is greeted by their own name — see `recipientName` on
 * {@link sendFilingStatusChanged}.
 *
 * One delivery failing does not cancel the others: `Promise.all` over
 * individually-guarded sends, because an association with several admins
 * should still reach the ones whose mailboxes are healthy.
 */
export function sendFilingStatusChangedToAll(
  recipients: ReadonlyArray<{ email: string; name: string }>,
  content: FilingStatusChangedContent,
): Promise<MailResult[]> {
  return Promise.all(
    recipients.map((recipient) =>
      sendFilingStatusChanged({
        ...content,
        to: recipient.email,
        recipientName: recipient.name,
      }).catch((error: unknown): MailResult => {
        console.error(
          `[mail] failed to notify ${recipient.email} about ${content.reference}:`,
          error,
        );
        return { delivered: false, reason: "smtp_error" };
      }),
    ),
  );
}
