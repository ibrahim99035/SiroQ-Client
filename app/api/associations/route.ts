import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { associationWhere } from "@/lib/scopes";

const createSchema = z.object({
  name: z.string().min(1, "Enter a name.").max(120),
  region: z.string().min(1, "Enter a region.").max(120),
  gmpCertificateId: z.string().min(1, "Enter the GMP certificate id.").max(60),
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
 * GET /api/associations
 *
 * Scoped from the session: a super admin and a moderator see the whole estate,
 * an association admin only their own association. A worker sees none — the
 * associations screen is an administration surface, and the mock leaked the full
 * list to every role, which is a real over-permission worth not reproducing.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();

  const search = new URL(request.url).searchParams.get("q")?.trim();
  const scoped = associationWhere(actor);
  const associations = await prisma.pharmacyAssociation.findMany({
    where: search ? { AND: [scoped, { name: { contains: search, mode: "insensitive" } }] } : scoped,
    select: {
      ...associationSelect,
      // Counts arrive with the row rather than as a second round trip, and are
      // used by the directory table and the delete-confirmation copy.
      _count: { select: { pharmacies: true, applications: true } },
    },
    orderBy: [{ name: "asc" }, { region: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    associations: associations.map(({ _count, ...association }) => ({
      ...association,
      pharmacyCount: _count.pharmacies,
      applicationCount: _count.applications,
    })),
  });
});

/**
 * POST /api/associations
 *
 * Super-admin only (`manageAssociations`). `region` and `gmpCertificateId` are
 * required rather than optional: the schema has no default and a half-described
 * association cannot be scoped to or reported on.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();
  try {
    requirePermission(actor, "manageAssociations");
  } catch {
    return apiError("forbidden", "You cannot create associations.", 403);
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const association = await prisma.pharmacyAssociation.create({
    data: { ...parsed.data, status: "active" },
    select: associationSelect,
  });

  return NextResponse.json({ ok: true, association }, { status: 201 });
});
