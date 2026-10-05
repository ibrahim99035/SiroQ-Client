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
import {
  addFilesToApplication,
  createApplication,
  PartialSubmissionError,
} from "../lib/data";
import {
  deleteObject,
  getObject,
  putObject,
  storageDriver,
} from "../lib/storage";
import { reapExpiredUploads } from "./reap-expired-uploads";
import type { User } from "../lib/types";

function env(name: string): string {
  return (process.env[name] ?? "").replace(/^['"]|['"]$/g, "");
}

const BASE_URL = env("BASE_URL") || "http://localhost:3000";
const PASSWORD = env("SEED_PASSWORD") || "siroq-dev-password";

const WORKER = "angela.rowe@northpointrx.com";
const ASSOCIATION_ADMIN = "elena.vasquez@twinharbors.org";
/**
 * Second admin of the *worker's* association. Present so "can see the filing but
 * did not upload it" is reachable; `ASSOCIATION_ADMIN` is scoped to a different
 * association and would 404 rather than 403.
 */
const SAME_ASSOCIATION_ADMIN = "gregory.hahn@meridiancare.org";
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
    files: { id: string; editable?: boolean }[];
    /** Only on the detail projection. */
    fileEvents?: { kind: string; filename: string }[];
  };
  totalRows: number;
  totalBytes: number;
  report: unknown;
};

/**
 * The nested `application` object as the detail projection returns it. Separate
 * from `ApiRow` so `pick<…, "application">` is typed as the payload it actually
 * pulls out, rather than the envelope it is read from.
 */
type ApiApplication = {
  id: string;
  files: { id: string; editable?: boolean }[];
  /** Detail projection only. */
  fileEvents?: { kind: string; filename: string }[];
  canAddFiles?: boolean;
};

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
  if (!res.ok)
    throw new Error(
      `login failed for ${email}: ${res.status} ${await res.text()}`,
    );
  const raw = res.headers.getSetCookie?.() ?? [];
  const session = raw.find((c) => c.startsWith("siroq_session="));
  if (!session) throw new Error(`no session cookie for ${email}`);
  return session.split(";")[0]!;
}

/**
 * Reserve a slot, then try to bind it to a filing — the two halves of attaching,
 * as the API exposes them.
 *
 * Used for the refusals, where stopping early is the point: an unsupported
 * extension is rejected at reserve, and an unauthorised caller is rejected at
 * completion before any bytes are read. So neither needs the presigned PUT, and
 * asserting on the *first* status is what proves which gate actually refused.
 */
async function attachProbe(
  cookie: string,
  applicationId: string,
  fileName: string,
  declaredBytes = 32,
): Promise<{ status: number; body: unknown; stage: "reserve" | "complete" }> {
  const reserved = await request(cookie, "POST", "/api/uploads", {
    fileName,
    declaredBytes,
  });
  if (reserved.status !== 200) {
    return { ...reserved, stage: "reserve" };
  }
  const envelope = reserved.body as { completeUrl?: string } | null;
  if (!envelope?.completeUrl) {
    throw new Error(`reserve did not return a completeUrl: ${JSON.stringify(reserved.body)}`);
  }
  const completed = await request(cookie, "POST", envelope.completeUrl, {
    applicationId,
  });
  return { ...completed, stage: "complete" };
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
    console.error(
      "Need at least two associations in the seed to test cross-tenant scope.",
    );
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
    check(
      "two concurrent creates both succeed",
      concurrent.every((r) => r.status === 201),
      concurrent.map((r) => r.status),
    );

    const refs = concurrent
      .map((r) => (r.body as unknown as ApiRow | null)?.application?.reference)
      .filter((r): r is string => typeof r === "string");
    for (const row of concurrent) {
      const id = (row.body as unknown as ApiRow | null)?.application?.id;
      if (id) createdIds.push(id);
    }
    check("each concurrent create got a reference", refs.length === 2, refs);
    check(
      "the two references differ",
      refs.length === 2 && refs[0] !== refs[1],
      refs,
    );
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
    const injectedId = (injected.body as unknown as ApiRow | null)?.application
      ?.id;
    if (injectedId) createdIds.push(injectedId);
    const injectedRef = (injected.body as unknown as ApiRow | null)?.application
      ?.reference;
    check(
      "a client-supplied reference cannot override the sequence",
      injected.status === 201 && injectedRef !== "AP-2026-0001",
      { status: injected.status, reference: injectedRef },
    );

    /* ---------------------------------------------------------------- scope */
    console.log("\n  Listing scope comes from the session");

    const allRows = list<ApiRow>(
      await request(superCookie, "GET", "/api/applications").then(
        (r) => r.body,
      ),
      "applications",
    );
    const workerRows = list<ApiRow>(
      await request(workerCookie, "GET", "/api/applications").then(
        (r) => r.body,
      ),
      "applications",
    );
    const assocRows = list<ApiRow>(
      await request(assocCookie, "GET", "/api/applications").then(
        (r) => r.body,
      ),
      "applications",
    );
    const modRows = list<ApiRow>(
      await request(modCookie, "GET", "/api/applications").then((r) => r.body),
      "applications",
    );

    check(
      "a worker sees only their own pharmacy",
      workerRows.every((r) => r.application.pharmacyId === worker.pharmacyId),
      workerRows.map((r) => r.application.pharmacyId),
    );
    check(
      "an association admin sees only their own association",
      assocRows.every(
        (r) => r.application.associationId === assocAdmin.associationId,
      ),
      assocRows.map((r) => r.application.associationId),
    );
    check(
      "a moderator can read the whole estate",
      modRows.length === allRows.length,
      { mod: modRows.length, all: allRows.length },
    );
    check(
      "the super admin sees at least as much as the association admin",
      allRows.length >= assocRows.length,
      { all: allRows.length, assoc: assocRows.length },
    );

    // A worker creating for a foreign pharmacy is the IDOR this whole layer
    // exists to prevent.
    const foreignCreate = await request(
      workerCookie,
      "POST",
      "/api/applications",
      {
        title: "cross-tenant attempt",
        pharmacyId: foreignPharmacy.id,
      },
    );
    check(
      "a worker cannot file for another pharmacy",
      foreignCreate.status === 403,
      foreignCreate,
    );
    const assocForeignCreate = await request(
      assocCookie,
      "POST",
      "/api/applications",
      {
        title: "cross-tenant attempt",
        pharmacyId: foreignPharmacy.id,
      },
    );
    check(
      "an association admin cannot file outside their association",
      assocForeignCreate.status === 403,
      assocForeignCreate,
    );
    const phantomCreate = await request(
      superCookie,
      "POST",
      "/api/applications",
      {
        title: "no such pharmacy",
        pharmacyId: "00000000-0000-4000-8000-000000000000",
      },
    );
    check(
      "a filing for a nonexistent pharmacy is rejected",
      phantomCreate.status === 400,
      phantomCreate,
    );

    // 404, not 403: a 403 would confirm the row exists.
    const outOfScope = await request(
      workerCookie,
      "GET",
      `/api/applications/${allRows[0]?.application.id}`,
    );
    check(
      "an out-of-scope filing 404s rather than 403s",
      allRows[0] && allRows[0].application.pharmacyId !== worker.pharmacyId
        ? outOfScope.status === 404
        : true,
      {
        status: outOfScope.status,
        reference: allRows[0]?.application.reference,
      },
    );

    /* --------------------------------------------------------- status + audit */
    console.log("\n  Status changes and their audit rows commit together");

    const target = concurrent[0]!.body as unknown as ApiRow | null;
    const targetId = target?.application?.id;
    if (!targetId) throw new Error("could not read the filing just created");
    const eventsBefore = await prisma.statusEvent.count({
      where: { applicationId: targetId },
    });
    check(
      "a new filing opens with exactly one pending event",
      eventsBefore === 1,
      { events: eventsBefore },
    );

    const toReview = await request(
      superCookie,
      "PATCH",
      `/api/applications/${targetId}/status`,
      { to: "in_review" },
    );
    check(
      "a super admin can move pending -> in_review",
      toReview.status === 200 &&
        (toReview.body as unknown as ApiRow)?.application?.status ===
          "in_review",
      toReview,
    );

    // The audit pair is asserted against the database, not the response body:
    // the response is generated *after* the transaction, so it would agree even
    // if the event insert were missing.
    const afterReview = await prisma.application.findUniqueOrThrow({
      where: { id: targetId },
      select: {
        status: true,
        events: {
          orderBy: { changedAt: "asc" },
          select: { to: true, fromStatus: true, note: true },
        },
      },
    });
    check(
      "the row really moved to in_review",
      afterReview.status === "in_review",
      afterReview.status,
    );
    check(
      "a second event was written",
      afterReview.events.length === 2,
      afterReview.events.length,
    );
    check(
      "the event records the previous status",
      afterReview.events[1]?.fromStatus === "pending",
      afterReview.events[1],
    );
    check(
      "the event records the new status",
      afterReview.events[1]?.to === "in_review",
      afterReview.events[1],
    );
    check(
      "a note was recorded without being supplied",
      typeof afterReview.events[1]?.note === "string" &&
        afterReview.events[1]!.note!.length > 0,
      afterReview.events[1],
    );

    // A retried request must not be able to spam the audit trail.
    const repeat = await request(
      superCookie,
      "PATCH",
      `/api/applications/${targetId}/status`,
      { to: "in_review" },
    );
    const eventsAfterRepeat = await prisma.statusEvent.count({
      where: { applicationId: targetId },
    });
    check(
      "a same-status request is a no-op",
      repeat.status === 200 && pick<boolean>(repeat.body, "changed") === false,
      repeat,
    );
    check("the no-op wrote no duplicate event", eventsAfterRepeat === 2, {
      events: eventsAfterRepeat,
    });

    // `reported` is refused here for want of a report. The route can set the
    // flag, but only onto a filing that has something to show — a reported
    // filing with no `Report` row renders as an empty report panel. The happy
    // path is exercised on its own probe below, because flipping this one would
    // close it to every later assertion in this suite.
    const fakeReport = await request(
      superCookie,
      "PATCH",
      `/api/applications/${targetId}/status`,
      { to: "reported" },
    );
    check(
      "reported is refused without a report attached",
      fakeReport.status === 409,
      fakeReport,
    );

    // Two different refusals, and the difference is the point:
    //
    //   403 = the actor can *see* the filing but may not act on it.
    //   404 = the filing is outside the actor's scope, so its existence is not
    //         confirmed.
    //
    // `targetId` sits in the worker's pharmacy, so the worker gets 403 while
    // Elena (a different association) gets 404. Asserting anything else would
    // pin the wrong rule.
    const byWorker = await request(
      workerCookie,
      "PATCH",
      `/api/applications/${targetId}/status`,
      { to: "rejected" },
    );
    check(
      "a worker sees its own filing but is refused (403)",
      byWorker.status === 403,
      byWorker,
    );
    const byMod = await request(
      modCookie,
      "PATCH",
      `/api/applications/${targetId}/status`,
      { to: "rejected" },
    );
    check(
      "a moderator reads everything but cannot change status (403)",
      byMod.status === 403,
      byMod,
    );
    const assocOutOfScope = await request(
      assocCookie,
      "PATCH",
      `/api/applications/${targetId}/status`,
      { to: "rejected" },
    );
    check(
      "another association's filing is invisible (404)",
      assocOutOfScope.status === 404,
      assocOutOfScope,
    );

    // A filing inside Elena's own association, so her own 403 is exercised
    // rather than being masked by the scope check answering first.
    const assocScoped = await request(
      assocCookie,
      "POST",
      "/api/applications",
      {
        title: "association admin probe",
        pharmacyId: inTenantPharmacy!.id,
      },
    );
    const assocScopedId = (assocScoped.body as unknown as ApiRow | null)
      ?.application?.id;
    if (assocScopedId) createdIds.push(assocScopedId);
    check(
      "an association admin can file for their own pharmacy",
      assocScoped.status === 201,
      assocScoped.status,
    );

    if (assocScopedId) {
      const byAssoc = await request(
        assocCookie,
        "PATCH",
        `/api/applications/${assocScopedId}/status`,
        { to: "rejected" },
      );
      check(
        "an association admin still cannot change status (403)",
        byAssoc.status === 403,
        byAssoc,
      );
      check(
        "the association admin's own filing is still pending",
        (
          await prisma.application.findUniqueOrThrow({
            where: { id: assocScopedId },
            select: { status: true },
          })
        ).status === "pending",
      );
    }

    check(
      "no refused attempt left an event",
      (await prisma.statusEvent.count({
        where: { applicationId: targetId },
      })) === 2,
    );

    /* --------------------------------------------- reporting a stored report */
    console.log("\n  A filing with a stored report can be marked reported");

    // Its own probe, because `reported` is terminal: flipping `targetId` would
    // close it to every title, tenant, and history assertion below.
    const reportProbe = await request(
      workerCookie,
      "POST",
      "/api/applications",
      {
        title: "stored report probe",
        pharmacyId: worker.pharmacyId,
      },
    );
    const reportProbeId = (reportProbe.body as unknown as ApiRow | null)
      ?.application?.id;
    if (reportProbeId) createdIds.push(reportProbeId);
    check(
      "a filing was created for the report probe",
      reportProbe.status === 201,
      reportProbe.status,
    );

    if (reportProbeId) {
      // Written straight to the database as `source: "service"`, which is how the
      // analysis-service path stores one: the report lands on the filing
      // *without* moving it. Reproduced rather than simulated through the manual
      // attach, which flips the filing itself and would prove nothing.
      await prisma.report.create({
        data: {
          applicationId: reportProbeId,
          status: "final",
          source: "service",
          resultData: { findings: [] },
          rawData: JSON.stringify({ findings: [] }, null, 2),
          generatedById: worker.id,
        },
      });

      const withReport = await prisma.application.findUniqueOrThrow({
        where: { id: reportProbeId },
        select: { status: true, report: { select: { id: true } } },
      });
      check(
        "a stored report on its own leaves the filing pending",
        withReport.status === "pending" && withReport.report !== null,
        { status: withReport.status, hasReport: withReport.report !== null },
      );

      const reported = await request(
        superCookie,
        "PATCH",
        `/api/applications/${reportProbeId}/status`,
        {
          to: "reported",
        },
      );
      check(
        "a filing with a stored report can be marked reported",
        reported.status === 200 &&
          (reported.body as unknown as ApiRow)?.application?.status ===
            "reported",
        reported,
      );

      const reportedEvents = await prisma.statusEvent.findMany({
        where: { applicationId: reportProbeId },
        orderBy: { changedAt: "asc" },
        select: { fromStatus: true, to: true, note: true },
      });
      const reportEvent = reportedEvents.at(-1);
      check(
        "the transition is audited, recording the status it came from",
        reportEvent?.fromStatus === "pending" && reportEvent?.to === "reported",
        reportEvent,
      );
      // This note is quoted verbatim in the notification that tells the submitter
      // their report is ready, so an automatic note has to read as that rather
      // than as a description of the status field.
      check(
        "the automatic note reads as a delivered report",
        reportEvent?.note === "Report delivered to the submitter.",
        reportEvent?.note,
      );

      // Terminal: the report has been handed over, so reopening the filing would
      // invalidate the deliverable. This is also what the detail page's button
      // guards against by not rendering at all on a reported filing.
      const reopen = await request(
        superCookie,
        "PATCH",
        `/api/applications/${reportProbeId}/status`,
        {
          to: "rejected",
        },
      );
      check(
        "a reported filing cannot be re-statused",
        reopen.status === 409,
        reopen,
      );
      check(
        "that refusal left the filing reported",
        (
          await prisma.application.findUniqueOrThrow({
            where: { id: reportProbeId },
            select: { status: true },
          })
        ).status === "reported",
      );

      // Not an assertion that mail was sent — there is no sink for it — but it
      // pins the two things that could leak across tenants or arrive twice: the
      // association filter, and the exclusion of a submitter who is themselves
      // one of the admins.
      const notifiedAdmins = await prisma.user.findMany({
        where: {
          associationId: worker.associationId,
          role: "pharmacy_association_admin",
          status: "active",
        },
        select: { id: true, email: true },
      });
      const foreignAdmin = await prisma.user.findFirst({
        where: {
          role: "pharmacy_association_admin",
          status: "active",
          NOT: { associationId: worker.associationId },
        },
        select: { id: true, associationId: true },
      });
      check(
        "the submitter's association has an active admin to notify",
        notifiedAdmins.length > 0,
        notifiedAdmins.map((u) => u.email),
      );
      check(
        "an admin in another association is outside the recipient set",
        foreignAdmin !== null &&
          !notifiedAdmins.some((u) => u.id === foreignAdmin.id),
        {
          notified: notifiedAdmins.map((u) => u.email),
          foreign: foreignAdmin?.associationId,
        },
      );
      check(
        "the submitter is excluded from the admin fan-out, so no double send",
        !notifiedAdmins.some((u) => u.id === worker.id),
        { submitter: worker.id, notified: notifiedAdmins.map((u) => u.email) },
      );
    }

    /* ------------------------------------------------------------ title edit */
    console.log("\n  Only the title is editable through the detail route");

    const retitle = await request(
      superCookie,
      "PATCH",
      `/api/applications/${targetId}`,
      { title: "renamed probe" },
    );
    check(
      "a super admin can retitle a filing",
      retitle.status === 200 &&
        (retitle.body as unknown as ApiRow)?.application?.title ===
          "renamed probe",
      retitle,
    );

    // Status and tenant must not be reachable here, or a caller could bypass
    // the audit trail or re-home a filing's files into another tenant.
    const sneakStatus = await request(
      superCookie,
      "PATCH",
      `/api/applications/${targetId}`,
      { status: "rejected" },
    );
    check(
      "status cannot be set through the detail route",
      sneakStatus.status === 400,
      sneakStatus,
    );
    check(
      "the sneaked status never reached the row",
      (
        await prisma.application.findUniqueOrThrow({
          where: { id: targetId },
          select: { status: true },
        })
      ).status === "in_review",
    );
    const sneakTenant = await request(
      superCookie,
      "PATCH",
      `/api/applications/${targetId}`,
      { pharmacyId: foreignPharmacy.id },
    );
    check(
      "the filing's pharmacy cannot be re-homed",
      sneakTenant.status === 400,
      sneakTenant,
    );

    const assocRetitle = assocScopedId
      ? await request(
          assocCookie,
          "PATCH",
          `/api/applications/${assocScopedId}`,
          { title: "nope" },
        )
      : null;
    check(
      "an association admin cannot retitle its own filing (403)",
      assocRetitle?.status === 403,
      assocRetitle,
    );

    /* ------------------------------------------------------------ row shape */
    console.log("\n  The row serialises without losing the UI's fields");

    const detail = await request(
      superCookie,
      "GET",
      `/api/applications/${targetId}`,
    );
    const row = detail.body as unknown as ApiRow | null;
    check(
      "the detail route returns the same row as the list",
      detail.status === 200 && row !== null,
      detail.status,
    );
    check(
      "BigInt byte totals are numbers, not strings",
      typeof row?.totalBytes === "number",
      typeof row?.totalBytes,
    );
    check(
      "history is present for the audit panel",
      Array.isArray(row?.application.history) &&
        row!.application.history.length === 2,
      row?.application.history?.length,
    );
    check(
      "pharmacy and association are hydrated",
      Boolean(pick<unknown>(detail.body, "pharmacy")) &&
        Boolean(pick<unknown>(detail.body, "association")),
    );
    check(
      "the submitter is hydrated",
      Boolean(pick<unknown>(detail.body, "submitter")),
    );

    const unknownId = await request(
      superCookie,
      "GET",
      "/api/applications/00000000-0000-4000-8000-000000000000",
    );
    check(
      "a nonexistent id is a 404",
      unknownId.status === 404,
      unknownId.status,
    );
    const malformedId = await request(
      superCookie,
      "GET",
      "/api/applications/not-a-uuid",
    );
    check(
      "a malformed id is a 404, not a 500",
      malformedId.status === 404,
      malformedId.status,
    );
    /* ------------------------------------------------------------------ */
    /* Intake ordering and abandoned-slot reaping                         */
    /* ------------------------------------------------------------------ */
    //
    // Staging bytes *before* the filing exists is the guarantee this flow
    // rests on, and no endpoint-level check can see it: the ordering lives in
    // the client function, not in a route. So the function is exercised here
    // directly, with `fetch` patched to fail exactly one step at a time.
    //
    // The driver under test is `neon`, where bytes travel as a presigned PUT to
    // object storage. That PUT is the byte transfer and nothing else, so
    // failing it is a faithful stand-in for storage being unavailable.
    const intakeUser = await prisma.user.findUniqueOrThrow({
      where: { email: WORKER },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        pharmacyId: true,
        associationId: true,
        status: true,
      },
    });
    const intakeCookie = await login(WORKER);
    const realFetch = globalThis.fetch;

    const urlOf = (input: RequestInfo | URL): string =>
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const methodOf = (init?: RequestInit): string =>
      (init?.method ?? "GET").toUpperCase();
    const probeCsv = (name: string): File =>
      new File(["drug,qty\ninsulin,2\n"], name, { type: "text/csv" });

    // `lib/data` is written for the browser and assumes it in two ways that are
    // both correct there and unavailable here: it resolves API paths relative to
    // the page origin, and it lets the httpOnly session ride along on
    // same-origin fetch. So this adapter gives it an origin and a cookie jar.
    //
    // The cookie is attached only to this app. Forwarding it to the presigned
    // PUT would change the signed request and break the upload for a reason
    // that has nothing to do with what is being tested.
    const asBrowserFetch = (
      inner: typeof fetch,
      // Defaults to the worker, who is the submitter of most probe filings.
      // Pass another cookie to drive an in-process call as somebody else.
      actor: string = intakeCookie,
    ): typeof fetch =>
      (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        const absolute = url.startsWith("/") ? `${BASE_URL}${url}` : url;
        const headers = new Headers(init?.headers);
        if (absolute.startsWith(BASE_URL) && !headers.has("cookie")) {
          headers.set("cookie", actor);
        }
        return inner(absolute, { ...init, headers });
      }) as typeof fetch;

    // --- control: the staged flow works before its failure modes mean anything
    globalThis.fetch = asBrowserFetch(realFetch);
    const control = await createApplication(
      {
        title: "Intake probe: control",
        pharmacyId: worker.pharmacyId,
        files: [probeCsv("control.csv")],
      },
      intakeUser as unknown as User,
    );
    createdIds.push(control.id);
    globalThis.fetch = realFetch;
    const controlFiles = await prisma.applicationFile.count({
      where: { applicationId: control.id },
    });
    check(
      "the staged flow attaches files to the filing it creates",
      controlFiles === 1,
      controlFiles,
    );

    // --- a byte failure must not create a filing -------------------------
    const beforeByteFailure = await prisma.application.count();
    globalThis.fetch = asBrowserFetch((async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      if (methodOf(init) === "PUT")
        throw new TypeError("fetch failed: storage unavailable");
      return realFetch(input, init);
    }) as typeof fetch);

    let byteFailure: unknown = null;
    let putAttempted = false;
    try {
      const counting = globalThis.fetch;
      globalThis.fetch = (async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        if (methodOf(init) === "PUT") putAttempted = true;
        return counting(input, init);
      }) as typeof fetch;
      await createApplication(
        {
          title: "Intake probe: byte failure",
          pharmacyId: worker.pharmacyId,
          files: [probeCsv("byte-failure.csv")],
        },
        intakeUser as unknown as User,
      );
    } catch (error) {
      byteFailure = error;
    } finally {
      globalThis.fetch = realFetch;
    }

    // Guards the two assertions below: without the bytes actually reaching for
    // storage, a 401 from the reserve call would make them pass for free.
    check(
      "the byte-failure probe really attempted the byte transfer",
      putAttempted,
    );

    const afterByteFailure = await prisma.application.count();
    check(
      "a failed byte transfer creates no filing at all",
      afterByteFailure === beforeByteFailure,
      { beforeByteFailure, afterByteFailure },
    );
    check(
      "a byte failure is not reported as a partial submission",
      !(byteFailure instanceof PartialSubmissionError),
      byteFailure instanceof Error ? byteFailure.message : byteFailure,
    );

    // --- a bind failure names the filing it left behind ------------------
    globalThis.fetch = asBrowserFetch((async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      if (methodOf(init) === "POST" && urlOf(input).includes("/complete")) {
        throw new TypeError("fetch failed: bind unavailable");
      }
      return realFetch(input, init);
    }) as typeof fetch);

    let bindFailure: unknown = null;
    try {
      await createApplication(
        {
          title: "Intake probe: bind failure",
          pharmacyId: worker.pharmacyId,
          files: [probeCsv("bind-failure.csv")],
        },
        intakeUser as unknown as User,
      );
    } catch (error) {
      bindFailure = error;
    } finally {
      globalThis.fetch = realFetch;
    }

    check(
      "a bind failure raises PartialSubmissionError so the caller can name the filing",
      bindFailure instanceof PartialSubmissionError,
      bindFailure instanceof Error ? bindFailure.message : bindFailure,
    );

    if (bindFailure instanceof PartialSubmissionError) {
      const orphan = bindFailure.application;
      createdIds.push(orphan.id);
      const persisted = await prisma.application.findUnique({
        where: { id: orphan.id },
        select: { reference: true, _count: { select: { files: true } } },
      });
      check(
        "the partial filing really exists",
        persisted !== null,
        orphan.reference,
      );
      check(
        "the partial filing carries no files, so it is honestly incomplete",
        persisted?._count.files === 0,
        persisted?._count.files,
      );
      check(
        "the error message names the filing's reference",
        bindFailure.message.includes(orphan.reference),
        bindFailure.message,
      );
    }

    // --- an abandoned slot is reaped; a live one is not -------------------
    const reapedKey = `verify/reap/${Date.now()}-expired.csv`;
    const keptKey = `verify/reap/${Date.now()}-live.csv`;
    await putObject(
      reapedKey,
      Buffer.from("drug,qty\ninsulin,2\n"),
      "text/csv",
    );
    await putObject(keptKey, Buffer.from("drug,qty\ninsulin,2\n"), "text/csv");

    const expiredSlot = await prisma.upload.create({
      data: {
        originalName: "abandoned.csv",
        kind: "csv",
        mimeType: "text/csv",
        declaredBytes: BigInt(20),
        storageKey: reapedKey,
        storageDriver: storageDriver(),
        state: "pending",
        uploadedById: intakeUser.id,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const liveSlot = await prisma.upload.create({
      data: {
        originalName: "in-flight.csv",
        kind: "csv",
        mimeType: "text/csv",
        declaredBytes: BigInt(20),
        storageKey: keptKey,
        storageDriver: storageDriver(),
        state: "pending",
        uploadedById: intakeUser.id,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });

    const reap = await reapExpiredUploads();
    check(
      "the reaper collected the abandoned slot",
      reap.expiredSlots >= 1,
      reap,
    );
    check(
      "the reaper deleted the abandoned object",
      (await getObject(reapedKey)) === null,
      reapedKey,
    );
    check(
      "the abandoned slot row is gone",
      (await prisma.upload.count({ where: { id: expiredSlot.id } })) === 0,
    );
    check(
      "the in-flight slot is untouched",
      (await prisma.upload.count({ where: { id: liveSlot.id } })) === 1,
    );
    check(
      "the in-flight object is untouched",
      (await getObject(keptKey)) !== null,
      keptKey,
    );

    // A slot that was bound to a filing must never be reaped, even when its
    // TTL has passed, or reaping would delete evidence a filing still points at.
    const attachedSlot = await prisma.upload.create({
      data: {
        originalName: "attached.csv",
        kind: "csv",
        mimeType: "text/csv",
        declaredBytes: BigInt(20),
        storageKey: reapedKey.replace("expired", "attached"),
        storageDriver: storageDriver(),
        state: "ready",
        uploadedById: intakeUser.id,
        applicationId: createdIds.length > 0 ? createdIds[0] : null,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await reapExpiredUploads();
    check(
      "an expired but bound slot is left alone",
      (await prisma.upload.count({ where: { id: attachedSlot.id } })) === 1,
    );

    await prisma.upload.deleteMany({
      where: { id: { in: [liveSlot.id, attachedSlot.id] } },
    });
    await Promise.all([
      deleteObject(keptKey).catch(() => undefined),
      deleteObject(attachedSlot.storageKey).catch(() => undefined),
    ]);

    /* ------------------------------------------- replacing and removing files */
    console.log(
      "\n  Evidence changes are permissioned and permanently recorded",
    );

    // `control` was created above with one file the worker uploaded, which makes
    // it the natural subject: the worker owns the row, so ownership — the grant
    // that is easy to get wrong — is exercised before any super-admin override.
    const owned = await prisma.applicationFile.findFirstOrThrow({
      where: { applicationId: control.id },
      select: {
        id: true,
        originalName: true,
        checksumSha256: true,
        storageKey: true,
        uploadedById: true,
      },
    });
    const originalChecksum = owned.checksumSha256;
    const originalKey = owned.storageKey;

    const csv = (body: string): string =>
      Buffer.from(body, "utf8").toString("base64");
    const replacement = csv("NDC code,Batch number,Quantity\n0001,B1,5\n");
    const filePath = (applicationId: string, fileId: string) =>
      `/api/applications/${applicationId}/files/${fileId}`;

    // --- the uploader may replace their own file -------------------------
    const byUploader = await request(
      intakeCookie,
      "PATCH",
      filePath(control.id, owned.id),
      {
        dataBase64: replacement,
        filename: "control.csv",
      },
    );
    check(
      "the uploader can replace their own file",
      byUploader.status === 200,
      byUploader.body,
    );

    const afterReplace = await prisma.applicationFile.findUniqueOrThrow({
      where: { id: owned.id },
      select: {
        checksumSha256: true,
        storageKey: true,
        uploadedById: true,
        sizeBytes: true,
      },
    });
    check(
      "the replacement bytes are the ones stored, not the ones claimed",
      afterReplace.checksumSha256 !== originalChecksum,
      { before: originalChecksum, after: afterReplace.checksumSha256 },
    );
    check(
      "a replacement gets a fresh storage key, so the old object stays intact until the swap commits",
      afterReplace.storageKey !== originalKey,
      { before: originalKey, after: afterReplace.storageKey },
    );

    const replaceEvent = await prisma.fileEvent.findFirst({
      where: { applicationId: control.id, fileId: owned.id, kind: "replaced" },
      orderBy: { createdAt: "desc" },
      select: {
        actorId: true,
        previousChecksumSha256: true,
        previousFilename: true,
        filename: true,
      },
    });
    check(
      "a replacement is recorded in the custody log",
      replaceEvent !== null,
    );
    check(
      "the log attributes the replacement to the actor who made it",
      replaceEvent?.actorId === intakeUser.id,
      { expected: intakeUser.id, got: replaceEvent?.actorId },
    );
    check(
      "the log keeps the checksum of what was replaced, which storage no longer holds",
      replaceEvent?.previousChecksumSha256 === originalChecksum,
      { expected: originalChecksum, got: replaceEvent?.previousChecksumSha256 },
    );

    const supersededObject = await getObject(originalKey);
    check(
      "the superseded object is removed once the swap is committed",
      supersededObject === null,
    );

    // --- in scope, but neither the uploader nor a super admin --------------
    //
    // `SAME_ASSOCIATION_ADMIN` is the other seeded admin of the *worker's* own
    // association, which is the only way to reach the case that matters: they can
    // see this filing and still may not change its evidence. `ASSOCIATION_ADMIN`
    // would prove nothing here — they administer a different association, so
    // `applicationWhere` excludes them and the route answers 404 before any
    // permission is consulted. A pharmacy worker cannot cover it either: workers
    // are scoped to their own pharmacy, so one elsewhere in the same association
    // is invisible too.
    const sameAssocCookie = await login(SAME_ASSOCIATION_ADMIN);
    const bySameAssocAdmin = await request(
      sameAssocCookie,
      "PATCH",
      filePath(control.id, owned.id),
      {
        dataBase64: replacement,
        filename: "control.csv",
      },
    );
    check(
      "an association admin who can see the filing still cannot replace a file they did not upload",
      bySameAssocAdmin.status === 403,
      bySameAssocAdmin.status,
    );
    const byModerator = await request(
      modCookie,
      "DELETE",
      filePath(control.id, owned.id),
    );
    check(
      "a moderator cannot remove a file",
      byModerator.status === 403,
      byModerator.status,
    );

    // --- a moderator can read the filing, so the refusal is about the file --
    const modDetail = await request(
      modCookie,
      "GET",
      `/api/applications/${control.id}`,
    );
    check(
      "a moderator is scoped in and still sees no replace control",
      modDetail.status === 200 &&
        (
          pick<ApiApplication>(modDetail.body, "application")!.files as {
            editable?: boolean;
          }[]
        ).every((file) => file.editable !== true),
      modDetail.status,
    );

    // --- a super admin may act on anyone's file ---------------------------
    const bySuperAdmin = await request(
      superCookie,
      "PATCH",
      filePath(control.id, owned.id),
      {
        dataBase64: csv("NDC code,Batch number,Quantity\n0001,B1,9\n"),
        filename: "control.csv",
      },
    );
    check(
      "a super admin can replace any file",
      bySuperAdmin.status === 200,
      bySuperAdmin.body,
    );

    // Ownership follows the replacement, so the worker who can no longer supply
    // the bytes can no longer swap them either. Asserted because it is the one
    // behaviour here a later reader could mistake for a bug.
    const workerAfterHandoff = await request(
      intakeCookie,
      "PATCH",
      filePath(control.id, owned.id),
      {
        dataBase64: replacement,
        filename: "control.csv",
      },
    );
    check(
      "replacing hands the file over, so the previous uploader loses the grant",
      workerAfterHandoff.status === 403,
      workerAfterHandoff.status,
    );

    // --- malformed and cross-tenant attempts ------------------------------
    const emptyReplacement = await request(
      superCookie,
      "PATCH",
      filePath(control.id, owned.id),
      {
        dataBase64: "",
        filename: "control.csv",
      },
    );
    check(
      "an empty replacement is refused",
      emptyReplacement.status === 400,
      emptyReplacement.status,
    );

    const badExtension = await request(
      superCookie,
      "PATCH",
      filePath(control.id, owned.id),
      {
        dataBase64: Buffer.from("not a spreadsheet").toString("base64"),
        filename: "control.exe",
      },
    );
    check(
      "a replacement whose extension is not allowed is refused",
      badExtension.status === 400,
      badExtension.status,
    );

    // Cross-tenant is `assocCookie`: they administer a different association, so
    // the filing does not exist for them. Answering 403 would confirm the row is
    // there and only the permission was refused.
    const foreignPatch = await request(
      assocCookie,
      "PATCH",
      filePath(control.id, owned.id),
      {
        dataBase64: replacement,
        filename: "control.csv",
      },
    );
    const foreignDelete = await request(
      assocCookie,
      "DELETE",
      filePath(control.id, owned.id),
    );
    check(
      "the file of a filing in another tenant answers 404, not 403",
      foreignPatch.status === 404 && foreignDelete.status === 404,
      { patch: foreignPatch.status, delete: foreignDelete.status },
    );

    // --- deletion keeps the log -------------------------------------------
    // Read the checksum last: the super admin replaced the file above, so
    // anything captured before that is a stale expectation, not a real failure.
    const checksumBeforeDelete = (
      await prisma.applicationFile.findUniqueOrThrow({
        where: { id: owned.id },
        select: { checksumSha256: true },
      })
    ).checksumSha256;
    const removed = await request(
      superCookie,
      "DELETE",
      filePath(control.id, owned.id),
    );
    check(
      "a super admin can remove a file",
      removed.status === 200,
      removed.body,
    );
    check(
      "the file row is gone",
      (await prisma.applicationFile.count({ where: { id: owned.id } })) === 0,
    );

    const deleteEvent = await prisma.fileEvent.findFirst({
      where: { applicationId: control.id, kind: "deleted" },
      orderBy: { createdAt: "desc" },
      select: {
        fileId: true,
        filename: true,
        checksumSha256: true,
        actorId: true,
      },
    });
    check("the removal is recorded", deleteEvent !== null);
    check(
      "the log outlives the file, keeping the id and name it had",
      deleteEvent?.fileId === owned.id &&
        deleteEvent?.filename === owned.originalName,
      { fileId: deleteEvent?.fileId, filename: deleteEvent?.filename },
    );
    check(
      "the log keeps the checksum of the bytes that were deleted",
      deleteEvent?.checksumSha256 === checksumBeforeDelete,
      {
        expected: checksumBeforeDelete,
        got: deleteEvent?.checksumSha256,
      },
    );

    const goneDownload = await request(
      intakeCookie,
      "GET",
      `/api/applications/${control.id}/files/${owned.id}/content`,
    );
    check(
      "the deleted file is no longer downloadable",
      goneDownload.status === 404,
      goneDownload.status,
    );

    // No API route mutates a FileEvent, so the only thing to verify is that the
    // detail projection still carries the whole log after the file is gone —
    // which is the whole reason `fileId` is a plain uuid and not a relation.
    const detailAfterDelete = await request(
      superCookie,
      "GET",
      `/api/applications/${control.id}`,
    );
    const custodyLog = pick<ApiApplication>(
      detailAfterDelete.body,
      "application",
    )!.fileEvents as { kind: string; filename: string }[] | undefined;
    check(
      "the custody log survives on the filing after the file is gone",
      Array.isArray(custodyLog) &&
        custodyLog.some((event) => event.kind === "deleted") &&
        custodyLog.some((event) => event.kind === "replaced"),
      custodyLog?.map((event) => event.kind),
    );
    check(
      "the log is returned newest first, so an auditor reads from the present backwards",
      custodyLog?.[0]?.kind === "deleted",
      custodyLog?.[0]?.kind,
    );

    const remainingFiles = await prisma.applicationFile.count({
      where: { applicationId: control.id },
    });
    check(
      "deleting the only file leaves the filing with none",
      remainingFiles === 0,
      remainingFiles,
    );

    /* ------------------------------------------ adding files to a filing */
    console.log(
      "\n  Files can be added to an existing filing, in any accepted format",
    );

    // `control` is now empty, which is the exact situation worth testing: a
    // filing that exists and still has room for evidence.
    const pbix = () =>
      new File(
        // Not a real PBIX, and it does not need to be. The point is that the
        // intake pass must not *try* to read it: the bytes are deliberately not
        // valid UTF-8 text, so a fall-through to the CSV parser would both
        // misread them and reject the file.
        [
          new Uint8Array([0x00, 0x01, 0xff, 0xfe, 0x50, 0x42, 0x49, 0x58, 0x00]),
        ],
        "quarterly-dispensing.pbix",
        { type: "application/vnd.ms-powerbi" },
      );
    const tableau = () =>
      new File(
        [new TextEncoder().encode('<?xml version="1.0"?><workbook/>')],
        "dispensing-analysis.twb",
        { type: "application/xml" },
      );

    // --- the submitter may add one ---------------------------------------
    // Counted against what is there rather than a fixed number. By this point
    // the filing has no file at all: the replace/delete probes earlier in this
    // suite removed the ledger they were testing with, which is also what leaves
    // it in the "attachments only, nothing to analyse" state the check below
    // relies on. The custody log still lists three uploads, because events are
    // append-only and outlive the rows they describe.
    const filesBeforeAdd = await prisma.applicationFile.count({
      where: { applicationId: control.id },
    });
    globalThis.fetch = asBrowserFetch(realFetch);
    await addFilesToApplication(control.id, [pbix(), tableau()]);
    globalThis.fetch = realFetch;

    const attachedKinds = await prisma.applicationFile.findMany({
      where: { applicationId: control.id },
      orderBy: { originalName: "asc" },
      select: {
        id: true,
        originalName: true,
        kind: true,
        mimeType: true,
        parseState: true,
        validationState: true,
        validationReason: true,
        rowCount: true,
        columnCount: true,
        detectedColumns: true,
        uploadedById: true,
        checksumSha256: true,
        sizeBytes: true,
      },
    });
    check(
      "the submitter can add files to a filing they created",
      attachedKinds.length === filesBeforeAdd + 2,
      attachedKinds.map((f) => f.originalName),
    );
    check(
      "every added file is stored as an attachment, not a ledger",
      attachedKinds.every((f) => f.kind === "attachment"),
      attachedKinds.map((f) => `${f.originalName}:${f.kind}`),
    );

    // The bug this guards: `inspectBytes` used to fall through to the CSV parser
    // for any unrecognised kind, which decodes binary as UTF-8 and reports the
    // file as invalid for lacking `NDC code` / `Batch number`. Those columns are
    // a filing-manifest requirement that a Power BI project never claimed to
    // satisfy, so rejecting on it would refuse every BI file outright.
    check(
      "a Power BI project is accepted, not judged against the dispensing manifest",
      attachedKinds.every(
        (f) => f.validationState === "valid" && f.parseState !== "failed",
      ),
      attachedKinds.map((f) => `${f.originalName}:${f.validationState}/${f.parseState}`),
    );
    check(
      "the rejection reason never mentions manifest columns for an attachment",
      attachedKinds.every(
        (f) => !/NDC code|Batch number|manifest/i.test(f.validationReason),
      ),
      attachedKinds.map((f) => f.validationReason),
    );
    check(
      "an attachment reports no invented row, column or header figures",
      attachedKinds.every(
        (f) => f.rowCount === 0 && f.columnCount === 0 && f.detectedColumns.length === 0,
      ),
      attachedKinds.map((f) => [f.rowCount, f.columnCount]),
    );
    check(
      "its validation reason states plainly that the contents were not read",
      attachedKinds.every((f) => /not inspected/i.test(f.validationReason)),
      attachedKinds.map((f) => f.validationReason),
    );

    // The other silent failure: every attachment used to be stored and signed as
    // the XLSX MIME type, because the reserve route guessed from the *kind*,
    // which only distinguishes spreadsheet-or-not.
    check(
      "a Power BI project is stored under its own content type, not a workbook's",
      attachedKinds.find((f) => f.originalName.endsWith(".pbix"))?.mimeType ===
        "application/vnd.ms-powerbi",
      attachedKinds.map((f) => `${f.originalName}:${f.mimeType}`),
    );
    // Regression: the replace route carried its own MIME resolver, so replacing
    // an attachment stamped it with the spreadsheet type. Two copies of one
    // policy is how upload and replacement drifted apart in the first place.
    const replaced = await request(
      superCookie,
      "PATCH",
      `/api/applications/${control.id}/files/${
        attachedKinds.find((f) => f.originalName.endsWith(".pbix"))!.id
      }`,
      {
        filename: "quarterly-dispensing-rebuilt.pbix",
        dataBase64: Buffer.from([0x50, 0x42, 0x49, 0x58, 0x00, 0x01]).toString(
          "base64",
        ),
        note: "Rebuilt project after the extract refresh.",
      },
    );
    check(
      "replacing an attachment succeeds",
      replaced.status === 200,
      replaced.status,
    );
    const filesAfterReplace = await prisma.applicationFile.findMany({
      where: { applicationId: control.id },
      select: { id: true, originalName: true, mimeType: true, kind: true },
    });
    check(
      "and the replacement keeps the attachment's own content type",
      filesAfterReplace.some(
        (f) =>
          f.originalName === "quarterly-dispensing-rebuilt.pbix" &&
          f.mimeType === "application/vnd.ms-powerbi" &&
          f.kind === "attachment",
      ),
      filesAfterReplace.map((f) => `${f.originalName}:${f.mimeType}:${f.kind}`),
    );
    const refusedExtension = await request(
      superCookie,
      "PATCH",
      `/api/applications/${control.id}/files/${filesAfterReplace[0]!.id}`,
      { filename: "evidence.zip", dataBase64: "AA==" },
    );
    const refusedMessage = pick<{ message: string }>(
      refusedExtension.body,
      "error",
    )?.message;
    check(
      "and the rejection now names every extension intake accepts",
      refusedExtension.status === 400 &&
        typeof refusedMessage === "string" &&
        /\.pbix/.test(refusedMessage) &&
        /\.parquet/.test(refusedMessage) &&
        !/\.xlsx, \.xls or \.csv/.test(refusedMessage),
      { status: refusedExtension.status, message: refusedMessage },
    );
    check(
      "a Tableau workbook is stored as XML",
      attachedKinds.find((f) => f.originalName.endsWith(".twb"))?.mimeType ===
        "application/xml",
      attachedKinds.map((f) => `${f.originalName}:${f.mimeType}`),
    );
    check(
      "the added files are owned by the user who added them",
      attachedKinds.every((f) => f.uploadedById === intakeUser.id),
    );

    // --- custody log -----------------------------------------------------
    const uploadEvents = await prisma.fileEvent.findMany({
      where: { applicationId: control.id, kind: "uploaded" },
      orderBy: { createdAt: "asc" },
      select: {
        kind: true,
        filename: true,
        checksumSha256: true,
        sizeBytes: true,
        actorId: true,
        note: true,
      },
    });
    // Three, not two: `control.csv` was attached when the filing was created,
    // and the `uploaded` event fires on every attach, not just the ones made
    // through "Add files". That is the point of it — a file nobody has touched
    // used to have no custody entry at all, so the log appeared to begin at the
    // file's first *replacement*.
    check(
      "every attachment opens a custody entry, including the one made at creation",
      uploadEvents.length === 3 &&
        uploadEvents.some((e) => e.filename === "control.csv"),
      uploadEvents.map((e) => e.filename),
    );
    check(
      "the upload log records the bytes that actually arrived",
      attachedKinds.every((f) =>
        uploadEvents.some(
          (e) =>
            e.filename === f.originalName && e.checksumSha256 === f.checksumSha256,
        ),
      ),
      uploadEvents.map((e) => [e.filename, e.checksumSha256?.slice(0, 12)]),
    );
    check(
      "the upload log names the actor",
      uploadEvents.every((e) => e.actorId === intakeUser.id),
    );

    // --- the format the ticket actually excludes --------------------------
    const zipped = await attachProbe(intakeCookie, control.id, "evidence.zip");
    check(
      "a .zip is refused at the gate: it is a container we never open, so nothing inside it could be checked",
      zipped.status === 400 && zipped.stage === "reserve",
      { status: zipped.status, stage: zipped.stage, body: zipped.body },
    );
    check(
      "the refused .zip left no row behind",
      (await prisma.applicationFile.count({
        where: { applicationId: control.id, originalName: "evidence.zip" },
      })) === 0,
    );

    // --- attachments are not handed to the analysis service --------------
    // The `control` filing's only files are now attachments, so this is the
    // cleanest possible probe: there is no ledger to analyse and the reason
    // must say so, rather than implying the files were unreadable.
    const analyseOnlyAttachments = await request(
      superCookie,
      "POST",
      `/api/applications/${control.id}/analysis`,
      {},
    );
    check(
      "a filing with only attachments is not analysed",
      analyseOnlyAttachments.status === 400,
      { status: analyseOnlyAttachments.status, body: analyseOnlyAttachments.body },
    );
    const analysisMessage = pick<{ message: string }>(
      analyseOnlyAttachments.body,
      "error",
    )?.message;
    check(
      "and is told the attachments were never meant to be read, not that they were corrupt",
      typeof analysisMessage === "string" &&
        /no dispensing ledger/i.test(analysisMessage) &&
        !/could not be read/i.test(analysisMessage),
      analysisMessage,
    );

    // --- who may add ------------------------------------------------------
    // Adding a file is the same act as attaching one while filing it: a
    // pharmacy-side write inside the caller's own tenant. So the boundary drawn
    // here is the *tenant*, not the filing, and these check both sides of it.
    //
    // An association admin has no pharmacy of their own, so the probe filing
    // sits against the worker's pharmacy.
    const assocAdminUser = await prisma.user.findUniqueOrThrow({
      where: { email: SAME_ASSOCIATION_ADMIN },
      select: { id: true },
    });
    const workerPharmacy = await prisma.pharmacy.findUniqueOrThrow({
      where: { id: worker.pharmacyId },
      select: { associationId: true },
    });
    const assocFiling = await prisma.application.create({
      data: {
        title: "Intake probe: filed by the association admin",
        pharmacyId: worker.pharmacyId,
        associationId: workerPharmacy.associationId,
        submittedById: assocAdminUser.id,
        status: "in_review",
      },
    });
    createdIds.push(assocFiling.id);

    // In tenant, filing not theirs: allowed. Admins upload on behalf of their
    // pharmacies, which is why this is not restricted to the submitter.
    globalThis.fetch = asBrowserFetch(realFetch, sameAssocCookie);
    const addedByAdmin = await addFilesToApplication(assocFiling.id, [tableau()]);
    globalThis.fetch = realFetch;
    check(
      "an association admin may add to a filing in their own association",
      addedByAdmin.files.length === 1,
      addedByAdmin.files.length,
    );

    // Out of tenant: the other seeded association's admin, who has no claim on
    // this filing at all. This is the refusal that matters.
    const deniedOutOfTenant = await attachProbe(
      assocCookie,
      assocFiling.id,
      "out-of-tenant.csv",
    );
    check(
      "an admin from another association is refused",
      deniedOutOfTenant.status === 403 &&
        deniedOutOfTenant.stage === "complete",
      { status: deniedOutOfTenant.status, stage: deniedOutOfTenant.stage },
    );

    // --- no status lock --------------------------------------------------
    // Explicitly decided: evidence may be added at any point in the lifecycle,
    // because adding a file re-runs the analysis. A lock would have refused the
    // correction and left the analysis describing files that are no longer there.
    // `control` is the worker's own filing, so this needs no special grant.
    await prisma.application.update({
      where: { id: control.id },
      data: { status: "reported" },
    });
    const filesBeforeReported = await prisma.applicationFile.count({
      where: { applicationId: control.id },
    });
    globalThis.fetch = asBrowserFetch(realFetch);
    const afterReported = await addFilesToApplication(control.id, [pbix()]);
    globalThis.fetch = realFetch;
    check(
      "a reported filing still accepts new evidence",
      afterReported.files.length === filesBeforeReported + 1,
      { filesBeforeReported, after: afterReported.files.length },
    );

    // --- the UI is told, so it cannot offer a button that 403s ------------
    // The flag is derived from the same helper the endpoint enforces, so these
    // are the UI half of the checks above.
    const canAddFor = async (cookie: string, id: string) =>
      pick<ApiApplication>(
        (await request(cookie, "GET", `/api/applications/${id}`)).body,
        "application",
      )?.canAddFiles;
    check(
      "the submitter is told they may add files",
      (await canAddFor(intakeCookie, control.id)) === true,
      await canAddFor(intakeCookie, control.id),
    );
    check(
      "a super admin is told they may add files",
      (await canAddFor(superCookie, control.id)) === true,
      await canAddFor(superCookie, control.id),
    );
    check(
      "an association admin is told they may add files in their association",
      (await canAddFor(sameAssocCookie, assocFiling.id)) === true,
      await canAddFor(sameAssocCookie, assocFiling.id),
    );
    // Not a `canAddFiles === false`: an out-of-tenant admin cannot open the
    // filing at all, so there is no application to read a flag off. The 404 is
    // the earlier and stronger half of the same guarantee.
    const hiddenFromOtherAssociation = await request(
      assocCookie,
      "GET",
      `/api/applications/${assocFiling.id}`,
    );
    check(
      "an admin from another association cannot even open the filing",
      hiddenFromOtherAssociation.status === 404,
      hiddenFromOtherAssociation.status,
    );
    check(
      "and the control survives the filing being reported",
      (await canAddFor(intakeCookie, control.id)) === true,
      await canAddFor(intakeCookie, control.id),
    );
  } finally {
    if (createdIds.length > 0) {
      // Cascades to ApplicationFile and StatusEvent.
      const removed = await prisma.application.deleteMany({
        where: { id: { in: createdIds } },
      });
      console.log(`\n  Cleaned up ${removed.count} probe filing(s).`);
    }
    const remaining = await prisma.application.count();
    const lastReference = await prisma.application.findFirst({
      orderBy: { submittedAt: "desc" },
      select: { reference: true },
    });
    console.log(
      `  Filings remaining: ${remaining}. Last reference in use: ${lastReference?.reference ?? "—"}.`,
    );
    console.log(
      `  (references ${firstReference?.reference ?? "—"} onwards were consumed; the sequence does not roll back)`,
    );
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nverify-applications crashed:", err);
  process.exit(1);
});
