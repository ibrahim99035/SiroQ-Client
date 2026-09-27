import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, withErrorHandling } from "@/lib/api";
import { prisma } from "@/lib/db";

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
 * Public self-service signup, which creates a **pending** request rather than a
 * usable account.
 *
 * The workspace is invite-only: an account is created `invited` with a NULL
 * `passwordHash` and no tenant, and `can()` denies every non-`active` user, so
 * the row can do nothing at all until an administrator sends an invitation that
 * attaches it to a pharmacy or association. That is what stops a self-registered
 * address from placing itself inside somebody else's tenant.
 *
 * The password from this form is deliberately discarded. It is kept only in the
 * request body long enough to reject a too-weak one, which spares the applicant
 * a second round trip without ever storing a credential for an account that
 * cannot sign in.
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

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      role: "pharmacy_worker",
      status: "invited",
      passwordHash: null,
    },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  return NextResponse.json(
    {
      ok: true,
      user,
      message:
        "Your request is with an administrator. Once an administrator attaches you to a pharmacy, you will receive an invitation to set a password.",
    },
    { status: 201 },
  );
});
