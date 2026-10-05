import "server-only";

import { prisma } from "@/lib/db";
import {
  can,
  type PermissionResource,
  type PermissionUser,
} from "@/lib/permissions";

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

export function applicationScope(
  application: ApplicationScope,
): PermissionResource {
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
export async function resolveUploadApplication(upload: {
  applicationId: string | null;
}): Promise<ApplicationScope | null> {
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
 * reported — the terminal, delivered state — with SiroQ's own review output
 * never having happened. `attachReport` is now super-admin only.
 *
 * The right modelled here is `createApplication`: adding evidence to a filing
 * inside your own tenant is the same class of write as filing one, and both are
 * pharmacy-side. Producing the review report is SiroQ-side.
 */
export function canAttachToApplication(
  user: PermissionUser,
  application: ApplicationScope,
): boolean {
  if (user.status !== "active") return false;
  if (can(user, "viewAllData")) return true;
  return can(user, "createApplication", toResource(application));
}

/**
 * May this user replace or delete one specific file on a filing?
 *
 * Two grants, either sufficient:
 *
 *  - they uploaded it, so they can correct their own submission; and
 *  - `editApplicationFiles`, which is super-admin only. Reviewers and tenant
 *    admins get neither, which is deliberate: swapping the bytes under a filing
 *    changes the evidence a review was performed on, so it is not a tenant-scoped
 *    write like attaching a file is. Attaching is modelled as
 *    `createApplication` in `canAttachToApplication` above, and the two
 *    deliberately disagree.
 *
 * Ownership is checked before the role so that a worker who uploaded a file is
 * not silently relying on `editApplicationFiles`, which they do not hold. The
 * uploader of a *different* file on the same filing gets nothing here: the test
 * is against this row's `uploadedById`, not the filing's submitter.
 */
export function canEditApplicationFiles(
  user: PermissionUser,
  application: ApplicationScope,
): boolean {
  if (user.status !== "active") return false;
  return can(user, "editApplicationFiles", toResource(application));
}

export function canEditApplicationFile(
  user: PermissionUser,
  file: { uploadedById: string },
  application: ApplicationScope,
): boolean {
  if (user.status !== "active") return false;
  if (file.uploadedById === user.id) return true;
  return canEditApplicationFiles(user, application);
}

/**
 * May this user add another file to a filing that already exists?
 *
 * This is `canAttachToApplication`, unchanged, and deliberately so. Adding a
 * file to a filing is the same act as attaching one while filing it: a
 * pharmacy-side write inside the caller's own tenant. An earlier draft of this
 * work narrowed it to "super admin, or the filing's submitter", on the reasoning
 * that topping up somebody else's filing is a stronger claim than filing your
 * own. That reasoning was sound but the restriction was not asked for, and it
 * took away a capability the product has always had — association admins upload
 * on behalf of their pharmacies, and `verify-authz` asserts exactly that.
 * Narrowing an existing permission is a product decision, not a refactoring
 * detail, so it does not belong in a change whose subject is "you may add more
 * than one file".
 *
 * What is new is only the absence of a status gate: see
 * `canAttachToApplication` above for why that call is tenant-scoped, and note
 * that no `Application.status` is consulted anywhere on this path. Evidence can
 * be added at any point in the lifecycle, including after a report was attached.
 * The re-analysis that adding a file triggers is what keeps an already-reported
 * filing's analysis current — a lock would only have refused the correction and
 * left the analysis describing files that are no longer there.
 */
export function canAddFilesToFiling(
  user: PermissionUser,
  application: ApplicationScope,
): boolean {
  return canAttachToApplication(user, application);
}
