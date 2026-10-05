import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { analysisServiceEnabled } from "@/lib/analysis-client";
import {
  applicationDetailRowSelect,
  serializeApplicationRow,
} from "@/lib/application-rows";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { applicationWhere } from "@/lib/scopes";
import { canAddFilesToFiling, canEditApplicationFiles } from "@/lib/upload-access";

const patchSchema = z.object({
  title: z.string().min(1, "Enter a filing title.").max(160),
});

/** The three tenant columns `applicationWhere` filters on. */
const scopeSelect = {
  id: true,
  associationId: true,
  pharmacyId: true,
} as const;

/**
 * Loads a filing and proves the caller may see it.
 *
 * The single-row routes re-apply `applicationWhere` rather than trusting the
 * id: `applicationWhere(actor) AND id = …` returns nothing for another tenant's
 * filing, so an out-of-scope id 404s instead of leaking its existence through a
 * 403. A worker probing ids learns only that the row does not exist.
 */
async function findScopedApplication(
  actor: Awaited<ReturnType<typeof requireUser>>,
  id: string,
) {
  return prisma.application.findFirst({
    where: { AND: [applicationWhere(actor), { id }] },
    select: scopeSelect,
  });
}

/**
 * GET /api/applications/[id]
 *
 * One filing, hydrated with its pharmacy, association, submitter, files, status
 * history and report — the exact `ApplicationRow` the list route returns, so the
 * detail page and the list can never disagree about a filing's shape.
 */
export const GET = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    const visible = await findScopedApplication(actor, id);
    if (!visible) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    const row = await prisma.application.findUniqueOrThrow({
      where: { id },
      select: applicationDetailRowSelect,
    });

    return NextResponse.json({
      ok: true,
      ...serializeApplicationRow(row, {
        id: actor.id,
        canEditFiles: canEditApplicationFiles(actor, visible),
        canAddFiles: canAddFilesToFiling(actor, visible),
      }),
      // So the detail page can hide the analysis action entirely when the
      // integration is off, instead of rendering a button that fails on click.
      analysisServiceAvailable: analysisServiceEnabled(),
    });
  },
);

/**
 * PATCH /api/applications/[id]
 *
 * Title only, and only for a super admin.
 *
 * The filing's tenant is immutable once submitted: `pharmacyId` and
 * `associationId` are what every file read is authorized against, so editing
 * them would silently re-home a filing — and its files — into another tenant.
 * `status` is not editable here either; it goes through `/status`, which writes
 * the `StatusEvent` that makes the change auditable. Accepting a status in this
 * route would let it change with no audit row.
 */
export const PATCH = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return apiError("not_found", "That filing does not exist.", 404);
    }

    // The body is read once and then checked twice. Reading it a second time
    // would fail (a Request body is a one-shot stream) and the catch would
    // silently hand the strict-key check an empty object, so an unknown key
    // would slip through and the request would 200 having changed only the title.
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        "invalid",
        parsed.error.issues[0]?.message ?? "Invalid request.",
        400,
      );
    }

    // Strict: an unknown key is a client bug or an attempt to set `status` or
    // `pharmacyId` through this route. zod strips unknown keys by default, so
    // without this check the request would quietly succeed having ignored the
    // field the caller actually cared about.
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const unexpected = Object.keys(body as Record<string, unknown>).filter(
        (key) => key !== "title",
      );
      if (unexpected.length > 0) {
        return apiError(
          "invalid",
          `Only the title can be edited here (rejected: ${unexpected.join(", ")}).`,
          400,
        );
      }
    }

    const target = await findScopedApplication(actor, id);
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
      return apiError("forbidden", "You cannot edit that filing.", 403);
    }

    const title = parsed.data.title.trim();
    await prisma.application.update({ where: { id }, data: { title } });

    const row = await prisma.application.findUniqueOrThrow({
      where: { id },
      select: applicationDetailRowSelect,
    });

    return NextResponse.json({
      ok: true,
      ...serializeApplicationRow(row, {
        id: actor.id,
        canEditFiles: canEditApplicationFiles(actor, target),
        canAddFiles: canAddFilesToFiling(actor, target),
      }),
    });
  },
);
