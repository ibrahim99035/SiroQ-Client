import "server-only";

/**
 * Branded HTML for outbound mail.
 *
 * Constraints that shape everything here — these are email clients, not a
 * browser:
 *
 *  - No external stylesheets, no `<style>` positioning, no flexbox or grid.
 *    Outlook (Word rendering engine) ignores most modern CSS, so layout is
 *    nested `<table>` elements with every property inlined.
 *  - No web fonts. A `@font-face` to a CDN is stripped by most clients and makes
 *    the template depend on outbound network access. A system font stack is the
 *    only reliable choice, so SiroQ's Plex faces are approximated rather than
 *    reproduced.
 *  - Colours are hardcoded hex rather than taken from the CSS custom properties
 *    in `globals.css`: `var(--accent)` does not resolve in mail. The values are
 *    copied from the `:root` block and must be changed there together.
 *  - Dark mode is *suppressed*, not implemented. Apple Mail, Outlook.com and
 *    Yahoo invert unknown palettes automatically, which turns a dark brand
 *    header into a white one and puts near-black body text on near-black.
 *    Declaring `color-scheme: light` opts the message out of that inversion.
 *  - Images may be blocked. The logo therefore always carries `alt` text and
 *    its dimensions are set explicitly, so a blocked image degrades to the
 *    wordmark instead of a broken-image glyph.
 *
 * Every builder returns `{ subject, text, html }`. `text` is the authoritative
 * version and `html` is the presentation: nodemailer sends them as
 * `multipart/alternative`, so a client that cannot render HTML — or a reader on
 * a plain-text client — gets the full content rather than an empty shell.
 */

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

/* -------------------------------------------------------------------------- */
/* Brand palette                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the `:root` block in `app/globals.css`. Kept as literals because
 * custom properties do not resolve in an email client; `assertPaletteInSync`
 * in the verification suite compares the two so they cannot drift apart.
 */
const BRAND = {
  ink: "#16302e",
  muted: "#5e6e6b",
  hairline: "#d8ddda",
  paper: "#f4f6f5",
  raised: "#ffffff",
  accent: "#2e6f6a",
  accentStrong: "#245b57",
  accentSoft: "#eef4f1",
  warm: "#c97a3d",
  warmStrong: "#a86030",
  onBrand: "#e9f2f0",
  onBrandMuted: "#a9bfbb",
} as const;

const FONT_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONT_MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

const WIDTH = 600;

/* -------------------------------------------------------------------------- */
/* Escaping                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Escapes text for an HTML body or attribute value.
 *
 * Applied to every interpolated value, including the caller's own strings.
 * Without it, a display name containing `<` or `&` breaks the markup, and an
 * attacker-chosen name becomes an injection vector into every recipient's
 * inbox. Attributes get the same treatment with quotes escaped too.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes a URL for an `href`/`src`, rejecting anything that is not http(s). */
function safeUrl(url: string): string {
  const trimmed = url.trim();
  // A `javascript:` or `data:` URL in a mail body is stripped by most clients
  // and rendered by some. Only absolute http(s) links are emitted.
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return escapeHtml(trimmed);
}

/* -------------------------------------------------------------------------- */
/* Layout primitives                                                           */
/* -------------------------------------------------------------------------- */

interface LayoutOptions extends BrandLinks {
  preheader: string;
  heading: string;
  /** Rendered as the first paragraph under the heading. */
  intro?: string;
  /** Trusted HTML produced by the builders below, already escaped. */
  body?: string;
  cta?: { label: string; url: string };
  /** Small print below the call to action. */
  note?: string;
  /** Extra lines in the footer, already escaped. */
  footerNotes?: string[];
}

/**
 * A table cell carrying body copy.
 *
 * `role="presentation"` removes the table from the accessibility tree, which is
 * what assistive tech needs for layout tables — the reading order is the same
 * as the DOM order, and announcing a grid of cells would be noise.
 */
function cell(content: string, options: { align?: "left" | "center" } = {}): string {
  return `<td${options.align === "center" ? ' align="center"' : ""} class="px-8 py-0">${content}</td>`;
}

function paragraph(html: string, extra = ""): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_SANS};font-size:16px;line-height:1.6;color:${BRAND.ink};${extra}">${html}</p>`;
}

/**
 * The primary button.
 *
 * A padded anchor on a background-coloured cell is the only shape that survives
 * Outlook, which ignores `border-radius` and padding on bare links. The VML
 * branch draws the same button in Word's own primitive so it renders there too.
 */
function button(label: string, url: string): string {
  const href = safeUrl(url);
  if (!href) return "";
  const width = Math.max(180, label.length * 9 + 56);
  return `
      <tr>
        <td align="center" style="padding:8px 32px 32px">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" bgcolor="${BRAND.accent}" style="border-radius:8px">
                <a href="${href}" target="_blank"
                   style="display:inline-block;padding:14px 28px;font-family:${FONT_SANS};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;mso-line-height-rule:exactly;">
                  ${escapeHtml(label)}
                </a>
              </td>
            </tr>
          </table>
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                        href="${href}" style="height:48px;v-text-anchor:middle;width:${width}px;"
                        arcsize="17%" strokecolor="${BRAND.accent}" fillcolor="${BRAND.accent}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">
              ${escapeHtml(label)}
            </center>
          </v:roundrect>
          <![endif]-->
        </td>
      </tr>`;
}

/**
 * The short brand rule under the heading.
 *
 * The site draws a warm-to-teal gradient, but CSS `linear-gradient` on a
 * background is unreliable in mail. Three adjacent cells approximate it, which
 * renders as a solid rule everywhere.
 */
function signatureRule(): string {
  const segments = [BRAND.warm, BRAND.accent, BRAND.accentSoft];
  const cells = segments
    .map(
      (color) =>
        `<td width="14" height="3" bgcolor="${color}" style="width:14px;height:3px;font-size:0;line-height:0;">&nbsp;</td>`,
    )
    .join("");
  return `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr>${cells}</tr></table>`;
}

function header(logoUrl: string, brandUrl: string): string {
  // Absolute URL required: a relative path resolves against nothing in a mail
  // client. When the app has no configured public base URL the logo is omitted
  // entirely rather than emitted as a broken image.
  const src = safeUrl(logoUrl);
  // The asset is 307x96. Both attributes are declared because Outlook reserves
  // layout space from them before the file loads; without `height` the image
  // reflows on arrival. 154x48 is the nearest whole-pixel size that does not
  // distort the ratio, and `height:auto` in the style keeps it exact on clients
  // that do honour it.
  const mark = src
    ? `<img src="${src}" width="154" height="48" alt="SiroQ"
            style="display:block;width:154px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="font-family:${FONT_SANS};font-size:24px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.onBrand};">SiroQ</span>`;
  return `
      <tr>
        <td bgcolor="${BRAND.ink}" style="padding:28px 32px;">
          <a href="${safeUrl(brandUrl)}" target="_blank"
             style="display:inline-block;text-decoration:none;color:${BRAND.onBrand};">${mark}</a>
        </td>
      </tr>`;
}

/**
 * Wraps a message body in the branded shell.
 *
 * The two `meta` tags are load-bearing: they declare the message as a
 * light-only palette, which stops Apple Mail, Outlook.com and Yahoo from
 * auto-inverting it. Without them the dark header is inverted to white and the
 * dark header text becomes unreadable.
 */
function layout(options: LayoutOptions): string {
  const { preheader, heading, intro, body, cta, note, footerNotes = [] } = options;

  const introRow = intro ? `<tr>${cell(paragraph(intro))}</tr>` : "";
  const ctaRows = cta ? button(cta.label, cta.url) : "";
  const noteRow = note
    ? `<tr>${cell(
        paragraph(
          `<span style="font-size:13px;color:${BRAND.muted};">${escapeHtml(note)}</span>`,
          "margin:0",
        ),
      )}</tr>`
    : "";
  const extraFooter = footerNotes.length
    ? `<p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${BRAND.muted};">${footerNotes.join("<br />")}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(heading)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND.paper};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
  ${escapeHtml(preheader)}
</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND.paper};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${WIDTH}"><tr><td><![endif]-->
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="${WIDTH}"
             style="width:100%;max-width:${WIDTH}px;background-color:${BRAND.raised};border-radius:12px;overflow:hidden;">
        ${header(options.logoUrl ?? "", options.brandUrl ?? "")}
        <tr><td style="padding:32px 0 8px;">${signatureRule()}</td></tr>
        <tr>${cell(`<h1 style="margin:0 0 16px;font-family:${FONT_SANS};font-size:24px;line-height:1.25;font-weight:600;letter-spacing:-0.01em;color:${BRAND.ink};">${escapeHtml(heading)}</h1>`)}</tr>
        ${introRow}
        ${body ?? ""}
        ${ctaRows}
        ${noteRow}
        <tr><td style="padding:8px 32px 32px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr><td style="border-top:1px solid ${BRAND.hairline};font-size:0;line-height:0;">&nbsp;</td></tr>
          </table>
        </td></tr>
        <tr>
          <td bgcolor="${BRAND.accentSoft}" style="padding:20px 32px;">
            ${footer(extraFooter, options)}
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The "why you got this" footer plus the compliance links. */
function footer(extra: string, links: BrandLinks): string {
  const targets: Array<readonly [string, string | undefined]> = [
    ["Terms", links.termsUrl],
    ["Privacy", links.privacyUrl],
    ["Status", links.statusUrl],
  ];
  const items = targets
    .map(([label, href]) => {
      const url = safeUrl(href ?? "");
      // A link whose URL failed validation is dropped rather than emitted as a
      // dead `href=""`, which some clients resolve to the mail's own origin.
      if (!url) return "";
      return `<a href="${url}" target="_blank" style="color:${BRAND.accentStrong};text-decoration:underline;">${escapeHtml(label)}</a>`;
    })
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  return `
            <p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${BRAND.muted};">
              ${extra}
              You are receiving this because you have a SiroQ account or a pending invitation to one.
            </p>
            <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${BRAND.muted};">
              ${items}
            </p>`;
}

/**
 * A pill echoing the on-site status stamp.
 *
 * `StatusPill` on the site puts white text on a darkened fill derived from the
 * status hue. The same pairing is used here so an email and the UI agree about
 * what "rejected" looks like.
 */
function statusPill(label: string, fill: string): string {
  return `<span style="display:inline-block;padding:4px 10px;font-family:${FONT_MONO};font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#ffffff;background-color:${fill};border-radius:999px;">${escapeHtml(label)}</span>`;
}

/**
 * A `label: value` row, as a table so the columns align without flexbox.
 *
 * `value` is escaped by default. Pass `html` instead for values produced by
 * this module (the status pill), which are already escaped and must not be
 * double-escaped into visible markup.
 *
 * The label column is a percentage rather than a pixel width: a fixed 140px
 * column cannot shrink on a 320px phone, and a phone-sized viewport plus that
 * column is what forces the whole message to scroll sideways.
 */
function detailRow(
  label: string,
  value: string,
  options: { mono?: boolean; html?: string } = {},
): string {
  const rendered = options.html ?? escapeHtml(value);
  return `<tr>
            <td align="left" valign="top" width="38%" style="padding:0 16px 10px 0;font-family:${FONT_SANS};font-size:13px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(label)}</td>
            <td align="left" valign="top" style="padding:0 0 10px;font-family:${options.mono ? FONT_MONO : FONT_SANS};font-size:13px;line-height:1.5;color:${BRAND.ink};">${rendered}</td>
          </tr>`;
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

export interface BrandLinks {
  /** Absolute URL of `siroq-lockup-reversed.png`, for the dark header. */
  logoUrl?: string;
  /** Absolute URL of the marketing home page, linked from the logo. */
  brandUrl?: string;
  /** Absolute URLs for the footer links. Defaults to the placeholder host. */
  termsUrl?: string;
  privacyUrl?: string;
  statusUrl?: string;
}

/**
 * Shared per-message context.
 *
 * `APP_BASE_URL` is absent in the current `.env`, so every absolute URL here is
 * derived from the incoming request via `absoluteUrl()`. That is what made
 * invitation links point at `localhost`; these builders simply make the
 * requirement explicit rather than papering over it.
 */
function withLinks<T>(links: BrandLinks, build: (l: BrandLinks) => T): T {
  // Callers spread the defaults after their own overrides so an explicit
  // `undefined` still resolves to the default rather than emitting `undefined`.
  return build({
    ...links,
    termsUrl: links.termsUrl ?? "https://siroq.example/terms",
    privacyUrl: links.privacyUrl ?? "https://siroq.example/privacy",
    statusUrl: links.statusUrl ?? "https://siroq.example/status",
  });
}

/** Password reset — the link is single-use and short-lived. */
export function passwordResetEmail(
  params: { name: string; resetUrl: string; expiresInMinutes?: number } & BrandLinks,
): EmailMessage {
  const minutes = params.expiresInMinutes ?? 60;
  return withLinks(params, (l) => {
    const subject = "Reset your SiroQ password";
    const text = [
      `Hi ${params.name},`,
      "",
      "Someone asked to reset the password for your SiroQ account. Open the link below to choose a new one:",
      "",
      params.resetUrl,
      "",
      `The link expires in ${minutes} minutes and can only be used once. If you did not ask for this, you can ignore this email — your password will not change.`,
      "",
      "— SiroQ",
    ].join("\n");

    return {
      subject,
      text,
      html: layout({
        preheader: "Choose a new password for your SiroQ account.",
        heading: "Reset your password",
        intro: `Hi ${escapeHtml(params.name)},`,
        body: `<tr>${cell(
          paragraph(
            "Someone asked to reset the password for your SiroQ account. Choose a new one using the button below.",
          ),
        )}</tr>`,
        cta: { label: "Choose a new password", url: params.resetUrl },
        note: `This link expires in ${minutes} minutes and can only be used once.`,
        footerNotes: [
          "If you did not ask for this, you can ignore this email — your password will not change.",
        ],
        ...l,
      }),
    };
  });
}

/** Workspace invitation — the link is what proves control of the mailbox. */
export function workspaceInviteEmail(
  params: { name: string; inviterName: string; inviteUrl: string } & BrandLinks,
): EmailMessage {
  return withLinks(params, (l) => {
    const subject = `${params.inviterName} invited you to SiroQ`;
    const text = [
      `Hi ${params.name},`,
      "",
      `${params.inviterName} invited you to join their workspace on SiroQ. Accept the invitation to set a password and get access:`,
      "",
      params.inviteUrl,
      "",
      "If you were not expecting this, ignore this email — no account will be created.",
      "",
      "— SiroQ",
    ].join("\n");

    return {
      subject,
      text,
      html: layout({
        preheader: `${params.inviterName} invited you to join their SiroQ workspace.`,
        heading: "You have been invited to SiroQ",
        intro: `Hi ${escapeHtml(params.name)},`,
        body: `<tr>${cell(
          paragraph(
            `<strong style="font-weight:600;">${escapeHtml(params.inviterName)}</strong> invited you to join their workspace on SiroQ. Accept the invitation to set a password and get access.`,
          ),
        )}</tr>`,
        cta: { label: "Accept the invitation", url: params.inviteUrl },
        note: "The link expires in 48 hours and can only be used once.",
        footerNotes: ["If you were not expecting this, ignore this email — no account will be created."],
        ...l,
      }),
    };
  });
}

const STATUS_LABEL = {
  pending: "Pending",
  in_review: "In review",
  reported: "Reported",
  rejected: "Rejected",
} as const;

const STATUS_FILL = {
  pending: "#7a5c08",
  in_review: "#2d5a83",
  reported: "#245c42",
  rejected: "#9c3c30",
} as const;

export type FilingStatus = keyof typeof STATUS_LABEL;

/**
 * A reviewer moved a filing.
 *
 * Only the two terminal outcomes are sent, matching `sendFilingStatusChanged`
 * in `lib/mail.ts`: mail-per-transition trains people to ignore status mail.
 *
 * Recipients differ and the message is written for both: the submitter, who
 * filed the thing, and the association admins copied in because they manage
 * every pharmacy in that association. Nothing in it addresses "your filing"
 * for that reason.
 */
export function filingStatusChangedEmail(
  params: {
    /**
     * Whoever the greeting addresses — not necessarily the submitter.
     *
     * This is the recipient's own name on every delivery. The submitter
     * receives it because they are the recipient; an association admin
     * notified about someone else's filing is greeted by their own name.
     * The parameter used to be called `submitterName`, which made the fan-out
     * read as though it should greet admins with the submitter's name.
     */
    recipientName: string;
    reference: string;
    title: string;
    from: FilingStatus;
    to_: FilingStatus;
    changedByName: string;
    note: string;
    filingUrl: string;
  } & BrandLinks,
): EmailMessage {
  const rejected = params.to_ === "rejected";
  const subject = rejected
    ? `Filing ${params.reference} was rejected`
    : `Report ready for filing ${params.reference}`;

  const text = [
    `Hi ${params.recipientName},`,
    "",
    rejected
      ? `A reviewer rejected the filing "${params.title}" (${params.reference}).`
      : `The report for "${params.title}" (${params.reference}) is ready. The filing is now marked reported and the document is available to download.`,
    "",
    `Status: ${STATUS_LABEL[params.from]} → ${STATUS_LABEL[params.to_]}`,
    `Changed by: ${params.changedByName}`,
    "",
    "Reviewer's note:",
    params.note,
    "",
    "Open the filing:",
    params.filingUrl,
    "",
    rejected
      ? "A rejected filing can be reopened for more information. If the rejection looks wrong, reply to an administrator with the reference above."
      : "This is the final status. A reported filing cannot be re-statused, so the delivered document is the record.",
    "",
    "— SiroQ",
  ].join("\n");

  return withLinks(params, (l) => {
    const details = [
      detailRow("Filing", `${params.title} (${params.reference})`),
      detailRow("Status", `${STATUS_LABEL[params.from]} → ${statusPill(STATUS_LABEL[params.to_], STATUS_FILL[params.to_])}`, {
        html: `${escapeHtml(STATUS_LABEL[params.from])} &rarr; ${statusPill(STATUS_LABEL[params.to_], STATUS_FILL[params.to_])}`,
      }),
      detailRow("Changed by", params.changedByName),
      detailRow("Reference", params.reference, { mono: true }),
    ].join("");

    return {
      subject,
      text,
      html: layout({
        preheader: rejected
          ? `Filing ${params.reference} was rejected.`
          : `The report for ${params.reference} is ready to download.`,
        // Not "Your report is ready": this message also goes to the filing's
        // association admins, and a report on someone else's pharmacy's filing
        // is not theirs. "Report ready" is true for every recipient.
        heading: rejected ? "Filing rejected" : "Report ready",
        intro: `Hi ${escapeHtml(params.recipientName)},`,
        body: `<tr>${cell(
          paragraph(
            rejected
              ? `A reviewer rejected the filing <strong style="font-weight:600;">${escapeHtml(params.title)}</strong>.`
              : `The report for <strong style="font-weight:600;">${escapeHtml(params.title)}</strong> is ready and the document is available to download.`,
          ),
        )}</tr>
        <tr>${cell(
          `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${details}</table>`,
        )}</tr>
        <tr>${cell(
          `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left:3px solid ${BRAND.accent};">
             <tr>${cell(
               `<p style="margin:0 0 4px;font-family:${FONT_MONO};font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.muted};">Reviewer's note</p>` +
                 `<p style="margin:0;font-family:${FONT_SANS};font-size:15px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(params.note)}</p>`,
               { align: "left" },
             )}</tr>
           </table>`,
        )}</tr>`,
        cta: { label: "Open the filing", url: params.filingUrl },
        note: rejected
          ? "A rejected filing can be reopened for more information. If the rejection looks wrong, reply to an administrator with the reference above."
          : "This is the final status. A reported filing cannot be re-statused, so the delivered document is the record.",
        ...l,
      }),
    };
  });
}

/**
 * A message from the public contact form, delivered to the configured inbox.
 *
 * Addressed to an operator rather than a customer, so the subject carries the
 * reference and the reply-to header (set by the caller in `lib/mail.ts`) is what
 * makes it actionable.
 */
export function contactMessageEmail(
  params: { name: string; email: string; organisation: string; topic: string; message: string } & BrandLinks,
): EmailMessage {
  const org = params.organisation.trim() || "no organisation";
  const subject = `[SiroQ] ${params.topic} — ${org}`;

  const text = [
    `Topic:     ${params.topic}`,
    `Name:      ${params.name}`,
    `Email:     ${params.email}`,
    `Org:       ${org}`,
    "",
    params.message,
  ].join("\n");

  return withLinks(params, (l) => {
    const details = [
      detailRow("Topic", params.topic),
      detailRow("Name", params.name),
      detailRow("Email", params.email, { mono: true }),
      detailRow("Organisation", org),
    ].join("");

    return {
      subject,
      text,
      html: layout({
        preheader: `New enquiry from ${params.name} — ${params.topic}`,
        heading: "New contact enquiry",
        intro: `<span style="color:${BRAND.muted};">Someone got in through the public contact form.</span>`,
        body: `<tr>${cell(
          `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${details}</table>`,
        )}</tr>
        <tr>${cell(
          `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left:3px solid ${BRAND.warm};">
             <tr>${cell(
               `<p style="margin:0;font-family:${FONT_SANS};font-size:15px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(params.message).replace(/\n/g, "<br />")}</p>`,
               { align: "left" },
             )}</tr>
           </table>`,
        )}</tr>`,
        note: `Reply directly to this email to reach ${params.name}.`,
        footerNotes: ["Delivered by the SiroQ contact form."],
        ...l,
      }),
    };
  });
}

/** Exposed for the verification suite, which checks the palette against `globals.css`. */
export const EMAIL_BRAND_PALETTE = BRAND;
