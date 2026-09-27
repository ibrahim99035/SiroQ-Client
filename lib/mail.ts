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
