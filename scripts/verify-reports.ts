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

/**
 * A document shaped like the analysis service's `format=client` projection.
 *
 * This is the shape the panel will actually have to render once the service is
 * wired up, and it is deliberately awkward in three ways the seeded reports are
 * not: a `Schema version` key the panel checks itself against, per-file
 * branches *keyed by filename* (so a label is an Arabic filename at depth 1),
 * and a top-level array of prose strings. `ReportResultData` has to describe
 * all of it, or the panel throws on the first real filing.
 *
 * The values are transcribed from a real projection of the sample workbooks.
 */
const SERVICE_DOCUMENT = {
  "Schema version": "siroq.client.v1",
  Application: "AP-2026-2601 · Twin Harbors",
  "Analysis ID": "40b611c9-743e-4e1f-b799-b645032e9fa0",
  "Application ID": "18cecd9d-3cac-4d91-98b5-4e2f5a414fca",
  "Analyzed at": "2026-09-26T15:19:32.145300+00:00",
  "Engine version": "0.1.0",
  "Files analyzed": "6",
  "Records examined": "142,282",
  "Data quality score": "82.8%",
  "Quality verdict": "Review",
  "Findings requiring review": "11",
  "Files failing a quality check": "inventory-salem.xls, PURCHASE -ABDELHAMID.xls",
  "Duplicate rows": "892",
  "Categories detected": ["sales — 4 file(s)", "inventory — 2 file(s)"],
  "Highest signal": "Warn",
  Files: {
    "inventory-salem.xls": {
      Quality: {
        Score: "88.6%",
        Verdict: "Review",
        "Checks passed": "9 of 15",
        "Failed checks": "negative_values",
        Warnings: "nulls_in_totals",
        "Duplicate rows": "0",
        Findings: "2",
      },
      Domain: {
        "Gross margin": "9.93%",
        Revenue: "323,417.86",
        "Margin basis": "row totals",
        "Not analyzed": "no unit_cost column",
      },
    },
    "حركة بيع صنف - سالم.xls": {
      Quality: { Score: "80.1%", Verdict: "Review", Findings: "3" },
      Domain: { "Gross margin": "2.84%", Revenue: "1,204,318.00" },
    },
  },
  "Evidence gaps": [
    "inventory-salem.xls — 94 of 2,579 source rows are structural and excluded from the money metrics above",
    "product - category- salem 22.xls — every row lacks a product identity column",
  ],
};

/**
 * Every leaf of the document, and how deep the walk goes.
 *
 * `ReportNode` is `ReportValue | ReportNode[] | { [key]: ReportNode }` and
 * `ReportValue` is a primitive, so a single non-primitive leaf anywhere is a
 * value the panel's `formatReportValue` would stringify into `[object Object]`
 * — or throw on. Asserting the leaf set is the part of "will it render" that can
 * be checked without a DOM.
 */
type LeafAudit = { bad: string[]; deepest: number; count: number };

function leafAudit(node: unknown, path = "", depth = 0): LeafAudit {
  const acc: LeafAudit = { bad: [], deepest: depth, count: 0 };

  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      acc.bad.push(...leafAudit(item, `${path}[${index}]`, depth + 1).bad);
      acc.deepest = Math.max(acc.deepest, depth + 1);
    }
    return acc;
  }

  if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const child = leafAudit(value, path ? `${path}.${key}` : key, depth + 1);
      acc.bad.push(...child.bad);
      acc.deepest = Math.max(acc.deepest, child.deepest);
      acc.count += child.count;
    }
    return acc;
  }

  const ok = node === null || ["string", "number", "boolean"].includes(typeof node);
  if (!ok) acc.bad.push(`${path || "<root>"} is ${typeof node}`);
  acc.count += 1;
  return acc;
}

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

    // ---- a service-shaped document ----------------------------------------
    // A second probe, because `Report.applicationId` is unique and the first
    // probe already holds one. This is the document the analysis service will
    // produce, so it is the one the panel has to survive.
    console.log("\n  service-shaped document");

    const serviceProbe = await prisma.application.create({
      data: {
        title: "Service projection probe",
        pharmacyId: worker.pharmacyId,
        associationId,
        submittedById: worker.id,
        status: "in_review",
      },
      select: { id: true, reference: true },
    });

    try {
      const audit = leafAudit(SERVICE_DOCUMENT);
      check(
        "every leaf in the projection is a primitive the panel can format",
        audit.bad.length === 0,
        audit.bad,
      );
      check(
        "the projection nests deeply enough to exercise the indent",
        audit.deepest >= 3,
        audit.deepest,
      );

      const serviceAttach = await request(
        superCookie,
        "POST",
        `/api/applications/${serviceProbe.id}/report`,
        { document: JSON.stringify(SERVICE_DOCUMENT), note: "Service projection." },
      );
      check(
        "a service-shaped document attaches (200)",
        serviceAttach.status === 200,
        `${serviceAttach.status} ${JSON.stringify(serviceAttach.body).slice(0, 200)}`,
      );

      const serviceRow = (serviceAttach.body as ApiRow).report;
      check(
        "the projection round-trips through jsonb intact",
        deepEqual(serviceRow?.resultData, SERVICE_DOCUMENT),
        serviceRow?.resultData,
      );

      // The panel reads this exact key to warn about drift.
      check(
        "the panel can read the declared schema version off the stored tree",
        (serviceRow?.resultData as Record<string, unknown> | undefined)?.["Schema version"] ===
          "siroq.client.v1",
        (serviceRow?.resultData as Record<string, unknown> | undefined)?.["Schema version"],
      );

      const arabicKeyPresent = Object.keys(
        (serviceRow?.resultData as { Files?: Record<string, unknown> } | undefined)?.Files ?? {},
      ).some((key) => /[؀-ۿ]/.test(key));
      check(
        "per-file branches keyed by a non-latin filename survive the store",
        arabicKeyPresent,
        Object.keys((serviceRow?.resultData as { Files?: object } | undefined)?.Files ?? {}),
      );
    } finally {
      await prisma.application.delete({ where: { id: serviceProbe.id } });
    }

    // ---- who gets told about a report --------------------------------------
    // The recipient rule, asserted against the same columns the route filters
    // on. This is not an assertion that mail was sent — there is no sink for it
    // — but it does pin the two things that could leak across tenants: the
    // association filter, and the exclusion of a submitter who is themselves an
    // admin (they would otherwise get the same report twice per attach).
    console.log("\n  report notification recipients");

    const notified = await prisma.user.findMany({
      where: {
        associationId,
        role: "pharmacy_association_admin",
        status: "active",
      },
      select: { id: true, email: true },
    });
    check(
      "the filing's association has at least one active admin to notify",
      notified.length > 0,
      notified.map((u) => u.email),
    );

    const foreignAdmin = await prisma.user.findFirst({
      where: {
        role: "pharmacy_association_admin",
        status: "active",
        NOT: { associationId },
      },
      select: { id: true, associationId: true },
    });
    check(
      "an active admin exists in a different association",
      foreignAdmin !== null,
      foreignAdmin,
    );
    check(
      "that admin is outside the recipient set — tenant isolation holds",
      foreignAdmin !== null && !notified.some((u) => u.id === foreignAdmin.id),
      { notified: notified.map((u) => u.email), foreign: foreignAdmin?.associationId },
    );
    check(
      "the submitter is not in the admin recipient set, so no double send",
      !notified.some((u) => u.id === worker.id),
      { worker: worker.id, notified: notified.map((u) => u.email) },
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
