/**
 * Cross-tenant authorization regression suite.
 *
 * The bug this guards against: an association admin could download any
 * tenant's filing, and any signed-in user could bind an upload to any filing.
 * Both are silent, invisible in review, and would only surface as a data breach
 * in production — so they are pinned here with real HTTP requests against a
 * running server rather than asserted in prose.
 *
 * Usage:
 *   STORAGE_DRIVER=local npx next dev &
 *   npx tsx scripts/verify-authz.ts
 *
 * Env:
 *   BASE_URL            default http://localhost:3000
 *   SEED_PASSWORD       default siroq-dev-password (must match the seed)
 *   DATABASE_URL        required (same as the app)
 *
 * Exits non-zero if any assertion fails.
 */
import { unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_PASSWORD ?? "siroq-dev-password";
const CONNECTION = process.env.DATABASE_URL;

if (!CONNECTION) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: CONNECTION }) });

const CSV_NAME = "authz-fixture-manifest.csv";

/** Header + data rows the intake validator requires for a valid manifest. */
const CSV = [
  "NDC code,Batch number,Quantity,Expiry",
  "00074-3955,BT-1001,100,2027-01-31",
  "00074-3956,BT-1002,250,2027-06-30",
].join("\n");

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

type Reply = { status: number; body: unknown };

/** Reads the uploadId out of an API reply without trusting the shape. */
function uploadIdFrom(body: unknown): string {
  const parsed = body as { uploadId?: unknown };
  return typeof parsed.uploadId === "string" ? parsed.uploadId : "";
}

/** Reads the reserved storage key out of an API reply. */
function storageKeyFrom(body: unknown): string {
  const parsed = body as { storageKey?: unknown };
  return typeof parsed.storageKey === "string" ? parsed.storageKey : "";
}

async function call(
  path: string,
  opts: { method?: string; cookie?: string; body?: unknown } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: "manual",
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* binary or html body */
  }
  return { status: res.status, body };
}

/** Signs in and returns the session cookie header value. */
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

/**
 * Rows created by this run, removed afterwards. A suite that leaves records
 * behind in the development database is a suite nobody will keep running.
 */
const createdUploads: string[] = [];
const createdKeys: string[] = [];
/** Sessions that already existed, so cleanup never touches a developer's own. */
let preExistingSessions: string[] = [];

/** Uploads a file end-to-end and returns the completed upload id. */
async function uploadFile(
  cookie: string,
  fileName: string,
  applicationId?: string,
): Promise<{ uploadId: string; created: number; completed?: Reply }> {
  const created = await call("/api/uploads", {
    method: "POST",
    cookie,
    body: { fileName, declaredBytes: Buffer.byteLength(CSV), applicationId },
  });
  if (created.status !== 200) {
    return { uploadId: "", created: created.status, completed: created };
  }
  const uploadId = uploadIdFrom(created.body);
  createdUploads.push(uploadId);
  createdKeys.push(storageKeyFrom(created.body));
  const completed = await call(`/api/uploads/${uploadId}/complete`, {
    method: "POST",
    cookie,
    body: {
      dataBase64: Buffer.from(CSV).toString("base64"),
      ...(applicationId ? { applicationId } : {}),
    },
  });
  return { uploadId, created: created.status, completed };
}

/** Removes every upload slot this run opened, plus the files they produced. */
async function cleanup(): Promise<void> {
  if (createdUploads.length === 0) return;
  try {
    await prisma.applicationFile.deleteMany({
      where: { originalName: { in: [CSV_NAME, "own.csv", "override.csv"] } },
    });
    await prisma.upload.deleteMany({ where: { id: { in: createdUploads } } });

    // Drop the sessions this run opened, leaving any that predate it alone.
    const survivors = await prisma.session.findMany({ select: { id: true } });
    const fresh = survivors.map((r) => r.id).filter((id) => !preExistingSessions.includes(id));
    if (fresh.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: fresh } } });
    }

    // Remove the stored bytes as well, so a run leaves no orphaned objects
    // behind. Only the local driver is exercised by this suite.
    const root = resolve(process.env.STORAGE_LOCAL_ROOT || "./data/storage");
    for (const key of createdKeys) {
      if (!key) continue;
      const target = resolve(join(root, key));
      if (!target.startsWith(root + sep)) continue;
      await unlink(target).catch(() => undefined);
    }
    console.log(`\n  cleaned up ${createdUploads.length} upload slot(s)`);
  } catch (err) {
    console.error(
      `\n  cleanup failed: ${err instanceof Error ? err.message : String(err)}` +
        `\n  run: DELETE FROM application_file WHERE original_name = '${CSV_NAME}';`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`\nAuthorization suite against ${BASE_URL}\n`);

  preExistingSessions = (await prisma.session.findMany({ select: { id: true } })).map((r) => r.id);

  // Fixtures: one filing in each of the two seeded associations.
  const apps = await prisma.application.findMany({
    select: {
      id: true,
      reference: true,
      associationId: true,
      pharmacyId: true,
      pharmacy: { select: { name: true } },
    },
    orderBy: { reference: "asc" },
  });
  const tenants = [...new Set(apps.map((a) => a.associationId))];
  if (tenants.length < 2) {
    throw new Error("need filings in at least two associations; run `npm run db:seed`");
  }
  const [assocA, assocB] = tenants as [string, string];
  const appA = apps.find((a) => a.associationId === assocA)!;
  const appB = apps.find((a) => a.associationId === assocB)!;

  const adminA = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_association_admin", associationId: assocA, status: "active" },
  });
  const adminB = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_association_admin", associationId: assocB, status: "active" },
  });
  // A worker at appA's own pharmacy: must be able to read it.
  const workerSame = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_worker", pharmacyId: appA.pharmacyId, status: "active" },
  });
  const workerOther = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_worker", pharmacyId: { not: appA.pharmacyId }, status: "active" },
  });
  const moderator = await prisma.user.findFirstOrThrow({
    where: { role: "moderator", status: "active" },
  });
  const superAdmin = await prisma.user.findFirstOrThrow({
    where: { role: "super_admin", status: "active" },
  });

  console.log(
    `  A = ${appA.reference} @ ${appA.pharmacy.name}\n  B = ${appB.reference} @ ${appB.pharmacy.name}\n`,
  );

  const cookieAdminA = await login(adminA.email);
  const cookieAdminB = await login(adminB.email);
  const cookieWorkerSame = await login(workerSame.email);
  const cookieWorkerOther = await login(workerOther.email);
  const cookieModerator = await login(moderator.email);
  const cookieSuper = await login(superAdmin.email);

  // --- 1. Read scoping -----------------------------------------------------
  // The file is owned by admin A, so every read below is a *cross-user* read
  // and only tenant scope can allow or deny it.
  const seed = await uploadFile(cookieAdminA, CSV_NAME, appA.id);
  if (seed.completed?.status !== 200) {
    throw new Error(
      `setup failed: admin A could not upload to their own filing (${JSON.stringify(seed.completed?.body)})`,
    );
  }
  const read = (cookie: string) =>
    call(`/api/uploads/${seed.uploadId}/content`, { cookie }).then((r) => r.status);

  console.log("  Read scoping");
  check("own association admin can read", (await read(cookieAdminA)) === 200);
  check(
    "worker at the filing's pharmacy can read",
    (await read(cookieWorkerSame)) === 200,
    "same-pharmacy worker should not be locked out",
  );
  check("moderator can read", (await read(cookieModerator)) === 200);
  check("super admin can read", (await read(cookieSuper)) === 200);
  check(
    "OTHER association admin is denied",
    (await read(cookieAdminB)) === 403,
    "cross-tenant read",
  );
  check(
    "worker at a different pharmacy is denied",
    (await read(cookieWorkerOther)) === 403,
    "cross-tenant read",
  );

  // --- 2. Create scoping ---------------------------------------------------
  console.log("\n  Upload-slot creation scoping");
  const ownSlot = await call("/api/uploads", {
    method: "POST",
    cookie: cookieAdminA,
    body: { fileName: "own.csv", declaredBytes: 10, applicationId: appA.id },
  });
  if (ownSlot.status === 200) {
    createdUploads.push(uploadIdFrom(ownSlot.body));
    createdKeys.push(storageKeyFrom(ownSlot.body));
  }
  check("own filing accepts a slot", ownSlot.status === 200, `got ${ownSlot.status}`);

  const foreignSlot = await call("/api/uploads", {
    method: "POST",
    cookie: cookieAdminB,
    body: { fileName: "intrusion.csv", declaredBytes: 10, applicationId: appA.id },
  });
  check(
    "other tenant cannot reserve a slot against it",
    foreignSlot.status === 403,
    `expected 403, got ${foreignSlot.status}`,
  );

  // --- 3. Attach-at-complete scoping --------------------------------------
  console.log("\n  Attach-at-complete scoping");
  // Admin B owns this slot (no applicationId), then tries to attach it to
  // tenant A's filing — the override path that bypassed the create check.
  const override = await call("/api/uploads", {
    method: "POST",
    cookie: cookieAdminB,
    body: { fileName: "override.csv", declaredBytes: Buffer.byteLength(CSV) },
  });
  check("unattached slot is allowed", override.status === 200, `got ${override.status}`);
  if (override.status === 200) {
    createdUploads.push(uploadIdFrom(override.body));
    createdKeys.push(storageKeyFrom(override.body));
  }
  if (override.status === 200) {
    const forced = await call(`/api/uploads/${uploadIdFrom(override.body)}/complete`, {
      method: "POST",
      cookie: cookieAdminB,
      body: {
        dataBase64: Buffer.from(CSV).toString("base64"),
        applicationId: appA.id,
      },
    });
    check(
      "cannot attach it to another tenant's filing",
      forced.status === 403,
      `expected 403, got ${forced.status}`,
    );
  }

  // --- 4. Anonymous --------------------------------------------------------
  console.log("\n  Anonymous access");
  const anon = await call(`/api/uploads/${seed.uploadId}/content`);
  check("no cookie is rejected", anon.status === 401, `expected 401, got ${anon.status}`);

  // --- 5. Unknown ids do not leak -----------------------------------------
  console.log("\n  Non-disclosure");
  const missing = await call("/api/uploads/00000000-0000-4000-8000-000000000000/content", {
    cookie: cookieAdminA,
  });
  check("unknown upload id 404s", missing.status === 404, `got ${missing.status}`);

  // --- summary -------------------------------------------------------------
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  await cleanup();
  await prisma.$disconnect();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`\nsuite error: ${err instanceof Error ? err.message : String(err)}`);
  await cleanup();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(2);
});
