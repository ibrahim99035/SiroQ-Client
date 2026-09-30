import "server-only";

import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveInviteTarget } from "@/lib/invites";
import { requirePermission } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1, "Enter a name.").max(120).optional(),
  email: z.string().email("Enter a valid email address.").optional(),
  role: z
    .enum(["super_admin", "moderator", "pharmacy_association_admin", "pharmacy_worker"])
    .optional(),
  status: z.enum(["active", "invited", "disabled"]).optional(),
  associationId: z.string().uuid().nullable().optional(),
  pharmacyId: z.string().uuid().nullable().optional(),
});

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  associationId: true,
  pharmacyId: true,
  status: true,
  createdAt: true,
} as const;

/**
 * A target user plus everything needed to decide whether the actor may touch
 * them. Loaded before any write so an unauthorized edit cannot half-apply.
 */
async function loadTarget(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { ...userSelect, passwordHash: true } });
}

/**
 * Guards that apply to every write against `target`.
 *
 * The super-admin rule is a privilege-escalation guard, not a nicety: without
 * it an association admin could edit a platform account. The last-active check
 * is a lockout guard: demoting or disabling the only super admin leaves nobody
 * able to reverse it.
 */
async function guardWritable(actor: Awaited<ReturnType<typeof requireUser>>, target: NonNullable<Awaited<ReturnType<typeof loadTarget>>>) {
  if (target.role === "super_admin" && actor.role !== "super_admin") {
    return apiError("forbidden", "Only super admins can modify super admins.", 403);
  }
  if (target.id === actor.id) {
    return apiError(
      "invalid",
      "You cannot change your own role or disable your own account.",
      409,
    );
  }
  const others = await prisma.user.count({
    where: { role: "super_admin", status: "active", id: { not: target.id } },
  });
  return others === 0 && target.role === "super_admin" && target.status === "active"
    ? apiError(
        "invalid",
        "This is the last active super admin. Promote someone else first.",
        409,
      )
    : null;
}

/**
 * Validates the *resulting* tenant assignment.
 *
 * `resolveInviteTarget` is reused deliberately: an update that moves someone into
 * a tenant is the same decision as inviting them there, and must obey the same
 * rule. It deliberately does not check that a pharmacy belongs to the actor's
 * association, so that is checked here — exactly as `POST /api/users` does.
 */
async function guardTenant(
  actor: Awaited<ReturnType<typeof requireUser>>,
  next: { role: Role; associationId: string | null; pharmacyId: string | null },
) {
  const resolved = resolveInviteTarget({
    role: next.role,
    associationId: next.associationId,
    pharmacyId: next.pharmacyId,
    actorAssociationId: actor.associationId,
    actorIsGlobal: actor.role === "super_admin",
  });
  if (!resolved.ok) return apiError("forbidden", resolved.message, 403);

  if (next.pharmacyId) {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: next.pharmacyId },
      select: { associationId: true, status: true },
    });
    if (!pharmacy) return apiError("invalid", "That pharmacy does not exist.", 400);
    if (pharmacy.status !== "active") {
      return apiError("invalid", "That pharmacy is not active.", 400);
    }
    if (actor.role !== "super_admin" && pharmacy.associationId !== actor.associationId) {
      return apiError("forbidden", "That pharmacy is outside your association.", 403);
    }
  }
  if (next.associationId) {
    const association = await prisma.pharmacyAssociation.findUnique({
      where: { id: next.associationId },
      select: { status: true },
    });
    if (!association) return apiError("invalid", "That association does not exist.", 400);
    if (association.status !== "active") {
      return apiError("invalid", "That association is not active.", 400);
    }
  }
  return null;
}

/**
 * PATCH /api/users/[id]
 *
 * Partial update of a directory entry. Every field is optional; absent fields
 * keep their current value. Tenant assignment is re-validated against the
 * resulting state, so changing only `role` still checks where the account lands.
 */
export const PATCH = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    const target = await loadTarget(id);
    if (!target) return apiError("not_found", "That user does not exist.", 404);

    const blocked = await guardWritable(actor, target);
    if (blocked) return blocked;

    // Scoped by the *target's* tenant, not the request body: an association
    // admin may edit their own people and nobody else's.
    try {
      requirePermission(actor, "manageUsers", { associationId: target.associationId ?? undefined });
    } catch {
      return apiError("forbidden", "You cannot edit that user.", 403);
    }

    const nextRole = parsed.data.role ?? target.role;
    const nextStatus = parsed.data.status ?? target.status;
    const nextAssociation =
      "associationId" in parsed.data ? parsed.data.associationId : target.associationId;
    const nextPharmacy = "pharmacyId" in parsed.data ? parsed.data.pharmacyId : target.pharmacyId;

    const tenantBlocked = await guardTenant(actor, {
      role: nextRole,
      associationId: nextAssociation ?? null,
      pharmacyId: nextPharmacy ?? null,
    });
    if (tenantBlocked) return tenantBlocked;

    // An account with no password cannot be switched to `active`: it would look
    // usable but be unable to authenticate. Acceptance is the only way in.
    if (nextStatus === "active" && !target.passwordHash) {
      return apiError(
        "invalid",
        "This invitation has not been accepted yet, so the account has no password.",
        409,
      );
    }

    const nextEmail = (parsed.data.email ?? target.email).toLowerCase().trim();
    if (nextEmail !== target.email) {
      const clash = await prisma.user.findUnique({ where: { email: nextEmail }, select: { id: true } });
      if (clash) {
        return apiError("conflict", "A different user already uses that email.", 409);
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(nextEmail !== target.email ? { email: nextEmail } : {}),
        ...(parsed.data.role !== undefined ? { role: nextRole } : {}),
        ...(parsed.data.status !== undefined
          ? {
              status: nextStatus,
              // Keeps the audit field in step with the status, so "disabled" and
              // a null disabledAt can never disagree.
              disabledAt: nextStatus === "disabled" ? new Date() : null,
            }
          : {}),
        ...("associationId" in parsed.data ? { associationId: nextAssociation } : {}),
        ...("pharmacyId" in parsed.data ? { pharmacyId: nextPharmacy } : {}),
      },
      select: userSelect,
    });

    return NextResponse.json({ ok: true, user });
  },
);

/**
 * DELETE /api/users/[id]
 *
 * Hard delete, but **only for an account with no history**. `submittedBy`,
 * `changedBy` and `generatedBy` all default to `onDelete: Restrict`, and an
 * uploader's own filing is evidence that should not vanish with their account —
 * so a user who has ever submitted a filing, moved a status, generated a report,
 * or uploaded a file is refused with a pointer to disabling them instead.
 */
export const DELETE = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;

    const target = await loadTarget(id);
    if (!target) return apiError("not_found", "That user does not exist.", 404);

    if (target.id === actor.id) {
      return apiError("invalid", "You cannot remove the identity you are acting as.", 409);
    }
    if (target.role === "super_admin" && actor.role !== "super_admin") {
      return apiError("forbidden", "Only super admins can modify super admins.", 403);
    }
    try {
      requirePermission(actor, "manageUsers", { associationId: target.associationId ?? undefined });
    } catch {
      return apiError("forbidden", "You cannot remove that user.", 403);
    }

    const [applications, events, reports, uploads, files] = await Promise.all([
      prisma.application.count({ where: { submittedById: id } }),
      prisma.statusEvent.count({ where: { changedById: id } }),
      prisma.report.count({ where: { generatedById: id } }),
      prisma.upload.count({ where: { uploadedById: id } }),
      prisma.applicationFile.count({ where: { uploadedById: id } }),
    ]);
    const history = applications + events + reports + uploads + files;
    if (history > 0) {
      return apiError(
        "conflict",
        `This account has ${history} filing record(s) attached to it. ` +
          "Disable the account instead so its history stays intact.",
        409,
      );
    }

    // Auxiliary rows first: `sessions` and `passwordResets` restrict the delete.
    await prisma.$transaction([
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
    ]);
    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ ok: true, removed: id });
  },
);
