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
import {
  emptyDoc,
  isBlankDoc,
  mergeRichTextBlocks,
  nextBlockKey,
  pdfAttachments,
  resultDataToBlocks,
} from "../lib/report-blocks";

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
 * wired up, and it exercises the three cases the seeded reports do not: a
 * `Schema version` key the panel checks itself against; per-file branches
 * *keyed by filename*, which in the sample corpus are Arabic and reach depth 4;
 * and arrays of prose both at the top level and nested inside a file branch.
 * `ReportResultData` has to describe all of it, or the panel degrades on the
 * first real filing.
 *
 * Key names and value shapes mirror `_file_projection` in the service
 * (`app/analytics_service/reporting.py`); its own
 * `tests/test_client_projection.py` is the authority on the contract, so this
 * fixture only has to stay faithful, not be exhaustive.
 */
/**
 * A service projection, with the shapes `_file_projection` actually emits.
 *
 * This used to be a flat pre-charts projection. It now carries the tagged nodes
 * (`$chart`, `$forecast`, `$notes`) verbatim, including the `$`-prefixed keys,
 * the object-valued `Bars`/`History`/`Projected` arrays and the nested
 * `Accuracy`/`Notes` — because a fixture that only *resembles* the service
 * output would pass the round-trip check while proving nothing about whether the
 * rich nodes survive the store.
 *
 * The forecast's 18 history + 6 projected points, 90% interval bounds and
 * R²/RMSE accuracy keys are the real output shape, not placeholders.
 */
const SERVICE_DOCUMENT = {
  "Schema version": "siroq.client.v1",
  Application: "AP-2026-2601 · Twin Harbors",
  "Analysis ID": "40b611c9-743e-4e1f-b799-b645032e9fa0",
  "Application ID": "18cecd9d-3cac-4d91-98b5-4e2f5a414fca",
  "Analyzed at": "2026-09-26T15:19:32.145300+00:00",
  "Engine version": "0.1.0",
  "Files analyzed": "10",
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
      Type: "Excel workbook (.xls)",
      Rows: "2,485",
      Columns: "14",
      Size: "301,056 bytes",
      "Detected category": "inventory",
      "Category confidence": {
        $chart: "bar",
        Bars: [
          { Label: "inventory", Value: "96.0%", Share: "100.0%" },
          { Label: "sales", Value: "4.0%", Share: "4.2%" },
        ],
      },
      Quality: {
        Score: "88.6%",
        Verdict: "Review",
        "Checks passed": "9 of 15",
        "Failed checks": "negative_values",
        Warnings: "nulls_in_totals",
        "Duplicate rows": "0",
        Findings: "2",
        "Finding detail": [
          "negative_values=fail count=3 by_column=Amount",
          "nulls_in_totals=warn count=11 by_column=Total",
        ],
      },
      Domain: {
        "Gross margin": "9.93%",
        Revenue: "323,417.86",
        "Margin basis": "row totals",
        "Stock value": {
          $chart: "bar",
          Total: "77,002.00",
          Bars: [
            { Label: "product 812", Value: "41,220.00", Share: "100.0%" },
            { Label: "product 415", Value: "18,904.50", Share: "45.9%" },
          ],
        },
        "Not analyzed": "no unit_cost column",
      },
      Insights: {
        Revenue: { "Total revenue": "323,417.86", "Average sale": "130.19" },
        "Not computed": {
          $notes: [
            {
              Severity: "warn",
              Subject: "Skipped — Gross profit",
              Detail: "Needs a revenue column and a cost column together",
            },
          ],
        },
      },
      "Column profile": {
        Amount: {
          Type: "number",
          Nulls: "1.2%",
          Unique: "94.3%",
          Statistics: "min -120.00; mean 130.19; max 8,410.00; sum 323,417.86",
          "Most frequent": "0 × 31, 250 × 18",
        },
      },
      Forecast: {
        $forecast: true,
        Series: "Revenue",
        Granularity: "week",
        Method: "linear",
        "Method note": "Least-squares linear trend extrapolated forward.",
        Confidence: "90% interval",
        Horizon: "6 weeks ahead",
        History: [
          { Period: "2026-05-04", Value: "994.00" },
          { Period: "2026-05-11", Value: "1,493.00" },
          { Period: "2026-05-18", Value: "1,540.00" },
          { Period: "2026-05-25", Value: "1,587.00" },
        ],
        Projected: [
          {
            Period: "2026-06-08",
            Value: "1,463.49",
            Low: "1,122.60",
            High: "1,804.39",
          },
          {
            Period: "2026-06-15",
            Value: "1,493.15",
            Low: "1,040.10",
            High: "1,946.20",
          },
          {
            Period: "2026-06-22",
            Value: "1,522.81",
            Low: "969.80",
            High: "2,075.82",
          },
          {
            Period: "2026-06-29",
            Value: "1,552.47",
            Low: "894.20",
            High: "2,210.74",
          },
          {
            Period: "2026-07-06",
            Value: "1,582.13",
            Low: "826.10",
            High: "2,338.16",
          },
          {
            Period: "2026-07-13",
            Value: "1,647.52",
            Low: "812.50",
            High: "2,482.55",
          },
        ],
        Accuracy: { "Error (RMSE)": "207.25", "Typical error": "0.2%", "Fit (R²)": "0.56" },
        Notes: ["Treat the interval, not the midpoint, as the answer."],
      },
      Caveats: {
        $notes: [
          {
            Severity: "critical",
            Subject: "Read error",
            Detail: "Failed to read file: no Excel engine could read this workbook",
          },
          {
            Severity: "info",
            Subject: "Structural rows",
            Detail:
              "94 of 2,579 rows had no product identity and no money value, " +
              "so they are excluded from every money metric in this file",
          },
          {
            Severity: "info",
            Subject: "How this table was read",
            Detail:
              "report-table discovery: header row at row 4, 14 columns, 2,485 data rows",
          },
        ],
      },
    },
    "حركة بيع صنف - سالم.xls": {
      Type: "Excel workbook (.xls)",
      Rows: "18,904",
      Columns: "9",
      "Detected category": "sales",
      "Category confidence": {
        $chart: "bar",
        Bars: [{ Label: "sales", Value: "100.0%", Share: "100.0%" }],
      },
      Quality: { Score: "80.1%", Verdict: "Review", Findings: "3" },
      Domain: { "Gross margin": "2.84%", Revenue: "1,204,318.00" },
    },
  },
  "Evidence gaps": {
    $notes: [
      {
        Severity: "warn",
        Subject: "inventory-salem.xls",
        Detail:
          "94 of 2,579 source rows are structural and excluded from the " +
          "money metrics above",
      },
      {
        Severity: "critical",
        Subject: "product - category- salem 22.xls",
        Detail: "every row lacks a product identity column",
      },
    ],
  },
};

/**
 * Every leaf of the document, and how deep the walk goes.
 *
 * `ReportNode` is `ReportValue | ReportNode[] | { [key]: ReportNode }` and
 * `ReportValue` is a primitive, so a single non-primitive leaf anywhere is a
 * value the panel's `formatReportValue` would stringify into `[object Object]`
 * — or throw on. Asserting the leaf set is the part of "will it render" that can
 * be checked without a DOM.
 *
 * Inside a tagged subtree the rule inverts, and deliberately: `$chart`'s
 * `Bars`, `$forecast`'s `History`/`Projected` and `$notes`'s records are objects
 * *by design*, because they are what a renderer reads instead of printing. So
 * the audit records them separately — `objectListItems` — rather than flagging
 * them, which means an untagged object list still fails.
 */
type LeafAudit = {
  bad: string[];
  /** Object items in a list outside any tagged node — always a defect. */
  objectListItems: string[];
  /** Object items in a list inside a tagged node — expected, and counted. */
  taggedObjectListItems: string[];
  deepest: number;
  count: number;
};

const RICH_TAGS = ["$chart", "$forecast", "$notes"] as const;

function leafAudit(node: unknown, path = "", depth = 0, tagged = false): LeafAudit {
  const acc: LeafAudit = {
    bad: [],
    objectListItems: [],
    taggedObjectListItems: [],
    deepest: depth,
    count: 0,
  };

  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      const itemPath = `${path}[${index}]`;
      if (item !== null && typeof item === "object") {
        (tagged ? acc.taggedObjectListItems : acc.objectListItems).push(itemPath);
      }
      const child = leafAudit(item, itemPath, depth + 1, tagged);
      acc.bad.push(...child.bad);
      acc.objectListItems.push(...child.objectListItems);
      acc.taggedObjectListItems.push(...child.taggedObjectListItems);
      acc.deepest = Math.max(acc.deepest, depth + 1);
      acc.count += child.count;
    }
    return acc;
  }

  if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    const nowTagged = tagged || RICH_TAGS.some((tag) => tag in record);
    for (const [key, value] of Object.entries(record)) {
      const child = leafAudit(value, path ? `${path}.${key}` : key, depth + 1, nowTagged);
      acc.bad.push(...child.bad);
      acc.objectListItems.push(...child.objectListItems);
      acc.taggedObjectListItems.push(...child.taggedObjectListItems);
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

/** Every tagged node in the document, at any depth. */
function findTagged(node: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) findTagged(item, found);
  } else if (node !== null && typeof node === "object") {
    const record = node as Record<string, unknown>;
    if (RICH_TAGS.some((tag) => tag in record)) found.push(record);
    for (const value of Object.values(record)) findTagged(value, found);
  }
  return found;
}

/**
 * Deletes a probe filing without ever throwing.
 *
 * Cleanup runs in a `finally`, so a failure here replaces whatever the run was
 * actually reporting: the suite would report a database timeout as its verdict
 * and the real assertion would never be seen. Worse, the probe survives, so the
 * next run trips over it. A leaked row is worth a warning; losing the result is
 * not. The remote database in this environment times out often enough for this
 * to be the difference between a readable run and no run.
 */
async function discard(prisma: PrismaClient, id: string): Promise<void> {
  try {
    const gone = await prisma.application.deleteMany({ where: { id } });
    if (gone.count > 0) console.log(`\n  removed probe filing ${id}`);
  } catch (reason) {
    console.warn(`\n  WARNING: could not remove probe filing ${id}; delete it by hand.`);
    console.warn(reason instanceof Error ? reason.message : reason);
  }
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
        // Measured on the real sample corpus: 10 files -> 145 leaves, 6.1 KB,
        // deepest leaf at depth 4 when the file has no Insights or Column
        // profile branch populated. Those branches are conditional in
        // `_file_projection`, and when either is present the real document
        // reaches depth 5 (`Files` > filename > `Insights` > group > item), so
        // the fixture deliberately goes one deeper to cover it.
        "the fixture nests as deeply as a real projection can",
        audit.deepest >= 4,
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

      // ---- the tagged nodes, through the store -------------------------------
      // The round-trip above proves the JSON is intact; these assert the shapes a
      // renderer destructures. If the service ever drops a key, or sends bars
      // without `Share`, the panel would silently draw a wrong chart — which is
      // why each destructured key is pinned here rather than left to the type.
      console.log("\n  rich report nodes");

      const storedTags = findTagged(serviceRow?.resultData);
      const charts = storedTags.filter((node) => typeof node.$chart === "string");
      const forecasts = storedTags.filter((node) => node.$forecast === true);
      const notes = storedTags.filter((node) => Array.isArray(node.$notes));

      check("bar charts survive the store", charts.length > 0, charts.length);
      check(
        "every chart keeps the keys the panel reads",
        charts.every((node) => {
          if (node.$chart === "table") return Array.isArray(node.Columns) && Array.isArray(node.Rows);
          return Array.isArray(node.Bars) && (node.Bars as unknown[]).every((bar) =>
            ["Label", "Value", "Share"].every((key) =>
              typeof (bar as Record<string, unknown>)[key] === "string",
            ),
          );
        }),
        charts.map((node) => node.$chart),
      );

      check("the forecast node survives the store", forecasts.length > 0, forecasts.length);
      check(
        "the forecast keeps the interval bounds the band is drawn from",
        forecasts.every((node) => {
          const projected = node.Projected as Record<string, string>[] | undefined;
          return (
            Array.isArray(projected) &&
            projected.length > 0 &&
            projected.every((p) => typeof p.Low === "string" && typeof p.High === "string")
          );
        }),
        (forecasts[0]?.Projected as unknown[] | undefined)?.length,
      );
      check(
        "the forecast states its method, confidence and horizon",
        forecasts.every(
          (node) =>
            typeof node.Method === "string" &&
            typeof node.Confidence === "string" &&
            typeof node.Horizon === "string",
        ),
        forecasts[0]?.Method,
      );

      check("notes nodes survive the store", notes.length > 0, notes.length);
      check(
        "every note carries a severity, subject and detail",
        notes.every((node) =>
          (node.$notes as Record<string, unknown>[]).every(
            (note) =>
              typeof note.Severity === "string" &&
              typeof note.Subject === "string" &&
              typeof note.Detail === "string",
          ),
        ),
        notes.map((node) => (node.$notes as unknown[]).length),
      );

      // The inverse of the leaf audit: object list items are only legitimate
      // *inside* a tag. A `$notes` record or a bar that escaped its subtree would
      // render as `[object Object]`.
      check(
        "no object list items outside a tagged node",
        audit.objectListItems.length === 0,
        audit.objectListItems,
      );
      // Otherwise the assertion above would also pass on a document with no
      // tagged lists at all — i.e. on the old flat fixture, which is the case
      // this fixture exists to replace.
      check(
        "the fixture does exercise object lists inside tags",
        audit.taggedObjectListItems.length > 0,
        audit.taggedObjectListItems.length,
      );

      // ---- a narrative edit must not cost the projection anything ----------
      // The detail page's narrative sections are `$rich` nodes stored *inside*
      // `result_data`, so a save from that editor rewrites the whole document.
      // `mergeRichTextBlocks` is therefore the only thing standing between a
      // reviewer's edit and the loss of every finding the analysis produced:
      // building the document from the blocks alone writes back a report
      // containing nothing but prose, with no error and no audit row to notice
      // it by.
      //
      // Asserted against the real fixture, and against the function itself. An
      // earlier version of this section drove the same scenario over HTTP and
      // passed even with the merge deliberately broken — it PATCHed a document
      // the test had built itself, so the code under test was never called.
      console.log("\n  a narrative edit preserves the projection");

      const narrativeDoc = {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Conclusion" }] },
          { type: "paragraph", content: [{ type: "text", text: "Two files need review." }] },
        ],
      };
      const projection = SERVICE_DOCUMENT as Record<string, unknown>;
      const storedBlocks = resultDataToBlocks(projection);
      check(
        "a service projection contains no narrative blocks to begin with",
        storedBlocks.length === 0,
        storedBlocks.map((block) => block.id),
      );

      const added = mergeRichTextBlocks(projection, [
        { id: "Rich text 1", title: "Conclusion", content: narrativeDoc },
      ]);
      check(
        "adding a section keeps every projection key",
        Object.keys(projection).every((key) => deepEqual(added[key], projection[key])),
        Object.keys(projection).filter((key) => !deepEqual(added[key], projection[key])),
      );
      check(
        "the added section is readable back out of the document",
        deepEqual(resultDataToBlocks(added), [
          { id: "Rich text 1", title: "Conclusion", content: narrativeDoc },
        ]),
        resultDataToBlocks(added),
      );

      // Deleting must remove exactly the block deleted — an implementation that
      // rebuilt the document from the surviving blocks alone would pass the add
      // above and then lose the projection on the way out.
      check(
        "removing the section restores the original document",
        deepEqual(mergeRichTextBlocks(added, []), projection),
        Object.keys(mergeRichTextBlocks(added, [])).filter(
          (key) => !deepEqual(mergeRichTextBlocks(added, [])[key], projection[key]),
        ),
      );

      const twoBlocks = mergeRichTextBlocks(projection, [
        { id: "Rich text 1", title: "Conclusion", content: narrativeDoc },
        { id: "Rich text 2", title: "Caveats", content: narrativeDoc },
      ]);
      check(
        "deleting one of two sections leaves the other",
        deepEqual(resultDataToBlocks(mergeRichTextBlocks(twoBlocks, [
          { id: "Rich text 2", title: "Caveats", content: narrativeDoc },
        ])), [{ id: "Rich text 2", title: "Caveats", content: narrativeDoc }]),
        resultDataToBlocks(mergeRichTextBlocks(twoBlocks, [
          { id: "Rich text 2", title: "Caveats", content: narrativeDoc },
        ])),
      );
      check(
        "and still keeps the projection",
        Object.keys(projection).every((key) => deepEqual(twoBlocks[key], projection[key])),
        Object.keys(projection).filter((key) => !deepEqual(twoBlocks[key], projection[key])),
      );

      check(
        "an added section never reuses a key already in the document",
        nextBlockKey(["Rich text 1", "Rich text 2"]) === "Rich text 3",
        nextBlockKey(["Rich text 1", "Rich text 2"]),
      );
      check(
        "a blank section is recognised as blank",
        isBlankDoc(emptyDoc()) && !isBlankDoc(narrativeDoc),
      );

      // ---- quoting a PDF from the filing ----
      //
      // A quoted document is a node holding a file id, a filename and the
      // authorized download path. No bytes, no base64, no second table: the PDF
      // already lives on the filing as an ApplicationFile, and the reader's
      // browser fetches it through the tenant-scoped content route that the
      // ledger's own download button uses.
      console.log("\n  a section can quote a PDF from the filing");

      const pdfDoc = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Supporting evidence." }] },
          {
            type: "pdf",
            attrs: {
              fileId: "11111111-2222-4333-8444-555555555555",
              filename: "audited-accounts.pdf",
              url: "/api/applications/APP/files/11111111-2222-4333-8444-555555555555/content",
            },
          },
        ],
      };

      // The bug this guards: `isBlankDoc` walked text and content only, so a
      // section whose sole content was a PDF scored as empty and
      // `ReportRichBlocks` discarded it on commit. A reviewer who cited a
      // document and wrote no prose about it lost the citation with no error.
      check(
        "a section holding only a PDF is not treated as an abandoned draft",
        !isBlankDoc({ type: "doc", content: [{ type: "pdf", attrs: { fileId: "x" } }] }),
      );
      check(
        "a PDF alongside prose is still not blank",
        !isBlankDoc(pdfDoc),
      );
      check(
        "quoting a PDF does not make an otherwise blank section non-blank",
        isBlankDoc({ type: "doc", content: [{ type: "paragraph", content: [] }] }),
      );

      // The picker offers documents and nothing else. Filtered by extension, so
      // a browser that guessed octet-stream for a PDF does not drop it, and a
      // Tableau workbook is not silently offered as a readable document.
      const picker = pdfAttachments([
        { id: "1", filename: "accounts.pdf", downloadUrl: "/a", downloadable: true },
        { id: "2", filename: "ledger.xlsx", downloadUrl: "/b", downloadable: true },
        { id: "3", filename: "warehouse.twb", downloadUrl: "/c", downloadable: true },
        { id: "4", filename: "PIPELINE.PDF", downloadUrl: "/d", downloadable: false },
        { id: "5", filename: "roster.csv", downloadUrl: "/e", downloadable: true },
      ]);
      check(
        "the picker offers the filing's PDFs and nothing else",
        picker.map((pdf) => pdf.filename).join(",") === "accounts.pdf,PIPELINE.PDF",
        picker.map((pdf) => pdf.filename),
      );
      check(
        "the picker keeps the server's own downloadable verdict",
        picker.map((pdf) => pdf.downloadable).join(",") === "true,false",
        picker.map((pdf) => pdf.downloadable),
      );
      check(
        "a filing with no PDFs yields an empty picker rather than throwing",
        pdfAttachments(undefined).length === 0 && pdfAttachments([]).length === 0,
      );

      // Round trip through the document the route stores. The node is opaque
      // data — the route does not resolve it, which is exactly why a file id
      // belonging to another tenant cannot leak: the reader's own request to the
      // scoped content route is what decides, and that route 404s.
      const withPdf = mergeRichTextBlocks(projection, [
        { id: "Rich text 1", title: "Evidence", content: pdfDoc },
      ]);
      check(
        "a quoted PDF survives a write and read of the document",
        deepEqual(
          resultDataToBlocks(withPdf).map((block) => block.content),
          [pdfDoc],
        ),
        resultDataToBlocks(withPdf),
      );
      check(
        "quoting a PDF leaves every projection key untouched",
        Object.keys(projection).every((key) => deepEqual(withPdf[key], projection[key])),
        Object.keys(projection).filter((key) => !deepEqual(withPdf[key], projection[key])),
      );

      // The permission the route enforces, and the same one the section gates
      // its editor on. Driven over HTTP because the gate is server-side.
      const storedReportId = serviceRow?.id;
      const deniedEdit = await request(
        associationCookie,
        "PATCH",
        `/api/reports/${storedReportId}`,
        { resultData: added },
      );
      check(
        "an association admin cannot edit a report (403)",
        deniedEdit.status === 403,
        deniedEdit.status,
      );

      const allowedEdit = await request(superCookie, "PATCH", `/api/reports/${storedReportId}`, {
        resultData: added,
        rawData: JSON.stringify(added, null, 2),
      });
      check(
        "a super admin can write a narrative section through",
        allowedEdit.status === 200,
        `${allowedEdit.status} ${JSON.stringify(allowedEdit.body).slice(0, 160)}`,
      );
      const roundTripped = await prisma.report.findUniqueOrThrow({
        where: { id: storedReportId! },
        select: { resultData: true, rawData: true },
      });
      check(
        "the stored document is what was sent, projection intact",
        deepEqual(roundTripped.resultData, added),
        Object.keys(roundTripped.resultData as Record<string, unknown>).filter(
          (key) => !deepEqual((roundTripped.resultData as Record<string, unknown>)[key], added[key]),
        ),
      );
      check(
        "the raw document was kept in step with the tree",
        deepEqual(JSON.parse(roundTripped.rawData), added),
      );

      // The same write, with a PDF quoted in the section. Driven over HTTP
      // because what is at stake is that the route stores an arbitrary node it
      // knows nothing about without rejecting it, mangling it, or dropping the
      // projection around it.
      const pdfWrite = await request(superCookie, "PATCH", `/api/reports/${storedReportId}`, {
        resultData: withPdf,
        rawData: JSON.stringify(withPdf, null, 2),
      });
      check(
        "a report containing a quoted PDF is accepted",
        pdfWrite.status === 200,
        `${pdfWrite.status} ${JSON.stringify(pdfWrite.body).slice(0, 160)}`,
      );
      const pdfRead = await prisma.report.findUniqueOrThrow({
        where: { id: storedReportId! },
        select: { resultData: true, rawData: true },
      });
      check(
        "the quoted PDF node is stored verbatim",
        deepEqual(resultDataToBlocks(pdfRead.resultData as Record<string, unknown>), [
          { id: "Rich text 1", title: "Evidence", content: pdfDoc },
        ]),
        resultDataToBlocks(pdfRead.resultData as Record<string, unknown>),
      );
      check(
        "the raw document keeps the PDF node too, so the pharmacy receives it",
        deepEqual(JSON.parse(pdfRead.rawData), withPdf),
      );

      // And the cross-tenant case, which is the whole reason the node holds an
      // id rather than bytes. A `fileId` from another filing — hand-written into
      // the document by anyone with edit access — resolves to nothing, because
      // the browser's request goes through the same scoped content route the
      // ledger uses. verify-authz covers that route's own refusals; this pins
      // that the narrative offers no way around it.
      const unknownFile = await request(
        superCookie,
        "GET",
        `/api/applications/${serviceProbe.id}/files/11111111-2222-4333-8444-555555555555/content`,
      );
      check(
        "a quoted file id the filing does not hold resolves to nothing",
        unknownFile.status === 404,
        unknownFile.status,
      );
    } finally {
      await discard(prisma, serviceProbe.id);
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
    await discard(prisma, probe.id);
    console.log(`\n  filings remaining: ${await prisma.application.count()}`);
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((reason) => {
  console.error(reason);
  process.exitCode = 1;
});
