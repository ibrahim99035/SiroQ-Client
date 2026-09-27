import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Workspace invitations.
 *
 * An invited user row exists with `status = "invited"` and a NULL
 * `passwordHash`, so the account cannot authenticate until the invitation is
 * accepted. Only the SHA-256 digest of the invite token is stored, exactly as
 * with sessions: a database read cannot be replayed as an invitation.
 *
 * `can()` denies any user whose status is not "active", so an unaccepted invite
 * is inert by construction — there is no half-open state to guard.
 */

export const INVITE_TTL_MS = 1000 * 60 * 60 * 48; // 48 hours

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface InviteTarget {
  role: "super_admin" | "moderator" | "pharmacy_association_admin" | "pharmacy_worker";
  associationId: string | null;
  pharmacyId: string | null;
}

/**
 * Where the invited user is allowed to work. Enforced here rather than trusted
 * from the request body, so an admin cannot accidentally mint an account that is
 * scoped to a tenant they do not own.
 */
export function resolveInviteTarget(input: {
  role: InviteTarget["role"];
  associationId?: string | null;
  pharmacyId?: string | null;
  actorAssociationId: string | null;
  actorIsGlobal: boolean;
}): { ok: true; target: InviteTarget } | { ok: false; message: string } {
  const { role, associationId, pharmacyId, actorAssociationId, actorIsGlobal } = input;

  if (role === "super_admin" || role === "moderator") {
    if (!actorIsGlobal) {
      return { ok: false, message: "Only a super admin can invite platform staff." };
    }
    return { ok: true, target: { role, associationId: null, pharmacyId: null } };
  }

  if (role === "pharmacy_association_admin") {
    if (!associationId) {
      return { ok: false, message: "Choose the association this admin belongs to." };
    }
    if (!actorIsGlobal && associationId !== actorAssociationId) {
      return { ok: false, message: "You can only invite into your own association." };
    }
    return { ok: true, target: { role, associationId, pharmacyId: null } };
  }

  if (!pharmacyId) {
    return { ok: false, message: "Choose the pharmacy this worker belongs to." };
  }
  return { ok: true, target: { role, associationId: null, pharmacyId } };
}

/** Human-readable reason an invite cannot be accepted, or null when it can. */
export function inviteProblem(invite: {
  status: string;
  inviteExpiresAt: Date | null;
}): string | null {
  if (invite.status === "active") {
    return "This invitation has already been accepted.";
  }
  if (invite.status === "disabled") {
    return "This account has been disabled. Contact an administrator.";
  }
  if (invite.inviteExpiresAt && invite.inviteExpiresAt.getTime() <= Date.now()) {
    return "This invitation has expired. Ask an administrator to send a new one.";
  }
  return null;
}
