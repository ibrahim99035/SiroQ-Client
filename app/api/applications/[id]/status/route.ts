import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import {
  applicationDetailRowSelect,
  serializeApplicationRow,
} from "@/lib/application-rows";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { absoluteUrl, sendFilingStatusChanged } from "@/lib/mail";
import { requirePermission } from "@/lib/permissions";
import { applicationWhere } from "@/lib/scopes";

const statusSchema = z.object({
  to: z.enum(["pending", "in_review", "reported", "rejected"]),
  note: z.string().max(500).optional(),
});

const scopeSelect = {
  id: true,
  // Carried because they appear in the notification to the submitter; a lookup
  // after the commit would only re-read what the authorised fetch already has.
  title: true,
  reference: true,
  associationId: true,
  pharmacyId: true,
  status: true,
  // Presence only — enough to tell "a report is attached" from "no report".
  report: { select: { id: true } },
} as const;

/**
 * Default audit notes, so a transition still explains itself when the actor
 * types nothing. Kept identical to the mock's wording: the audit trail is a
 * record of what happened, and an empty note makes the table decorative.
 */
function defaultNote(to: z.infer<typeof statusSchema>["to"]): string {
  switch (to) {
    case "in_review":
      return "Passed initial triage; assigned for review.";
    case "rejected":
      return "Reviewed and rejected against the filing manifest.";
    case "reported":
      return "Status advanced.";
    case "pending":
      return "Filing reopened for more information.";
  }
}

/**
 * PATCH /api/applications/[id]/status
 *
 * The filing's status and its audit row are written in a single `$transaction`.
 * This is the whole reason `StatusEvent` exists: a status change with no event
 * (or an event with no status change) is an unaudited state, and a half-applied
 * transition — status moved, event lost to a crash — is worse than either,
 * because the history then contradicts the row it describes.
 */
export const PATCH = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    const parsed = statusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    const target = await prisma.application.findFirst({
      where: { AND: [applicationWhere(actor), { id }] },
      select: scopeSelect,
    });
    if (!target) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    try {
      requirePermission(actor, "updateApplicationStatus", {
        associationId: target.associationId,
        pharmacyId: target.pharmacyId,
        pharmacyAssociationId: target.associationId,
      });
    } catch {
      return apiError("forbidden", "You cannot change this filing's status.", 403);
    }

    const to = parsed.data.to;

    // A report is what makes a filing "reported". Letting this route set the
    // flag on its own would produce a reported filing with no `Report` row,
    // which the detail page renders as an empty report panel.
    if (to === "reported" && !target.report) {
      return apiError(
        "invalid",
        "Attach a report to mark a filing as reported.",
        409,
      );
    }

    // Terminal. A reported filing is a delivered artefact; reopening it would
    // invalidate the report that was already handed to the pharmacy.
    if (target.status === "reported") {
      return apiError("conflict", "A reported filing cannot be re-statused.", 409);
    }

    // Same-status is a no-op rather than an error, so a double-click or a
    // retried request cannot spam the audit trail with duplicate rows.
    if (target.status === to) {
      const current = await prisma.application.findUniqueOrThrow({
        where: { id },
        select: applicationDetailRowSelect,
      });
      return NextResponse.json({ ok: true, changed: false, ...serializeApplicationRow(current) });
    }

    const note = parsed.data.note?.trim() || defaultNote(to);

    await prisma.$transaction(async (tx) => {
      await tx.application.update({ where: { id }, data: { status: to } });
      await tx.statusEvent.create({
        data: {
          applicationId: id,
          // Recorded on the event, not inferred later: the previous status is
          // part of the audit fact and cannot be recovered from the row once
          // it has moved on.
          fromStatus: target.status,
          to,
          changedById: actor.id,
          note,
        },
      });
    });

    // Notification after the transaction commits, and deliberately not awaited
    // into the response path. The write is the audited fact; mail is a courtesy
    // derived from it. A transport outage must not turn a successful, committed
    // transition into an error the caller retries — which would also risk a
    // duplicate event if the retry raced a partially-succeeded first call.
    const recipient = await prisma.application
      .findUnique({ where: { id }, select: { submittedBy: { select: { email: true, name: true } } } })
      .then((row) => row?.submittedBy)
      .catch(() => null);

    if (recipient && (to === "reported" || to === "rejected")) {
      void sendFilingStatusChanged({
        to: recipient.email,
        submitterName: recipient.name,
        reference: target.reference,
        title: target.title,
        from: target.status,
        to_: to,
        changedByName: actor.name,
        note,
        filingUrl: absoluteUrl(`/applications/${id}`, request),
      }).catch(() => undefined);
    }

    const row = await prisma.application.findUniqueOrThrow({
      where: { id },
      select: applicationDetailRowSelect,
    });

    return NextResponse.json({ ok: true, changed: true, ...serializeApplicationRow(row) });
  },
);
