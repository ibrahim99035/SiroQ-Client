import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createSession } from "@/lib/session";

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(120),
  email: z.string().email("Enter a valid email address."),
  // Matches the client-side rule; the server is the authority.
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(200, "That password is too long."),
});

/**
 * POST /api/auth/signup
 *
 * Public self-service signup. The account is created as a **pharmacy worker**
 * with no association and no pharmacy: it can sign in immediately, but sees an
 * empty workspace until an administrator assigns it to a tenant. That is
 * deliberate — a self-registered user must never be able to place itself inside
 * somebody else's association.
 *
 * Status is `active` rather than `invited` because the person supplied their own
 * password here. `invited` is reserved for accounts an administrator created,
 * which have no usable password until the invite is accepted.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("invalid", parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return apiError("conflict", "An account with that email already exists.", 409);
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      passwordHash,
      role: "pharmacy_worker",
      status: "active",
    },
    select: { id: true, name: true, email: true, role: true },
  });

  // Sign the new account in so signup lands on a usable (if empty) workspace.
  await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });

  return NextResponse.json({ ok: true, user }, { status: 201 });
});
