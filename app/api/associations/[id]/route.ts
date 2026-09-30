import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const patchSchema = z.object({
  name: z.string().min(1, "Enter a name.").max(120).optional(),
  region: z.string().min(1, "Enter a region.").max(120).optional(),
  gmpCertificateId: z.string().min(1, "Enter the GMP certificate id.").max(60).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

const associationSelect = {
  id: true,
  name: true,
  region: true,
  gmpCertificateId: true,
  status: true,
  createdAt: true,
} as const;

/**
 * PATCH /api/associations/[id]
 *
 * Super-admin only. Status is a suspend/activate toggle rather than a delete:
 * an association owns its pharmacies and filings through `onDelete: Cascade`,
 * so removing one would destroy tenant data that filings depend on.
 */
export const PATCH = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;
    try {
      requirePermission(actor, "manageAssociations");
    } catch {
      return apiError("forbidden", "You cannot edit associations.", 403);
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    const existing = await prisma.pharmacyAssociation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return apiError("not_found", "That association does not exist.", 404);

    const association = await prisma.pharmacyAssociation.update({
      where: { id },
      data: parsed.data,
      select: associationSelect,
    });

    return NextResponse.json({ ok: true, association });
  },
);

/**
 * DELETE /api/associations/[id]
 *
 * Refused while the association still holds pharmacies or filings, because both
 * relations cascade: the delete would silently take tenant data with it.
 * Suspending is the reversible action; deleting is only for an empty shell.
 */
export const DELETE = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;
    try {
      requirePermission(actor, "manageAssociations");
    } catch {
      return apiError("forbidden", "You cannot delete associations.", 403);
    }

    const existing = await prisma.pharmacyAssociation.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { pharmacies: true, applications: true, users: true } },
      },
    });
    if (!existing) return apiError("not_found", "That association does not exist.", 404);

    const { pharmacies, applications, users } = existing._count;
    if (pharmacies + applications + users > 0) {
      return apiError(
        "conflict",
        `This association still holds ${pharmacies} pharmac(ies), ${applications} filing(s) ` +
          `and ${users} user(s). Deleting it would remove all of them — suspend it instead.`,
        409,
      );
    }

    await prisma.pharmacyAssociation.delete({ where: { id } });
    return NextResponse.json({ ok: true, removed: id });
  },
);
