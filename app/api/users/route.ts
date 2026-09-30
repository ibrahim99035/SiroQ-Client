import "server-only";

import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_MS,
  resolveInviteTarget,
} from "@/lib/invites";
import { absoluteUrl, sendWorkspaceInvite } from "@/lib/mail";
import { can, requirePermission } from "@/lib/permissions";
import { userDirectoryWhere } from "@/lib/scopes";

const inviteSchema = z.object({
  name: z.string().min(1, "Enter a name.").max(120),
  email: z.string().email("Enter a valid email address."),
  role: z.enum([
    "super_admin",
    "moderator",
    "pharmacy_association_admin",
    "pharmacy_worker",
  ]),
  associationId: z.string().uuid().optional(),
  pharmacyId: z.string().uuid().optional(),
});

const userListSelect = {
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
 * GET /api/users
 *
 * The team directory. Scope comes from the session, never the query string.
 *
 * Note a deliberate difference from the mock, which returned an empty array for
 * a caller lacking `manageUsers`. A real endpoint answers 403: an empty list
 * reads as "this workspace has no users", which is both wrong and a quieter
 * failure than an explicit refusal.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();
  if (!can(actor, "manageUsers")) {
    return apiError("forbidden", "You cannot view the team directory.", 403);
  }

  const search = new URL(request.url).searchParams.get("q")?.trim();
  const scoped = userDirectoryWhere(actor);
  const where: Prisma.UserWhereInput = search
    ? {
        AND: [
          scoped,
          {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        ],
      }
    : scoped;

  const users = await prisma.user.findMany({
    where,
    select: userListSelect,
    // Name first, then email, so the ordering is total and stable: two people
    // sharing a name must not swap places between two renders.
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return NextResponse.json({ ok: true, users });
});

/**
 * POST /api/users
 *
 * Admin-only: creates an `invited` user with a NULL password hash and mails a
 * single-use invitation link. The account cannot sign in until that link is
 * accepted, which is what keeps the workspace invite-only.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const actor = await requireUser();
  requirePermission(actor, "manageUsers");

  const parsed = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const { name, email, role, associationId, pharmacyId } = parsed.data;
  const normalisedEmail = email.toLowerCase().trim();

  // A worker must land inside the actor's own association, otherwise the
  // invite would grant visibility into a tenant the inviter cannot see.
  const actorIsGlobal = actor.role === "super_admin";
  const resolved = resolveInviteTarget({
    role,
    associationId,
    pharmacyId,
    actorAssociationId: actor.associationId,
    actorIsGlobal,
  });
  if (!resolved.ok) {
    return apiError("forbidden", resolved.message, 403);
  }
  const target = resolved.target;

  if (target.pharmacyId) {
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: target.pharmacyId },
      select: { id: true, associationId: true, status: true },
    });
    if (!pharmacy) {
      return apiError("invalid", "That pharmacy does not exist.", 400);
    }
    if (!actorIsGlobal && pharmacy.associationId !== actor.associationId) {
      return apiError("forbidden", "That pharmacy is outside your association.", 403);
    }
    if (pharmacy.status !== "active") {
      return apiError("invalid", "That pharmacy is not active.", 400);
    }
    // Workers inherit the association from their pharmacy, so `can()` scoping
    // works without a second denormalised column.
    target.associationId = pharmacy.associationId;
  }

  if (target.associationId && !target.pharmacyId) {
    const association = await prisma.pharmacyAssociation.findUnique({
      where: { id: target.associationId },
      select: { id: true, status: true },
    });
    if (!association) {
      return apiError("invalid", "That association does not exist.", 400);
    }
    if (association.status !== "active") {
      return apiError("invalid", "That association is not active.", 400);
    }
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const existing = await prisma.user.findUnique({
    where: { email: normalisedEmail },
    select: { id: true, status: true, passwordHash: true },
  });

  // A public `/signup` submission already creates a tenantless `invited` row, so
  // adopting one is the normal admin path rather than a conflict. Only accounts
  // that were never activated may be adopted: an active or disabled account keeps
  // its existing identity, tenant, and access, and must not be silently reset.
  if (existing && (existing.status !== "invited" || existing.passwordHash !== null)) {
    return apiError("conflict", "An account with that email already exists.", 409);
  }

  const select = { id: true, name: true, email: true, role: true, status: true } as const;
  const user = existing
    ? await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          role: target.role,
          associationId: target.associationId,
          pharmacyId: target.pharmacyId,
          // Replaces any earlier token, so a link mailed before the attach
          // stops working once the account is attached to a tenant.
          inviteTokenHash: hashInviteToken(token),
          inviteExpiresAt: expiresAt,
          invitedById: actor.id,
        },
        select,
      })
    : await prisma.user.create({
        data: {
          name,
          email: normalisedEmail,
          role: target.role,
          status: "invited",
          passwordHash: null,
          associationId: target.associationId,
          pharmacyId: target.pharmacyId,
          inviteTokenHash: hashInviteToken(token),
          inviteExpiresAt: expiresAt,
          invitedById: actor.id,
        },
        select,
      });

  const delivery = await sendWorkspaceInvite({
    to: user.email,
    name: user.name,
    inviterName: actor.name,
    inviteUrl: absoluteUrl(`/invite/${token}`, request),
  });

  return NextResponse.json(
    {
      ok: true,
      user,
      // True when an existing public `/signup` request was adopted rather than a
      // new account being created.
      attached: Boolean(existing),
      // The link is returned so an admin can pass it on when SMTP is not
      // configured. It is not logged and not exposed to non-admins.
      inviteUrl: absoluteUrl(`/invite/${token}`, request),
      mailDelivered: delivery.delivered,
    },
    { status: 201 },
  );
});
