import "server-only";

import bcrypt from "bcryptjs";

/**
 * Password hashing. Cost 12 is a deliberate compromise: strong enough that a
 * leaked database is expensive to crack, fast enough that a Vercel serverless
 * function can verify a login without timing out.
 */
const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

/**
 * Verifies a password against a stored hash.
 *
 * A user without a password hash (an invited account that never accepted their
 * invite) returns `false` rather than throwing, and still burns roughly the
 * same time as a real comparison so the response cannot be used to enumerate
 * which emails have passwords set.
 */
export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    // Dummy compare to keep the timing profile flat.
    await bcrypt.compare(plain, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
    return false;
  }
  return bcrypt.compare(plain, hash);
}
