import "server-only";

import type { Prisma } from "@prisma/client";

import { can, type PermissionUser } from "@/lib/permissions";

/**
 * Tenant scoping: session → Prisma `where`.
 *
 * Every listing route derives its filter from the **session**, never from a
 * tenant id in the request body. A body-supplied `associationId` is the classic
 * multi-tenant IDOR — the caller asks for someone else's rows and the handler
 * obliges. Filtering inside the query also means a page size can never widen the
 * scope: rows outside it are simply not selected, rather than being selected and
 * then discarded.
 *
 * Each `where` is the *maximal* set of rows the actor may ever see. Narrowing
 * further (a search term, a status filter) is applied on top with `AND`, and
 * single-row routes re-check with the same rule.
 */

/** Matches nothing. Used for a role that may see rows but has no tenant bound. */
function none<T extends string>(): { in: T[] } {
  return { in: [] };
}

/**
 * Read-everything, decided by the permission engine rather than a role name.
 *
 * `viewAllData` is the whole-estate read right, granted to super admins *and*
 * moderators. Testing `role === "super_admin"` here would silently strip
 * moderators of every listing — the same trap documented in
 * `lib/upload-access.ts`. Mutations are a different question and go through
 * `requirePermission("manageAssociations" | "managePharmacies")`, which only a
 * super admin satisfies.
 */
function readsEverything(actor: PermissionUser): boolean {
  return can(actor, "viewAllData");
}

/**
 * Users visible in the team directory.
 *
 * Deliberately *not* `viewAllData`: the team directory is a management surface
 * gated by `manageUsers`, and a moderator holds no management rights.
 */
export function userDirectoryWhere(actor: PermissionUser): Prisma.UserWhereInput {
  if (actor.role === "super_admin") return {};
  if (actor.role === "pharmacy_association_admin") {
    return actor.associationId ? { associationId: actor.associationId } : { id: none() };
  }
  return { id: none() };
}

/** Associations visible to the actor. */
export function associationWhere(actor: PermissionUser): Prisma.PharmacyAssociationWhereInput {
  if (readsEverything(actor)) return {};
  if (actor.role === "pharmacy_association_admin" && actor.associationId) {
    return { id: actor.associationId };
  }
  return { id: none() };
}

/**
 * Pharmacies visible to the actor.
 *
 * A worker sees only the pharmacy they are bound to — the filing form needs a
 * list and must not become a directory of the whole estate.
 */
export function pharmacyWhere(actor: PermissionUser): Prisma.PharmacyWhereInput {
  if (readsEverything(actor)) return {};
  if (actor.role === "pharmacy_association_admin" && actor.associationId) {
    return { associationId: actor.associationId };
  }
  if (actor.role === "pharmacy_worker" && actor.pharmacyId) {
    return { id: actor.pharmacyId };
  }
  return { id: none() };
}

/**
 * Applications visible to the actor, and the tenant fields used to authorize a
 * single filing. Mirrors the scope rules in `docs/AUTHORIZATION.md`.
 */
export function applicationWhere(actor: PermissionUser): Prisma.ApplicationWhereInput {
  if (readsEverything(actor)) return {};
  if (actor.role === "pharmacy_association_admin") {
    return actor.associationId ? { associationId: actor.associationId } : { id: none() };
  }
  if (actor.role === "pharmacy_worker") {
    return actor.pharmacyId ? { pharmacyId: actor.pharmacyId } : { id: none() };
  }
  return { id: none() };
}
