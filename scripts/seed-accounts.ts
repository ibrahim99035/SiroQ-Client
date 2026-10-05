/**
 * Fixture-only user lookup for the verification suites.
 *
 * Every seeded user shares one development password (`SEED_PASSWORD`), so a
 * suite can authenticate as a fixture. Nothing licenses it to authenticate as
 * anybody else: a development database accumulates real accounts — the
 * developer's own, customers', a colleague's — and they are all just rows with
 * a role. A lookup like `findFirst({ where: { role: "super_admin" } })` is
 * therefore a coin toss between a fixture and a real person, and when it lands
 * on a real one the suite fails with a 401 on a password nobody in the project
 * has, which reads like "the seed is stale" and is really "we tried to log in as
 * a customer".
 *
 * The role alone is not an identity. These helpers pin the lookup to the seeded
 * fixture set from `lib/seed.ts`, so a real account can never be selected no
 * matter what roles exist in the database — and so a failure here means the seed
 * is missing, which is the thing the message says.
 *
 * Scope still comes from the database, not from here: callers pass the same
 * `where` they always did (role, association, pharmacy) and only the identity
 * is constrained.
 */
import type { Prisma, PrismaClient, User } from "@prisma/client";

import { seedUsers } from "../lib/seed";

/** Every seeded fixture's email, lowercased to match `User.email`. */
const SEEDED_EMAILS = seedUsers.map((u) => u.email.toLowerCase());

/** True when this address belongs to a seeded fixture. */
export function isSeededEmail(email: string): boolean {
  return SEEDED_EMAILS.includes(email.toLowerCase());
}

async function firstSeeded(
  prisma: PrismaClient,
  where: Prisma.UserWhereInput,
): Promise<User | null> {
  return prisma.user.findFirst({
    where: { ...where, email: { in: SEEDED_EMAILS } },
  });
}

function noFixture(where: Prisma.UserWhereInput, label: string): Error {
  return new Error(
    `no seeded ${label} matches ${JSON.stringify(where)}.\n` +
      `  These suites authenticate as seed fixtures only — every seeded user shares\n` +
      `  SEED_PASSWORD, and a real account's password is nobody's to use in a test.\n` +
      `  Run \`npm run db:seed\` to restore the fixtures, or set SEED_PASSWORD if you\n` +
      `  have changed it.`,
  );
}

/** As `findFirstOrThrow`, but restricted to seeded fixtures. */
export async function seededUser(
  prisma: PrismaClient,
  where: Prisma.UserWhereInput,
  label: string,
): Promise<User> {
  const user = await firstSeeded(prisma, where);
  if (!user) throw noFixture(where, label);
  return user;
}

/** As `findFirst`, but restricted to seeded fixtures. `null` when none match. */
export async function maybeSeededUser(
  prisma: PrismaClient,
  where: Prisma.UserWhereInput,
): Promise<User | null> {
  return firstSeeded(prisma, where);
}