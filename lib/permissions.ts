import type { User } from "./types";

/**
 * Centralized permission engine. Every conditional render, route guard,
 * and mutation gate in the app must go through `can` / `requirePermission`.
 * Never inline `user.role === "..."` checks in components.
 */

/**
 * The only fields an authorization decision actually reads.
 *
 * Declared structurally rather than as `Pick<User, ...>` so that both a `User`
 * from the UI (which omits the tenant ids) and a `SessionUser` resolved from
 * the cookie (which sets them to `null`) are accepted. Server routes can
 * therefore pass the session user straight in, without widening it to carry
 * display-only fields like `createdAt`.
 *
 * `id` is not read by `can` — it is carried so ownership checks ("is this your
 * own record?") can be made alongside the role check without a second lookup.
 */
export interface PermissionUser {
  id: string;
  role: User["role"];
  status: User["status"];
  associationId?: string | null;
  pharmacyId?: string | null;
}
export type PermissionAction =
  | "viewAllData"
  | "viewAssociationData"
  | "viewPharmacyData"
  | "createApplication"
  | "attachReport"
  | "updateApplicationStatus"
  | "manageUsers"
  | "manageAssociations"
  | "managePharmacies";

export interface PermissionResource {
  /** For association-scoped resources: which association owns the resource. */
  associationId?: string;
  /** For pharmacy-scoped resources: which pharmacy the resource belongs to. */
  pharmacyId?: string;
  /** Owner association of a pharmacy resource (needed to scope association admins). */
  pharmacyAssociationId?: string;
}

export class PermissionError extends Error {
  user: PermissionUser | null;
  action: PermissionAction;
  constructor(
    message = "You do not have permission to perform this action.",
    user: PermissionUser | null = null,
    action: PermissionAction = "viewAllData",
  ) {
    super(message);
    this.name = "PermissionError";
    this.user = user;
    this.action = action;
  }
}

export function can(
  user: PermissionUser,
  action: PermissionAction,
  resource?: PermissionResource,
): boolean {
  if (user.status !== "active") return false;

  switch (user.role) {
    case "super_admin":
      return true;

    case "moderator":
      return action === "viewAllData";

    case "pharmacy_association_admin":
      switch (action) {
        case "viewAssociationData":
          return resource ? resource.associationId === user.associationId : true;
        case "viewPharmacyData":
          if (!resource) return true;
          return (
            resource.pharmacyId === undefined ||
            resource.pharmacyId === null ||
            resource.pharmacyAssociationId === user.associationId
          );
        case "createApplication":
          // Association admins may file for any pharmacy inside their own
          // association. The data layer re-checks against the resolved
          // pharmacy, so a resource without `pharmacyAssociationId` is allowed
          // through here and blocked there.
          return resource?.pharmacyAssociationId === undefined
            ? true
            : resource.pharmacyAssociationId === user.associationId;
        case "manageUsers":
          return resource
            ? resource.associationId === user.associationId
            : true;
        default:
          return false;
      }

    case "pharmacy_worker":
      switch (action) {
        case "viewPharmacyData":
          return resource
            ? resource.pharmacyId === user.pharmacyId
            : true;
        case "createApplication":
          return resource
            ? resource.pharmacyId === user.pharmacyId
            : true;
        default:
          return false;
      }
  }
}

/** Throws a PermissionError when the acting user cannot perform the action. */
export function requirePermission(
  user: PermissionUser,
  action: PermissionAction,
  resource?: PermissionResource,
): void {
  if (!can(user, action, resource)) {
    throw new PermissionError(
      `The role ${user.role} cannot ${actionDescribe(action)}.`,
      user,
      action,
    );
  }
}

/**
 * Classifies how much of the registry a user sees. Components use this for
 * presentation (which panel/copy to render) instead of inlining role checks;
 * every *permission* decision still goes through `can`.
 */
export type DataScope = "all" | "association" | "pharmacy" | "none";

export function dataScope(user: PermissionUser): DataScope {
  switch (user.role) {
    case "super_admin":
    case "moderator":
      return "all";
    case "pharmacy_association_admin":
      return "association";
    case "pharmacy_worker":
      return user.pharmacyId ? "pharmacy" : "none";
  }
}

function actionDescribe(action: PermissionAction): string {
  switch (action) {
    case "viewAllData":
      return "view all data";
    case "viewAssociationData":
      return "view association data";
    case "viewPharmacyData":
      return "view pharmacy data";
    case "createApplication":
      return "create applications";
    case "attachReport":
      return "attach reports";
    case "updateApplicationStatus":
      return "change application status";
    case "manageUsers":
      return "manage users";
    case "manageAssociations":
      return "manage associations";
    case "managePharmacies":
      return "manage pharmacies";
  }
}