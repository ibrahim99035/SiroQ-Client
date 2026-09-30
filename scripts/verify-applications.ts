/**
 * Application, reference-allocation and status-audit regression suite.
 *
 * Covers the three claims Phase 2 makes that are easy to break silently:
 *
 *   1. **The database allocates the reference.** `reference` is
 *      `dbgenerated` from `application_reference_seq`, so no client sends one.
 *      The failure this guards is subtle: if the schema default is dropped, a
 *      create that still omits `reference` throws a Prisma validation error,
 *      and if a *client* starts sending one, two concurrent submissions can
 *      collide on the unique index. Two simultaneous creates must get two
 *      distinct references.
 *
 *   2. **Scope is derived from the session, per role.** A worker sees one
 *      pharmacy, an association admin one association, and an out-of-scope id
 *      404s rather than 403s — a 403 would confirm the row exists.
 *
 *   3. **A status change and its audit row commit together.** `StatusEvent` is
 *      the only record of why a filing moved. If the pair is not transactional,
 *      a crash between them leaves a status with no event, or history that
 *      contradicts the row.
 *
 * Every filing this creates is deleted on the way out, cascading to its files
 * and events. Reference numbers are *not* returned to the pool — the sequence
 * does not roll back — so the run prints the range it consumed.
 *
 * Usage:
 *   npx next dev &
 *   DATABASE_URL=... npx tsx scripts/verify-applications.ts
 *
 * Env:
 *   BASE_URL       default http://localhost:3000
 *   SEED_PASSWORD  default siroq-dev-password (must match the seed)
 *   DATABASE_URL   required (same as the app)
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
const MODERATOR = "priya.raman@requis.dev";
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
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

function pick<T>(body: unknown, key: string): T | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return value === undefined ? undefined : (value as T);
}

function list<T>(body: unknown, key: string): T[] {
  const value = pick<unknown>(body, key);
  return Array.isArray(value) ? (value as T[]) : [];
}

type ApiRow = {
  application: {
    id: string;
    reference: string;
    title: string;
    status: string;
    pharmacyId: string;
    associationId: string;
    history: { to: string; fromStatus: string | null; note?: string }[];
    files: unknown[];
  };
  totalRows: number;
  totalBytes: number;
  report: unknown;
};

async function request(
  cookie: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
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
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  const raw = res.headers.getSetCookie?.() ?? [];
  const session = raw.find((c) => c.startsWith("siroq_session="));
  if (!session) throw new Error(`no session cookie for ${email}`);
  return session.split(";")[0]!;
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env("DATABASE_URL") }),
  });

  // Tenants are discovered from the database rather than hardcoded by name, so
  // a re-seed that renames a pharmacy does not turn this suite into a false
  // alarm about scoping.
  const worker = await prisma.user.findUnique({
    where: { email: WORKER },
    select: { id: true, pharmacyId: true, associationId: true },
  });
  const assocAdmin = await prisma.user.findUnique({
    where: { email: ASSOCIATION_ADMIN },
    select: { id: true, associationId: true },
  });
  if (!worker?.pharmacyId || !assocAdmin?.associationId) {
    console.error("Seed tenants not found. Run `npm run db:seed` first.");
    process.exit(2);
  }

  // A pharmacy belonging to a *different* association, for the cross-tenant
  // attempt. Without it, "refuses a foreign pharmacy" would be untestable.
  const foreignPharmacy = await prisma.pharmacy.findFirst({
    where: { associationId: { not: assocAdmin.associationId } },
    select: { id: true, associationId: true, name: true },
  });
  if (!foreignPharmacy) {
    console.error("Need at least two associations in the seed to test cross-tenant scope.");
    process.exit(2);
  }

  const inTenantPharmacy = await prisma.pharmacy.findFirst({
    where: { associationId: assocAdmin.associationId },
    select: { id: true },
  });

  const createdIds: string[] = [];
  const firstReference = await prisma.application.findFirst({
    orderBy: { submittedAt: "desc" },
    select: { reference: true },
  });

  try {
    const superCookie = await login(SUPER_ADMIN);
    const workerCookie = await login(WORKER);
    const assocCookie = await login(ASSOCIATION_ADMIN);
    const modCookie = await login(MODERATOR);

    /* -------------------------------------------------- reference allocation */
    console.log("\n  The database allocates the reference");

    // Both in flight at once. If the client supplied the reference, or the
    // default were absent, this is where a collision or a 500 would show.
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        request(superCookie, "POST", "/api/applications", {
          title: "concurrent probe",
          pharmacyId: worker.pharmacyId,
        }),
      ),
    );
    check("two concurrent creates both succeed", concurrent.every((r) => r.status === 201), concurrent.map((r) => r.status));

    const refs = concurrent
      .map((r) => (r.body as unknown as ApiRow | null)?.application?.reference)
      .filter((r): r is string => typeof r === "string");
    for (const row of concurrent) {
      const id = (row.body as unknown as ApiRow | null)?.application?.id;
      if (id) createdIds.push(id);
    }
    check("each concurrent create got a reference", refs.length === 2, refs);
    check("the two references differ", refs.length === 2 && refs[0] !== refs[1], refs);
    check(
      "references match AP-2026-####",
      refs.every((r) => /^AP-2026-\d{4}$/.test(r)),
      refs,
    );

    // The client's own attempt to set one must be ignored, not honoured.
    const injected = await request(superCookie, "POST", "/api/applications", {
      title: "injected reference",
      pharmacyId: worker.pharmacyId,
      reference: "AP-2026-0001",
    });
    const injectedId = (injected.body as unknown as ApiRow | null)?.application?.id;
    if (injectedId) createdIds.push(injectedId);
    const injectedRef = (injected.body as unknown as ApiRow | null)?.application?.reference;
    check(
      "a client-supplied reference cannot override the sequence",
      injected.status === 201 && injectedRef !== "AP-2026-0001",
      { status: injected.status, reference: injectedRef },
    );

    /* ---------------------------------------------------------------- scope */
    console.log("\n  Listing scope comes from the session");

    const allRows = list<ApiRow>(await request(superCookie, "GET", "/api/applications").then((r) => r.body), "applications");
    const workerRows = list<ApiRow>(await request(workerCookie, "GET", "/api/applications").then((r) => r.body), "applications");
    const assocRows = list<ApiRow>(await request(assocCookie, "GET", "/api/applications").then((r) => r.body), "applications");
    const modRows = list<ApiRow>(await request(modCookie, "GET", "/api/applications").then((r) => r.body), "applications");

    check("a worker sees only their own pharmacy", workerRows.every((r) => r.application.pharmacyId === worker.pharmacyId), workerRows.map((r) => r.application.pharmacyId));
    check("an association admin sees only their own association", assocRows.every((r) => r.application.associationId === assocAdmin.associationId), assocRows.map((r) => r.application.associationId));
    check("a moderator can read the whole estate", modRows.length === allRows.length, { mod: modRows.length, all: allRows.length });
    check("the super admin sees at least as much as the association admin", allRows.length >= assocRows.length, { all: allRows.length, assoc: assocRows.length });

    // A worker creating for a foreign pharmacy is the IDOR this whole layer
    // exists to prevent.
    const foreignCreate = await request(workerCookie, "POST", "/api/applications", {
      title: "cross-tenant attempt",
      pharmacyId: foreignPharmacy.id,
    });
    check("a worker cannot file for another pharmacy", foreignCreate.status === 403, foreignCreate);
    const assocForeignCreate = await request(assocCookie, "POST", "/api/applications", {
      title: "cross-tenant attempt",
      pharmacyId: foreignPharmacy.id,
    });
    check("an association admin cannot file outside their association", assocForeignCreate.status === 403, assocForeignCreate);
    const phantomCreate = await request(superCookie, "POST", "/api/applications", {
      title: "no such pharmacy",
      pharmacyId: "00000000-0000-4000-8000-000000000000",
    });
    check("a filing for a nonexistent pharmacy is rejected", phantomCreate.status === 400, phantomCreate);

    // 404, not 403: a 403 would confirm the row exists.
    const outOfScope = await request(workerCookie, "GET", `/api/applications/${allRows[0]?.application.id}`);
    check(
      "an out-of-scope filing 404s rather than 403s",
      allRows[0] && allRows[0].application.pharmacyId !== worker.pharmacyId
        ? outOfScope.status === 404
        : true,
      { status: outOfScope.status, reference: allRows[0]?.application.reference },
    );

    /* --------------------------------------------------------- status + audit */
    console.log("\n  Status changes and their audit rows commit together");

    const target = concurrent[0]!.body as unknown as ApiRow | null;
    const targetId = target?.application?.id;
    if (!targetId) throw new Error("could not read the filing just created");
    const eventsBefore = await prisma.statusEvent.count({ where: { applicationId: targetId } });
    check("a new filing opens with exactly one pending event", eventsBefore === 1, { events: eventsBefore });

    const toReview = await request(superCookie, "PATCH", `/api/applications/${targetId}/status`, { to: "in_review" });
    check("a super admin can move pending -> in_review", toReview.status === 200 && (toReview.body as unknown as ApiRow)?.application?.status === "in_review", toReview);

    // The audit pair is asserted against the database, not the response body:
    // the response is generated *after* the transaction, so it would agree even
    // if the event insert were missing.
    const afterReview = await prisma.application.findUniqueOrThrow({
      where: { id: targetId },
      select: { status: true, events: { orderBy: { changedAt: "asc" }, select: { to: true, fromStatus: true, note: true } } },
    });
    check("the row really moved to in_review", afterReview.status === "in_review", afterReview.status);
    check("a second event was written", afterReview.events.length === 2, afterReview.events.length);
    check("the event records the previous status", afterReview.events[1]?.fromStatus === "pending", afterReview.events[1]);
    check("the event records the new status", afterReview.events[1]?.to === "in_review", afterReview.events[1]);
    check("a note was recorded without being supplied", typeof afterReview.events[1]?.note === "string" && afterReview.events[1]!.note!.length > 0, afterReview.events[1]);

    // A retried request must not be able to spam the audit trail.
    const repeat = await request(superCookie, "PATCH", `/api/applications/${targetId}/status`, { to: "in_review" });
    const eventsAfterRepeat = await prisma.statusEvent.count({ where: { applicationId: targetId } });
    check(
      "a same-status request is a no-op",
      repeat.status === 200 && pick<boolean>(repeat.body, "changed") === false,
      repeat,
    );
    check("the no-op wrote no duplicate event", eventsAfterRepeat === 2, { events: eventsAfterRepeat });

    // `reported` is set by attaching a report, not by this route, or a filing
    // would claim to be reported with nothing to show.
    const fakeReport = await request(superCookie, "PATCH", `/api/applications/${targetId}/status`, { to: "reported" });
    check("reported is refused without a report attached", fakeReport.status === 409, fakeReport);

    // Two different refusals, and the difference is the point:
    //
    //   403 = the actor can *see* the filing but may not act on it.
    //   404 = the filing is outside the actor's scope, so its existence is not
    //         confirmed.
    //
    // `targetId` sits in the worker's pharmacy, so the worker gets 403 while
    // Elena (a different association) gets 404. Asserting anything else would
    // pin the wrong rule.
    const byWorker = await request(workerCookie, "PATCH", `/api/applications/${targetId}/status`, { to: "rejected" });
    check("a worker sees its own filing but is refused (403)", byWorker.status === 403, byWorker);
    const byMod = await request(modCookie, "PATCH", `/api/applications/${targetId}/status`, { to: "rejected" });
    check("a moderator reads everything but cannot change status (403)", byMod.status === 403, byMod);
    const assocOutOfScope = await request(assocCookie, "PATCH", `/api/applications/${targetId}/status`, { to: "rejected" });
    check("another association's filing is invisible (404)", assocOutOfScope.status === 404, assocOutOfScope);

    // A filing inside Elena's own association, so her own 403 is exercised
    // rather than being masked by the scope check answering first.
    const assocScoped = await request(assocCookie, "POST", "/api/applications", {
      title: "association admin probe",
      pharmacyId: inTenantPharmacy!.id,
    });
    const assocScopedId = (assocScoped.body as unknown as ApiRow | null)?.application?.id;
    if (assocScopedId) createdIds.push(assocScopedId);
    check("an association admin can file for their own pharmacy", assocScoped.status === 201, assocScoped.status);

    if (assocScopedId) {
      const byAssoc = await request(assocCookie, "PATCH", `/api/applications/${assocScopedId}/status`, { to: "rejected" });
      check("an association admin still cannot change status (403)", byAssoc.status === 403, byAssoc);
      check(
        "the association admin's own filing is still pending",
        (await prisma.application.findUniqueOrThrow({ where: { id: assocScopedId }, select: { status: true } })).status === "pending",
      );
    }

    check(
      "no refused attempt left an event",
      (await prisma.statusEvent.count({ where: { applicationId: targetId } })) === 2,
    );

    /* ------------------------------------------------------------ title edit */
    console.log("\n  Only the title is editable through the detail route");

    const retitle = await request(superCookie, "PATCH", `/api/applications/${targetId}`, { title: "renamed probe" });
    check("a super admin can retitle a filing", retitle.status === 200 && (retitle.body as unknown as ApiRow)?.application?.title === "renamed probe", retitle);

    // Status and tenant must not be reachable here, or a caller could bypass
    // the audit trail or re-home a filing's files into another tenant.
    const sneakStatus = await request(superCookie, "PATCH", `/api/applications/${targetId}`, { status: "rejected" });
    check("status cannot be set through the detail route", sneakStatus.status === 400, sneakStatus);
    check(
      "the sneaked status never reached the row",
      (await prisma.application.findUniqueOrThrow({ where: { id: targetId }, select: { status: true } })).status === "in_review",
    );
    const sneakTenant = await request(superCookie, "PATCH", `/api/applications/${targetId}`, { pharmacyId: foreignPharmacy.id });
    check("the filing's pharmacy cannot be re-homed", sneakTenant.status === 400, sneakTenant);

    const assocRetitle = assocScopedId
      ? await request(assocCookie, "PATCH", `/api/applications/${assocScopedId}`, { title: "nope" })
      : null;
    check(
      "an association admin cannot retitle its own filing (403)",
      assocRetitle?.status === 403,
      assocRetitle,
    );

    /* ------------------------------------------------------------ row shape */
    console.log("\n  The row serialises without losing the UI's fields");

    const detail = await request(superCookie, "GET", `/api/applications/${targetId}`);
    const row = detail.body as unknown as ApiRow | null;
    check("the detail route returns the same row as the list", detail.status === 200 && row !== null, detail.status);
    check("BigInt byte totals are numbers, not strings", typeof row?.totalBytes === "number", typeof row?.totalBytes);
    check("history is present for the audit panel", Array.isArray(row?.application.history) && row!.application.history.length === 2, row?.application.history?.length);
    check("pharmacy and association are hydrated", Boolean(pick<unknown>(detail.body, "pharmacy")) && Boolean(pick<unknown>(detail.body, "association")));
    check("the submitter is hydrated", Boolean(pick<unknown>(detail.body, "submitter")));

    const unknownId = await request(superCookie, "GET", "/api/applications/00000000-0000-4000-8000-000000000000");
    check("a nonexistent id is a 404", unknownId.status === 404, unknownId.status);
    const malformedId = await request(superCookie, "GET", "/api/applications/not-a-uuid");
    check("a malformed id is a 404, not a 500", malformedId.status === 404, malformedId.status);
  } finally {
    if (createdIds.length > 0) {
      // Cascades to ApplicationFile and StatusEvent.
      const removed = await prisma.application.deleteMany({ where: { id: { in: createdIds } } });
      console.log(`\n  Cleaned up ${removed.count} probe filing(s).`);
    }
    const remaining = await prisma.application.count();
    const lastReference = await prisma.application.findFirst({
      orderBy: { submittedAt: "desc" },
      select: { reference: true },
    });
    console.log(`  Filings remaining: ${remaining}. Last reference in use: ${lastReference?.reference ?? "—"}.`);
    console.log(`  (references ${firstReference?.reference ?? "—"} onwards were consumed; the sequence does not roll back)`);
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nverify-applications crashed:", err);
  process.exit(1);
});
