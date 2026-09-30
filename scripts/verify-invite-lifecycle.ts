/**
 * Invitation lifecycle regression suite: invite → accept → session.
 *
 * Covers the chain that only becomes real once SMTP is configured. Every step
 * below is a boundary that fails *quietly* rather than loudly:
 *
 *   - An account that can sign in before its invitation is accepted.
 *   - A password stored in the clear, or an accept route that skips hashing.
 *   - An accept that drops the tenant binding the admin chose, creating a
 *     worker scoped to nothing.
 *   - An invite token that can be replayed to take the account over later.
 *   - Mail that silently stops being delivered while onboarding still reports
 *     success, because `mailDelivered` is advisory and onboarding cannot fail.
 *
 * Usage:
 *   npx next dev &
 *   DATABASE_URL=... npx tsx scripts/verify-invite-lifecycle.ts
 *
 * NOTE: this sends ONE real email per run, to `SMTP_USER` plus-addressed with
 * `+siroqprobe`, which Gmail delivers to the same inbox as a distinct address.
 * The probe user is deleted in a `finally` block.
 *
 * Env:
 *   BASE_URL       default http://localhost:3000
 *   SEED_PASSWORD  default siroq-dev-password (must match the seed)
 *   DATABASE_URL   required (same as the app)
 *
 * Exits non-zero if any assertion fails.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function env(name: string): string {
  return (process.env[name] ?? "").replace(/^['"]|['"]$/g, "");
}

const BASE_URL = env("BASE_URL") || "http://localhost:3000";
const PASSWORD = env("SEED_PASSWORD") || "siroq-dev-password";
const INVITER = "dana.whitfield@requis.dev";
const NEW_PASSWORD = "siroq-probe-password";

/**
 * Plus-addressing keeps the probe out of the real account's way: it is a
 * distinct address that Gmail still delivers to the same inbox, so the run
 * exercises the real transport without creating a usable identity.
 */
function probeAddress(): string {
  const user = env("SMTP_USER");
  const local = user.split("@")[0];
  return user ? `${local}+siroqprobe@${user.split("@")[1]}` : "siroq-probe@example.invalid";
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

async function login(email: string, password: string): Promise<Response> {
  return fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

function sessionCookie(res: Response): string | null {
  const raw = res.headers.getSetCookie?.() ?? [];
  return raw.find((c) => c.startsWith("siroq_session="))?.split(";")[0] ?? null;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: env("DATABASE_URL") });
  const prisma = new PrismaClient({ adapter });
  const probe = probeAddress();

  const pharmacy = await prisma.pharmacy.findFirst({
    where: { name: "North Point Rx" },
    select: { id: true, associationId: true },
  });
  if (!pharmacy) {
    console.error("Seed pharmacy 'North Point Rx' not found. Run `npm run db:seed`.");
    process.exit(2);
  }

  try {
    const inviterLogin = await login(INVITER, PASSWORD);
    if (!inviterLogin.ok) throw new Error(`inviter login failed: ${inviterLogin.status}`);
    const cookie = sessionCookie(inviterLogin);
    if (!cookie) throw new Error("inviter login returned no session cookie");

    console.log("\n  Invitation is issued and delivered");
    const invite = await fetch(`${BASE_URL}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "SiroQ Probe",
        email: probe,
        role: "pharmacy_worker",
        associationId: pharmacy.associationId,
        pharmacyId: pharmacy.id,
      }),
    });
    const invited = (await invite.json().catch(() => null)) as {
      mailDelivered?: boolean;
      inviteUrl?: string;
    } | null;
    check("invite accepted by the API", invite.status === 201, invited);
    check("mail was actually delivered", invited?.mailDelivered === true, invited?.mailDelivered);

    const token = new URL(invited?.inviteUrl ?? "").pathname.split("/").pop() ?? "";
    check("an invite token was issued", token.length >= 20);

    console.log("\n  The invitation is not yet a usable account");
    const pending = await prisma.user.findUnique({
      where: { email: probe },
      select: { status: true, passwordHash: true },
    });
    check("account starts as invited", pending?.status === "invited", pending?.status);
    check("no password exists yet", !pending?.passwordHash);

    const early = await login(probe, NEW_PASSWORD);
    check("cannot sign in before accepting", early.status !== 200, early.status);

    console.log("\n  Acceptance is validated, then binds the tenant");
    const weak = await fetch(`${BASE_URL}/api/auth/accept-invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "short", confirmPassword: "short" }),
    });
    check("a short password is refused", weak.status === 400, weak.status);

    const accept = await fetch(`${BASE_URL}/api/auth/accept-invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
    });
    check("invitation accepted", accept.status === 200, accept.status);

    const active = await prisma.user.findUnique({
      where: { email: probe },
      select: { status: true, passwordHash: true, role: true, pharmacyId: true },
    });
    check("account is now active", active?.status === "active", active?.status);
    // A stored hash, not the password: the suite would otherwise "pass" while
    // shipping plaintext credentials.
    check(
      "password is stored hashed",
      typeof active?.passwordHash === "string" && active.passwordHash.length > 20 && !active.passwordHash.includes(NEW_PASSWORD),
    );
    check(
      "the invited tenant binding survived acceptance",
      active?.pharmacyId === pharmacy.id && active?.role === "pharmacy_worker",
      { pharmacyId: active?.pharmacyId, role: active?.role },
    );

    console.log("\n  The new account inherits exactly the invited scope");
    const signIn = await login(probe, NEW_PASSWORD);
    check("can sign in", signIn.status === 200, signIn.status);
    const probeCookie = sessionCookie(signIn);
    check("session cookie issued", probeCookie !== null);

    const me = await fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: probeCookie! } });
    const meBody = (await me.json().catch(() => null)) as { user?: { email?: string } } | null;
    check("session resolves the new identity", meBody?.user?.email === probe, meBody?.user?.email);

    const pharmacies = await fetch(`${BASE_URL}/api/pharmacies`, {
      headers: { cookie: probeCookie! },
    });
    const pharmacyBody = (await pharmacies.json().catch(() => null)) as
      | { pharmacies?: { id: string }[] }
      | null;
    check(
      "sees only the invited pharmacy",
      (pharmacyBody?.pharmacies ?? []).length === 1 && pharmacyBody?.pharmacies?.[0]?.id === pharmacy.id,
      pharmacyBody?.pharmacies,
    );

    const directory = await fetch(`${BASE_URL}/api/users`, { headers: { cookie: probeCookie! } });
    check("cannot list the user directory", directory.status === 403, directory.status);

    console.log("\n  The token is single-use");
    const replay = await fetch(`${BASE_URL}/api/auth/accept-invite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        password: "another-password-1234",
        confirmPassword: "another-password-1234",
      }),
    });
    check("invitation cannot be replayed", replay.status !== 200, replay.status);
  } finally {
    await prisma.user.deleteMany({ where: { email: probe } }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) console.log("  (the probe account was removed)");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
