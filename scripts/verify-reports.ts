/**
 * Report attach, retrieval and audit regression suite.
 *
 * Phase 3 claims three things that are easy to get subtly wrong:
 *
 *   1. **A report is only ever produced by an upload.** The previous mock
 *      synthesised one from the ledger metadata — a quality score, a grade, a
 *      schema version — and stamped the filing `reported` in the client store.
 *      Nothing measured anything. These checks assert the document the server
 *      stores is byte-for-byte the document that was sent.
 *   2. **`reported` is a consequence, not an independent flag.** The report row,
 *      the status change and the audit event are one transaction, so the suite
 *      checks all three land and that no path can produce a reported filing
 *      with no report behind it.
 *   3. **A report inherits its filing's scope.** The raw document is the
 *      deliverable the pharmacy receives, so it is fetched through a separate
 *      endpoint and must be just as scope-checked as the filing.
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

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

let passed = 0;
let failed = 0;

/**
 * Structural equality that ignores object key order.
 *
 * `result_data` is a `jsonb` column, and Postgres does not preserve the key
 * order it was given: it stores keys sorted by length and then bytewise. So
 * `JSON.stringify(a) === JSON.stringify(b)` is the wrong assertion here even
 * when the documents are identical — it fails on a stored
 * `{"schema","verdict","version"}` versus an uploaded
 * `{"schema","version","verdict"}`. Array order *is* significant and is
 * compared as such.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const aKeys = Object.keys(a as object).sort();
  const bKeys = Object.keys(b as object).sort();
  if (aKeys.length !== bKeys.length) return false;
  if (!aKeys.every((key, index) => key === bKeys[index])) return false;
  return aKeys.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

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

type ApiRow = {
  application: {
    id: string;
    reference: string;
    status: string;
    history: { to: string; fromStatus: string | null; changedByName?: string }[];
  };
  report: {
    id: string;
    source: string;
    status: string;
    generatedByName?: string;
    engineVersion?: string;
    resultData: unknown;
    /** Must be absent: it is fetched on demand. */
    rawData?: string;
  } | null;
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

/**
 * A document with a nested object, an array of objects and a null, because the
 * old renderer could only type a flat `Record<string, primitive>` and a real
 * report has none of those properties.
 */
const NESTED_DOCUMENT = {
  schema: "RxFill",
  version: "2.5",
  verdict: {
    grade: "Non-compliant",
    criticalDeviations: 2,
    explanations: ["ndc not matched to formulary", "quantity exceeds dispensed"],
  },
  batchCoverage: 99.1,
  confirmed: false,
  reviewedAt: null,
};

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env("DATABASE_URL") }),
  });

  const worker = await prisma.user.findUnique({
    where: { email: WORKER },
    select: { id: true, pharmacyId: true, associationId: true },
  });
  if (!worker?.pharmacyId) throw new Error(`seed worker ${WORKER} has no pharmacy`);
  const associationId = worker.associationId!;

  const [superCookie, workerCookie, associationCookie] = await Promise.all([
    login(SUPER_ADMIN),
    login(WORKER),
    login(ASSOCIATION_ADMIN),
  ]);

  const probe = await prisma.application.create({
    data: {
      title: "Report attach probe",
      pharmacyId: worker.pharmacyId,
      associationId,
      submittedById: worker.id,
      status: "in_review",
      events: {
        create: {
          to: "in_review",
          fromStatus: "pending",
          changedById: worker.id,
          note: "Probe staged for report verification.",
        },
      },
    },
    select: { id: true, reference: true },
  });
  console.log(`  probe filing ${probe.reference} (${probe.id})`);

  try {
    // ---- authorisation -----------------------------------------------------
    console.log("\n  authorisation");

    const workerAttach = await request(workerCookie, "POST", `/api/applications/${probe.id}/report`, {
      document: JSON.stringify(NESTED_DOCUMENT),
    });
    check(
      "pharmacy worker cannot attach a report (403) — the filing's own tenant cannot mark it reported",
      workerAttach.status === 403,
      workerAttach.status,
    );

    const associationAttach = await request(
      associationCookie,
      "POST",
      `/api/applications/${probe.id}/report`,
      { document: JSON.stringify(NESTED_DOCUMENT) },
    );
    check(
      "association admin cannot attach to another tenant's filing (404)",
      associationAttach.status === 404,
      associationAttach.body,
    );

    const unknown = await request(
      superCookie,
      "POST",
      "/api/applications/00000000-0000-0000-0000-000000000000/report",
      { document: JSON.stringify(NESTED_DOCUMENT) },
    );
    check("unknown filing 404s", unknown.status === 404, unknown.body);

    const malformedId = await request(superCookie, "POST", "/api/applications/not-a-uuid/report", {
      document: JSON.stringify(NESTED_DOCUMENT),
    });
    check("malformed filing id 404s rather than 500", malformedId.status === 404, malformedId.status);

    // ---- input validation --------------------------------------------------
    console.log("\n  document validation");

    const empty = await request(superCookie, "POST", `/api/applications/${probe.id}/report`, {
      document: "",
    });
    check("empty document refused (400)", empty.status === 400, empty.body);

    const notJson = await request(superCookie, "POST", `/api/applications/${probe.id}/report`, {
      document: "{ this is not json",
    });
    check("malformed JSON refused (400)", notJson.status === 400, notJson.body);

    const bareArray = await request(superCookie, "POST", `/api/applications/${probe.id}/report`, {
      document: "[1, 2, 3]",
    });
    check(
      "bare JSON array refused (400) — a report is an object",
      bareArray.status === 400,
      bareArray.body,
    );

    const oversized = await request(
      superCookie,
      "POST",
      `/api/applications/${probe.id}/report`,
      { document: JSON.stringify({ blob: "x".repeat(MAX_DOCUMENT_BYTES + 64) }) },
    );
    check("oversized document refused (413)", oversized.status === 413, oversized.status);

    // A "draft" report is not a thing this route can do. It used to accept the
    // value and then flip the filing to `reported` anyway, so a draft would
    // deliver the filing it was supposed to be a draft of.
    const draft = await request(superCookie, "POST", `/api/applications/${probe.id}/report`, {
      document: JSON.stringify(NESTED_DOCUMENT),
      status: "draft",
    });
    check(
      "a draft report is refused rather than silently delivered",
      draft.status === 400,
      `${draft.status} ${draft.body}`,
    );

    const stillPending = await prisma.application.findUniqueOrThrow({
      where: { id: probe.id },
      select: { status: true, report: { select: { id: true } } },
    });
    check(
      "no rejected document wrote a row or moved the status",
      stillPending.status === "in_review" && stillPending.report === null,
      stillPending,
    );

    // ---- the happy path ----------------------------------------------------
    console.log("\n  attach");

    const attached = await request(
      superCookie,
      "POST",
      `/api/applications/${probe.id}/report`,
      { document: JSON.stringify(NESTED_DOCUMENT), note: "Forwarded to compliance." },
    );
    check("super admin attaches a report (200)", attached.status === 200, attached.status);

    const row = attached.body as ApiRow;
    check(
      "filing moved to reported by the attach",
      row.application.status === "reported",
      row.application.status,
    );
    check("report is present on the row", row.report !== null);
    check("report source is manual", row.report?.source === "manual", row.report?.source);
    check(
      "nested document stored intact (deep-equal; jsonb reorders keys)",
      deepEqual(row.report?.resultData, NESTED_DOCUMENT),
      row.report?.resultData,
    );
    check(
      "raw document is NOT inlined on the row",
      row.report?.rawData === undefined,
      typeof row.report?.rawData,
    );
    check(
      "generator is named from the database, not 'System'",
      row.report?.generatedByName === "Dana Whitfield",
      row.report?.generatedByName,
    );
    check(
      "manual reports carry no engine version",
      row.report?.engineVersion === undefined,
      row.report?.engineVersion,
    );

    // ---- the transaction ---------------------------------------------------
    console.log("\n  persistence and audit");

    const stored = await prisma.report.findUniqueOrThrow({
      where: { applicationId: probe.id },
      select: {
        source: true,
        status: true,
        resultData: true,
        rawData: true,
        generatedBy: { select: { name: true } },
        engineVersion: true,
      },
    });
    check("exactly one report row exists", stored !== null);
    check("source persisted as manual", stored.source === "manual", stored.source);
    check(
      "result_data round-trips the nested tree",
      deepEqual(stored.resultData, NESTED_DOCUMENT),
      stored.resultData,
    );
    check(
      "raw_data is the stored document, pretty-printed",
      stored.rawData === JSON.stringify(NESTED_DOCUMENT, null, 2),
      stored.rawData.slice(0, 120),
    );
    check("generated_by is the super admin", stored.generatedBy.name === "Dana Whitfield");
    check("engine_version is null for a manual report", stored.engineVersion === null);

    const events = await prisma.statusEvent.findMany({
      where: { applicationId: probe.id },
      orderBy: { changedAt: "asc" },
      select: { to: true, fromStatus: true, note: true },
    });
    check(
      "exactly two audit events: the probe's and the report's",
      events.length === 2,
      events,
    );
    check(
      "report event records in_review -> reported",
      events[1]?.to === "reported" && events[1]?.fromStatus === "in_review",
      events[1],
    );
    check(
      "the operator's note is the audit note",
      events[1]?.note === "Forwarded to compliance.",
      events[1]?.note,
    );

    // ---- terminal and one-per-filing ---------------------------------------
    console.log("\n  one report per filing");

    const second = await request(superCookie, "POST", `/api/applications/${probe.id}/report`, {
      document: JSON.stringify({ verdict: "replacement" }),
    });
    check("a second attach is refused (409)", second.status === 409, second.status);

    const restatus = await request(superCookie, "PATCH", `/api/applications/${probe.id}/status`, {
      to: "rejected",
    });
    check(
      "a reported filing cannot be re-statused (409)",
      restatus.status === 409,
      restatus.status,
    );

    const unchanged = await prisma.report.findMany({
      where: { applicationId: probe.id },
      select: { resultData: true },
    });
    check(
      "the original report was neither replaced nor duplicated",
      unchanged.length === 1 && deepEqual(unchanged[0]!.resultData, NESTED_DOCUMENT),
      { count: unchanged.length },
    );

    // ---- raw document endpoint --------------------------------------------
    console.log("\n  raw document");

    const reportId = row.report!.id;

    const rawForSuper = await request(superCookie, "GET", `/api/reports/${reportId}/raw`);
    const rawBody = rawForSuper.body as { ok?: boolean; rawData?: string };
    check("super admin reads the raw document (200)", rawForSuper.status === 200, rawForSuper.status);
    check(
      "raw document matches what was stored",
      rawBody.rawData === JSON.stringify(NESTED_DOCUMENT, null, 2),
      rawBody.rawData?.slice(0, 120),
    );

    const rawForWorker = await request(workerCookie, "GET", `/api/reports/${reportId}/raw`);
    check(
      "worker reads the raw document of their own filing (200)",
      rawForWorker.status === 200,
      rawForWorker.status,
    );

    const rawForOther = await request(associationCookie, "GET", `/api/reports/${reportId}/raw`);
    check(
      "another tenant cannot read the raw document (404)",
      rawForOther.status === 404,
      rawForOther.status,
    );

    const rawUnknown = await request(superCookie, "GET", "/api/reports/00000000-0000-0000-0000-000000000000/raw");
    check("unknown report id 404s", rawUnknown.status === 404, rawUnknown.status);

    const rawBadId = await request(superCookie, "GET", "/api/reports/not-a-uuid/raw");
    check("malformed report id 404s rather than 500", rawBadId.status === 404, rawBadId.status);

    // ---- a reported filing is terminal in the UI ---------------------------
    console.log("\n  list projection");

    const listed = await request(superCookie, "GET", `/api/applications?q=${probe.reference}`);
    const listBody = listed.body as { applications?: ApiRow[] };
    const listedRow = listBody.applications?.find((r) => r.application.id === probe.id);
    check("probe is in the scoped list", listedRow !== undefined);
    check(
      "list rows carry no raw document",
      listedRow?.report?.rawData === undefined,
      typeof listedRow?.report?.rawData,
    );
  } finally {
    // Reports cascade from the filing, and status events cascade too.
    const cleaned = await prisma.application.deleteMany({ where: { id: probe.id } });
    const remaining = await prisma.application.count();
    console.log(`\n  cleaned up ${cleaned.count} probe filing(s); filings remaining: ${remaining}`);
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((reason) => {
  console.error(reason);
  process.exitCode = 1;
});
