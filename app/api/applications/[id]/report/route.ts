import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { applicationDetailRowSelect, serializeApplicationRow } from "@/lib/application-rows";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { absoluteUrl, sendFilingStatusChanged } from "@/lib/mail";
import { requirePermission } from "@/lib/permissions";
import { applicationWhere } from "@/lib/scopes";

/**
 * 4 MB of UTF-8 text. Matches `UPLOAD_MAX_BYTES` so a report cannot become a
 * cheaper way around the file size limit than the ledger upload path.
 */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

const reportSchema = z.object({
  /**
   * The report document as text, not as parsed JSON. The server does the
   * parsing: if the client sent a structure, a client bug could hand the
   * database a `result_data` that no longer matches the `raw_data` recorded
   * beside it, and those two are the audit pair.
   */
  document: z.string().min(1, "The report document is empty."),
  /**
   * Always `final` on this route, and the parameter exists only so the stored
   * row's status is stated explicitly rather than defaulted by the database.
   *
   * The schema used to accept `"draft"` as well. That was an affordance nothing
   * could use and did not mean what it said: attaching always wrote `reported`
   * regardless, so a "draft" report would deliver the filing. A draft needs a
   * lifecycle — saved without flipping the filing, publishable later, discarded
   * — and none of that exists. It belongs on the analysis-service path that
   * generates reports, not on the manual attach.
   */
  status: z.literal("final").default("final"),
  note: z.string().max(500).optional(),
});

const scopeSelect = {
  id: true,
  // Carried because they appear in the notification to the submitter.
  title: true,
  reference: true,
  associationId: true,
  pharmacyId: true,
  status: true,
  report: { select: { id: true } },
} as const;

function defaultNote(): string {
  return "Report generated from review findings and attached to the filing.";
}

/**
 * POST /api/applications/[id]/report
 *
 * Attaches a report and advances the filing to `reported` in one transaction.
 *
 * The three writes are inseparable: a `Report` row without the status flip
 * leaves a filing stamped `pending` while the detail page renders a report; the
 * status flip without the report is the case the status route already refuses
 * outright; and the `StatusEvent` without either would leave the audit trail
 * contradicting the row. So this route is the only thing that can produce
 * `reported`, and it does all three or none.
 */
export const POST = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    const parsed = reportSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    // Measured on the encoded form, not the string length: a document full of
    // multi-byte characters is fewer characters than bytes, and the limit is a
    // storage limit.
    const documentBytes = Buffer.byteLength(parsed.data.document, "utf8");
    if (documentBytes > MAX_DOCUMENT_BYTES) {
      return apiError(
        "invalid",
        `The report document is ${Math.round(documentBytes / 1024)} KB. The limit is 4096 KB.`,
        413,
      );
    }

    // Parsed before the transaction opens. A malformed document should cost
    // nothing, and `JSON.parse` throwing inside a transaction body would abort
    // a write for a reason the caller can fix without retrying.
    let parsedDocument: unknown;
    try {
      parsedDocument = JSON.parse(parsed.data.document);
    } catch {
      return apiError("invalid", "The report document is not valid JSON.", 400);
    }

    if (
      parsedDocument === null ||
      typeof parsedDocument !== "object" ||
      Array.isArray(parsedDocument)
    ) {
      return apiError(
        "invalid",
        "The report document must be a JSON object, not a bare value or array.",
        400,
      );
    }

    const target = await prisma.application.findFirst({
      where: { AND: [applicationWhere(actor), { id }] },
      select: scopeSelect,
    });
    if (!target) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    try {
      requirePermission(actor, "attachReport", {
        associationId: target.associationId,
        pharmacyId: target.pharmacyId,
        pharmacyAssociationId: target.associationId,
      });
    } catch {
      return apiError("forbidden", "You cannot attach a report to this filing.", 403);
    }

    // `Report.applicationId` is unique, so a second attach would otherwise
    // surface as a Prisma constraint error — a 500 for what is an ordinary
    // business rule. Same reasoning as the terminal `reported` guard in the
    // status route: a delivered report is not quietly replaced.
    if (target.report || target.status === "reported") {
      return apiError("conflict", "This filing already has a report.", 409);
    }

    if (target.status === "rejected") {
      return apiError(
        "conflict",
        "A rejected filing cannot be reported. Reopen it for more information first.",
        409,
      );
    }

    const note = parsed.data.note?.trim() || defaultNote();

    await prisma.$transaction([
      prisma.report.create({
        data: {
          applicationId: id,
          status: parsed.data.status,
          source: "manual",
          resultData: parsedDocument as object,
          // Pretty-printed, not the uploaded bytes: the raw view is for reading
          // a document back, and one-line JSON defeats that. The stored document
          // is otherwise byte-identical to what was parsed.
          rawData: JSON.stringify(parsedDocument, null, 2),
          generatedById: actor.id,
        },
      }),
      prisma.application.update({
        where: { id },
        data: { status: "reported" },
      }),
      prisma.statusEvent.create({
        data: {
          applicationId: id,
          to: "reported",
          fromStatus: target.status,
          changedById: actor.id,
          note,
        },
      }),
    ]);

    // Re-read through the detail projection: the client needs the result tree
    // to render the panel, and neither the row just written nor the
    // `application.update` result carries it.
    const row = await prisma.application.findUniqueOrThrow({
      where: { id },
      select: applicationDetailRowSelect,
    });

    // The report *is* the deliverable, so this is the moment the submitter is
    // most likely to be waiting for mail. Sent after the commit and not awaited
    // into the response: a transport outage must not make an attached, recorded
    // report look like a failed request, and a retry of a committed attach is
    // refused with 409 anyway.
    const recipient = await prisma.application
      .findUnique({ where: { id }, select: { submittedBy: { select: { email: true, name: true } } } })
      .then((found) => found?.submittedBy)
      .catch(() => null);

    if (recipient) {
      void sendFilingStatusChanged({
        to: recipient.email,
        submitterName: recipient.name,
        reference: target.reference,
        title: target.title,
        from: target.status,
        to_: "reported",
        changedByName: actor.name,
        note,
        filingUrl: absoluteUrl(`/applications/${id}`, request),
      }).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, ...serializeApplicationRow(row) });
  },
);
