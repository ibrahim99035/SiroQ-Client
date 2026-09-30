import "server-only";

import { prisma } from "@/lib/db";
import { can, type PermissionResource, type PermissionUser } from "@/lib/permissions";

/**
 * Tenant scoping for uploaded files.
 *
 * Every read or write of a stored object must answer one question: does this
 * file belong to the tenant the caller is scoped to? The answers live in the
 * `Application` row that owns the file, so they are resolved here once and the
 * existing permission engine decides — routes never compare roles themselves.
 *
 * `Application` denormalises both `pharmacyId` and `associationId`
 * (see prisma/schema.prisma), so no join is required to build the resource.
 */

/** The subset of an application needed to authorize access to its files. */
interface ApplicationScope {
  id: string;
  associationId: string;
  pharmacyId: string;
}

function toResource(application: ApplicationScope): PermissionResource {
  return {
    associationId: application.associationId,
    pharmacyId: application.pharmacyId,
    // The pharmacy's owning association, so association admins can be scoped
    // without loading the pharmacy row.
    pharmacyAssociationId: application.associationId,
  };
}

export function applicationScope(application: ApplicationScope): PermissionResource {
  return toResource(application);
}

/**
 * Resolves the application that owns an upload, or `null` when the upload is
 * not attached to a filing yet.
 *
 * Unattached uploads exist in the "pick a file, then start a filing" flow. They
 * are not part of any tenant yet, so callers must fall back to owner-only
 * access for them.
 */
export async function resolveUploadApplication(
  upload: { applicationId: string | null },
): Promise<ApplicationScope | null> {
  if (!upload.applicationId) return null;
  return prisma.application.findUnique({
    where: { id: upload.applicationId },
    select: { id: true, associationId: true, pharmacyId: true },
  });
}

/**
 * May this user download the file behind this upload?
 *
 * Global roles keep full access. Otherwise the caller's tenant must match the
 * filing's tenant: an association admin is confined to their own association,
 * a worker to their own pharmacy.
 *
 * `can(user, "viewAllData")` is checked alongside the tenant-scoped action
 * because `moderator` is only granted `viewAllData` — testing the scoped
 * action alone would silently strip moderators of file access.
 */
export function canReadUpload(
  user: PermissionUser,
  upload: { uploadedById: string; applicationId: string | null },
  application: ApplicationScope | null,
): boolean {
  if (user.status !== "active") return false;
  // The uploader can always retrieve the file they just sent.
  if (upload.uploadedById === user.id) return true;
  if (can(user, "viewAllData")) return true;
  if (!application) return false;
  return can(user, "viewPharmacyData", toResource(application));
}

/**
 * May this user attach a *file* to this application?
 *
 * This used to test `can(user, "attachReport")`, on the reasoning that "a file
 * is a report on a filing". That conflated two unrelated rights, and it had a
 * real consequence: `attachReport` is the action that flips a filing to
 * `reported`, so borrowing it to authorise a *pharmacy-side file write* meant a
 * pharmacy worker could self-attach a report to her own filing and mark it
 * reported — the terminal, delivered state — with Requis's own review output
 * never having happened. `attachReport` is now super-admin only.
 *
 * The right modelled here is `createApplication`: adding evidence to a filing
 * inside your own tenant is the same class of write as filing one, and both are
 * pharmacy-side. Producing the review report is Requis-side.
 */
export function canAttachToApplication(
  user: PermissionUser,
  application: ApplicationScope,
): boolean {
  if (user.status !== "active") return false;
  if (can(user, "viewAllData")) return true;
  return can(user, "createApplication", toResource(application));
}
