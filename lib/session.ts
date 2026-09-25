import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";

/**
 * Server-side session handling.
 *
 * Design note: the cookie carries an opaque random token, and only the SHA-256
 * **digest** of that token is stored. Reading the `sessions` table therefore
 * does not hand an attacker a usable credential.
 *
 * The cookie itself is httpOnly + Secure + SameSite=Lax, so browser JavaScript
 * cannot read it and cross-site POSTs do not carry it.
 */

const DEFAULT_COOKIE = "siroq_session";
const DEFAULT_TTL_HOURS = 720; // 30 days

function cookieName(): string {
  return process.env.SESSION_COOKIE_NAME || DEFAULT_COOKIE;
}

function ttlMs(): number {
  const hours = Number.parseInt(process.env.SESSION_TTL_HOURS ?? "", 10);
  return (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "super_admin" | "moderator" | "pharmacy_association_admin" | "pharmacy_worker";
  status: "active" | "invited" | "disabled";
  associationId: string | null;
  pharmacyId: string | null;
}

/** Creates a session row and sets the cookie. Returns the raw token (caller must not log it). */
export async function createSession(
  userId: string,
  meta?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs());

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ipAddress: meta?.ipAddress ?? null,
      userAgent: meta?.userAgent?.slice(0, 512) ?? null,
    },
  });

  const jar = await cookies();
  jar.set(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

/** Resolves the current session's user, or null. Also clears a stale/expired cookie. */
export async function readSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(cookieName())?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session) {
    jar.delete(cookieName());
    return null;
  }

  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    // Best-effort cleanup so expired rows do not accumulate.
    await prisma.session
      .update({ where: { id: session.id }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
    jar.delete(cookieName());
    return null;
  }

  const { user } = session;
  if (user.status !== "active" || user.disabledAt) {
    await revokeSession();
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    associationId: user.associationId,
    pharmacyId: user.pharmacyId,
  };
}

/** Revokes the current session and clears the cookie. Safe to call when signed out. */
export async function revokeSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(cookieName())?.value;
  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  jar.delete(cookieName());
}

/** Revokes every session for a user (used when an account is disabled). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session
    .updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => undefined);
}
