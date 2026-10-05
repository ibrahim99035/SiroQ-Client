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
import type { FilingStatusChangedContent } from "@/lib/mail";
import {
  absoluteUrl,
  sendFilingStatusChanged,
  sendFilingStatusChangedToAll,
} from "@/lib/mail";
import { requirePermission } from "@/lib/permissions";
import { applicationWhere } from "@/lib/scopes";
import { canEditApplicationFiles } from "@/lib/upload-access";

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
  // Excludes the submitter from the association fan-out below. An association
  // admin may file on their own association's behalf, and they would otherwise
  // receive the same report twice from the same transition.
  submittedById: true,
  // Presence only — enough to tell "a report is attached" from "no report".
  report: { select: { id: true } },
} as const;

/**
 * Default audit notes, so a transition still explains itself when the actor
 * types nothing. The audit trail is a record of what happened, and an empty
 * note makes the table decorative.
 *
 * The `reported` wording is the one that departs from the rest. This note is
 * quoted verbatim in the notification that says the report has been delivered,
 * and "Status advanced." reads as a placeholder in that context — it describes
 * the transition rather than what happened to the filing.
 */
function defaultNote(to: z.infer<typeof statusSchema>["to"]): string {
  switch (to) {
    case "in_review":
      return "Passed initial triage; assigned for review.";
    case "rejected":
      return "Reviewed and rejected against the filing manifest.";
    case "reported":
      return "Report delivered to the submitter.";
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

    const parsed = statusSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return apiError(
        "invalid",
        parsed.error.issues[0]?.message ?? "Invalid request.",
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
      requirePermission(actor, "updateApplicationStatus", {
        associationId: target.associationId,
        pharmacyId: target.pharmacyId,
        pharmacyAssociationId: target.associationId,
      });
    } catch {
      return apiError(
        "forbidden",
        "You cannot change this filing's status.",
        403,
      );
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
      return apiError(
        "conflict",
        "A reported filing cannot be re-statused.",
        409,
      );
    }

    // Same-status is a no-op rather than an error, so a double-click or a
    // retried request cannot spam the audit trail with duplicate rows.
    if (target.status === to) {
      const current = await prisma.application.findUniqueOrThrow({
        where: { id },
        select: applicationDetailRowSelect,
      });
      return NextResponse.json({
        ok: true,
        changed: false,
        ...serializeApplicationRow(current, {
          id: actor.id,
          canEditFiles: canEditApplicationFiles(actor, target),
        }),
      });
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
    if (to === "reported" || to === "rejected") {
      const content: FilingStatusChangedContent = {
        reference: target.reference,
        title: target.title,
        from: target.status,
        to_: to,
        changedByName: actor.name,
        note,
        filingUrl: absoluteUrl(`/applications/${id}`, request),
      };

      // Looked up here rather than carried on `scopeSelect` because this is the
      // one path that does not need it — `to` decides whether to notify at all,
      // and a filing with no submitter row must not suppress the admins below.
      const submitter = await prisma.application
        .findUnique({
          where: { id },
          select: { submittedBy: { select: { email: true, name: true } } },
        })
        .then((row) => row?.submittedBy)
        .catch(() => null);

      if (submitter) {
        void sendFilingStatusChanged({
          ...content,
          to: submitter.email,
          // The submitter is the recipient on this route, so their name is also
          // the name the message greets them by.
          recipientName: submitter.name,
        }).catch(() => undefined);
      }

      // `reported` copies in the association admins, matching the attach-report
      // route: a delivered report on any pharmacy in the association is a
      // decision its admins are accountable for, and the status route is now a
      // second way to reach that state, so both must notify the same people.
      // Rejection stays submitter-only — the triage bar offers it to any
      // reviewer, and widening it is a separate decision, not a side effect of
      // this one.
      //
      // Scoped by the filing's own `associationId` and nothing else, which is
      // what `applicationWhere` already grants these users, so this cannot leak
      // a tenant's title or reference across the estate.
      if (to === "reported") {
        const associationAdmins = await prisma.user
          .findMany({
            where: {
              associationId: target.associationId,
              role: "pharmacy_association_admin",
              // Disabled and still-invited accounts must not be mailed: a
              // disabled user has been removed for a reason, and an `invited`
              // address has never been proven to belong to its owner.
              status: "active",
            },
            select: { id: true, email: true, name: true },
          })
          .then((admins) =>
            admins.filter((admin) => admin.id !== target.submittedById),
          )
          .catch(() => []);

        if (associationAdmins.length > 0) {
          void sendFilingStatusChangedToAll(associationAdmins, content).catch(
            () => undefined,
          );
        }
      }
    }

    const row = await prisma.application.findUniqueOrThrow({
      where: { id },
      select: applicationDetailRowSelect,
    });

    return NextResponse.json({
      ok: true,
      changed: true,
      ...serializeApplicationRow(row, {
        id: actor.id,
        canEditFiles: canEditApplicationFiles(actor, target),
      }),
    });
  },
);
