import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { pharmacyWhere } from "@/lib/scopes";

const createSchema = z.object({
  associationId: z.string().uuid("Choose the owning association."),
  name: z.string().min(1, "Enter a name.").max(120),
  address: z.string().min(1, "Enter an address.").max(240),
  licenseNumber: z.string().min(1, "Enter the licence number.").max(60),
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
 * GET /api/pharmacies
 *
 * Scoped from the session. A worker sees exactly one row — their own pharmacy —
 * because this list feeds the "new filing" picker and must not double as an
 * estate directory.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();

  const search = new URL(request.url).searchParams.get("q")?.trim();
  const scoped = pharmacyWhere(actor);
  const pharmacies = await prisma.pharmacy.findMany({
    where: search ? { AND: [scoped, { name: { contains: search, mode: "insensitive" } }] } : scoped,
    select: {
      ...pharmacySelect,
      association: {
        select: { id: true, name: true, region: true, gmpCertificateId: true, status: true, createdAt: true },
      },
      _count: { select: { applications: true } },
    },
    orderBy: [{ name: "asc" }, { address: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    pharmacies: pharmacies.map(({ _count, ...pharmacy }) => ({
      ...pharmacy,
      applicationCount: _count.applications,
    })),
  });
});

/**
 * POST /api/pharmacies
 *
 * Super-admin only (`managePharmacies`). The owning association is checked to be
 * real and active before the insert, so a pharmacy cannot be filed under a
 * suspended or mistyped association.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();
  try {
    requirePermission(actor, "managePharmacies");
  } catch {
    return apiError("forbidden", "You cannot create pharmacies.", 403);
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

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

  const pharmacy = await prisma.pharmacy.create({
    data: { ...parsed.data, status: "active" },
    select: pharmacySelect,
  });

  return NextResponse.json({ ok: true, pharmacy }, { status: 201 });
});
