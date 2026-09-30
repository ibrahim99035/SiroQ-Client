import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const patchSchema = z.object({
  associationId: z.string().uuid().optional(),
  name: z.string().min(1, "Enter a name.").max(120).optional(),
  address: z.string().min(1, "Enter an address.").max(240).optional(),
  licenseNumber: z.string().min(1, "Enter the licence number.").max(60).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

const pharmacySelect = {
  id: true,
  associationId: true,
  name: true,
  address: true,
  licenseNumber: true,
  status: true,
  createdAt: true,
} as const;

/**
 * PATCH /api/pharmacies/[id]
 *
 * Super-admin only. Re-parenting a pharmacy is allowed, but only to a real,
 * active association — moving a tenant between associations is exactly the
 * operation that must never be applied to a mistyped id.
 */
export const PATCH = withErrorHandling(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;
    try {
      requirePermission(actor, "managePharmacies");
    } catch {
      return apiError("forbidden", "You cannot edit pharmacies.", 403);
    }

    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
    }

    const existing = await prisma.pharmacy.findUnique({
      where: { id },
      select: { id: true, associationId: true },
    });
    if (!existing) return apiError("not_found", "That pharmacy does not exist.", 404);

    if (parsed.data.associationId && parsed.data.associationId !== existing.associationId) {
      const association = await prisma.pharmacyAssociation.findUnique({
        where: { id: parsed.data.associationId },
        select: { id: true, status: true },
      });
      if (!association) {
        return apiError("invalid", "That association does not exist.", 400);
      }
      if (association.status !== "active") {
        return apiError("invalid", "That association is not active.", 400);
      }
    }

    const pharmacy = await prisma.pharmacy.update({
      where: { id },
      data: parsed.data,
      select: pharmacySelect,
    });

    return NextResponse.json({ ok: true, pharmacy });
  },
);

/**
 * DELETE /api/pharmacies/[id]
 *
 * Refused while the pharmacy holds filings, users, or uploads: all three
 * relations cascade, so the delete would take the tenant's filing history with
 * it. Suspend instead.
 */
export const DELETE = withErrorHandling(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireUser();
    const { id } = await context.params;
    try {
      requirePermission(actor, "managePharmacies");
    } catch {
      return apiError("forbidden", "You cannot delete pharmacies.", 403);
    }

    const existing = await prisma.pharmacy.findUnique({
      where: { id },
      // A pharmacy has no direct upload relation — files hang off applications
      // and users — so filings and users are the two things that must be empty.
      select: { id: true, _count: { select: { applications: true, users: true } } },
    });
    if (!existing) return apiError("not_found", "That pharmacy does not exist.", 404);

    const { applications, users } = existing._count;
    if (applications + users > 0) {
      return apiError(
        "conflict",
        `This pharmacy still holds ${applications} filing(s) and ${users} user(s). ` +
          "Deleting it would remove all of them — suspend it instead.",
        409,
      );
    }

    await prisma.pharmacy.delete({ where: { id } });
    return NextResponse.json({ ok: true, removed: id });
  },
);
