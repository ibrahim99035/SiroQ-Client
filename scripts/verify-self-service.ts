/**
 * Self-service identity + directory scoping regression suite.
 *
 * The bug this guards against: "save my profile" was wired to the *admin*
 * endpoint `PATCH /api/users/[id]`, which refuses any self-targeted write
 * because an admin acting on their own row is how self-lockout and privilege
 * escalation happen. The rename therefore failed with a 409 while the form
 * still reported success. Two ways that regresses silently:
 *
 *   1. The settings page drifting back onto the admin route, or
 *   2. `guardWritable` being relaxed "to let people edit their own name", which
 *      would quietly reopen self-role-change and self-disable.
 *
 * Both are invisible in review and only show up as a broken rename or a
 * privilege-escalation bug, so the boundary is pinned here with real HTTP.
 *
 * Usage:
 *   npx next dev &
 *   DATABASE_URL=... npx tsx scripts/verify-self-service.ts
 *
 * Env:
 *   BASE_URL       default http://localhost:3000
 *   SEED_PASSWORD  default siroq-dev-password (must match the seed)
 *   DATABASE_URL   required (same as the app) — used to restore the renamed
 *                  account and to assert the name actually reached the row
 *
 * Exits non-zero if any assertion fails. Always restores the account name it
 * changed, including on failure.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function env(name: string): string {
  return (process.env[name] ?? "").replace(/^['"]|['"]$/g, "");
}

const BASE_URL = env("BASE_URL") || "http://localhost:3000";
const PASSWORD = env("SEED_PASSWORD") || "siroq-dev-password";

const WORKER = "angela.rowe@northpointrx.com";
const ASSOCIATION_ADMIN = "elena.vasquez@twinharbors.org";
const SUPER_ADMIN = "dana.whitfield@requis.dev";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) {
      console.log(`        ${JSON.stringify(detail)}`);
    }
  }
}

/**
 * Response bodies are parsed JSON of unknown shape, so every read is narrowed
 * explicitly rather than cast — a missing key should read as "absent" and fail
 * an assertion loudly, not silently evaluate to `undefined` past a type check.
 */
function pick<T>(body: unknown, key: string): T | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return value === undefined ? undefined : (value as T);
}

function list<T>(body: unknown, key: string): T[] {
  const value = pick<unknown>(body, key);
  return Array.isArray(value) ? (value as T[]) : [];
}

async function request(
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const raw = res.headers.getSetCookie?.() ?? [];
  const session = raw.find((c) => c.startsWith("siroq_session="));
  if (!session) throw new Error(`no session cookie returned for ${email}`);
  return session.split(";")[0]!;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: env("DATABASE_URL") });
  const prisma = new PrismaClient({ adapter });

  const target = await prisma.user.findUnique({
    where: { email: ASSOCIATION_ADMIN },
    select: { id: true, name: true },
  });
  if (!target) {
    console.error(`Seed user ${ASSOCIATION_ADMIN} not found. Run \`npm run db:seed\` first.`);
    process.exit(2);
  }
  const originalName = target.name;
  const probeName = `${originalName} (probe)`;

  let cookie: string | null = null;
  try {
    cookie = await login(ASSOCIATION_ADMIN);

    console.log("\n  Profile edits go through /api/users/me, not the admin route");
    const viaAdmin = await request(cookie, "PATCH", `/api/users/${target.id}`, {
      name: probeName,
    });
    check(
      "admin route refuses a self-targeted write",
      viaAdmin.status === 409,
      viaAdmin,
    );

    const viaMe = await request(cookie, "PATCH", "/api/users/me", { name: probeName });
    check("self route accepts a name change", viaMe.status === 200, viaMe);

    // The DOM could agree with the form while the row never changed, which is
    // exactly how the original bug presented. Assert against the database.
    const persisted = await prisma.user.findUnique({
      where: { id: target.id },
      select: { name: true },
    });
    check(
      "the new name reached the row",
      persisted?.name === probeName,
      { expected: probeName, actual: persisted?.name },
    );

    const me = await request(cookie, "GET", "/api/auth/me");
    const meName = pick<{ name?: string }>(me.body, "user")?.name;
    check("the session reflects the new name", meName === probeName, meName);

    console.log("\n  /api/users/me whitelists name and email only");
    for (const [field, value] of [
      ["role", "super_admin"],
      ["status", "disabled"],
      ["associationId", null],
      ["pharmacyId", null],
    ] as const) {
      const res = await request(cookie, "PATCH", "/api/users/me", { [field]: value });
      check(
        `rejects a ${field} change`,
        res.status === 400,
        res,
      );
    }

    const afterAttempts = await prisma.user.findUnique({
      where: { id: target.id },
      select: { role: true, status: true },
    });
    check(
      "the rejected attempts changed nothing",
      afterAttempts?.role !== "super_admin" && afterAttempts?.status !== "disabled",
      afterAttempts,
    );

    console.log("\n  Anonymous access");
    const anon = await request(null, "GET", "/api/users/me");
    check("no cookie is rejected", anon.status === 401, anon);
    const anonPatch = await request(null, "PATCH", "/api/users/me", { name: "nope" });
    check("anonymous write is rejected", anonPatch.status === 401, anonPatch);

    console.log("\n  Directory and tenant scoping");
    const worker = await login(WORKER);
    const workerUsers = await request(worker, "GET", "/api/users");
    check("worker cannot list the directory", workerUsers.status === 403, workerUsers);

    const workerAssociations = await request(worker, "GET", "/api/associations");
    const workerAssociationsList = list(workerAssociations.body, "associations");
    check(
      "worker sees no associations",
      workerAssociations.status === 200 && workerAssociationsList.length === 0,
      workerAssociationsList,
    );

    const workerPharmacies = await request(worker, "GET", "/api/pharmacies");
    const workerPharmacyNames = list<{ name: string }>(workerPharmacies.body, "pharmacies").map(
      (p) => p.name,
    );
    check(
      "worker sees only their own pharmacy",
      workerPharmacies.status === 200 && workerPharmacyNames.length === 1,
      workerPharmacyNames,
    );

    const adminUsers = await request(cookie, "GET", "/api/users");
    const visible = list<{ email: string; associationId: string | null }>(adminUsers.body, "users");
    const ownAssociationId = (
      await prisma.user.findUnique({
        where: { id: target.id },
        select: { associationId: true },
      })
    )?.associationId;
    check(
      "association admin sees only their own tenant",
      adminUsers.status === 200 &&
        visible.length > 0 &&
        visible.every((u) => u.associationId === ownAssociationId),
      { count: visible.length, ownAssociationId },
    );

    const superCookie = await login(SUPER_ADMIN);
    const superUsers = await request(superCookie, "GET", "/api/users");
    const superEmails = list<{ email: string }>(superUsers.body, "users").map((u) => u.email);
    check(
      "super admin sees every tenant",
      superUsers.status === 200 && superEmails.length > visible.length,
      { superAdmin: superEmails.length, associationAdmin: visible.length },
    );

    const escalating = await request(
      superCookie,
      "PATCH",
      `/api/users/${target.id}`,
      { role: "super_admin" },
    );
    check(
      "super admin promoting a real account is allowed",
      escalating.status === 200,
      escalating,
    );
    if (escalating.status === 200) {
      await request(superCookie, "PATCH", `/api/users/${target.id}`, {
        role: "pharmacy_association_admin",
      });
    }
  } finally {
    // Restore, even on failure: this suite renames a real seeded account.
    if (cookie) {
      await request(cookie, "PATCH", "/api/users/me", { name: originalName }).catch(() => {});
    }
    const after = await prisma.user
      .findUnique({ where: { id: target.id }, select: { name: true, role: true } })
      .catch(() => null);
    if (after && (after.name !== originalName || after.role !== "pharmacy_association_admin")) {
      await prisma.user
        .update({
          where: { id: target.id },
          data: { name: originalName, role: "pharmacy_association_admin" },
        })
        .catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("  (the renamed account was restored to its original name)");
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
