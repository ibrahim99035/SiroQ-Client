export type Role =
  | "super_admin"
  | "moderator"
  | "pharmacy_association_admin"
  | "pharmacy_worker";

export type UserStatus = "active" | "invited" | "disabled";
export type EntityStatus = "active" | "suspended";
export type ApplicationStatus =
  "pending" | "in_review" | "reported" | "rejected";
export type FileKind = "xlsx" | "xls" | "csv" | "attachment";
export type FileValidationState = "valid" | "warning" | "invalid";
export type ReportStatus = "draft" | "final";

export interface PharmacyAssociation {
  id: string;
  name: string;
  region: string;
  gmpCertificateId: string;
  status: EntityStatus;
  createdAt: string;
}

export interface Pharmacy {
  id: string;
  associationId: string;
  name: string;
  address: string;
  licenseNumber: string;
  status: EntityStatus;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  associationId?: string;
  pharmacyId?: string;
  status: UserStatus;
  createdAt: string;
}

export interface ApplicationFile {
  id: string;
  filename: string;
  /**
   * Authorised download path for this file's bytes, built by the serializer.
   *
   * Server-computed rather than assembled in the browser so the client never
   * hand-constructs an API path, and so the URL and the route that authorizes
   * it cannot drift apart.
   */
  downloadUrl: string;
  /**
   * False for seeded fixtures, which carry metadata but no stored bytes.
   *
   * Sending this instead of the storage key keeps the driver's internals on
   * the server, and lets the ledger omit a button that could only ever 404.
   */
  downloadable: boolean;
  sizeBytes: number;
  kind: FileKind;
  rowCount: number;
  columnCount: number;
  detectedColumns: string[];
  validationState: FileValidationState;
  validationReason: string;
  uploadedAt: string;
  /**
   * Whether the viewer who loaded this filing may replace or remove the file:
   * they uploaded it, or they hold the super-admin grant.
   *
   * Optional because the list projection never fetched it — absence means "not
   * determined", not "denied", so callers should hide the controls rather than
   * show them disabled. The route re-checks the same rule regardless.
   */
  editable?: boolean;
}

export type FileEventKind = "uploaded" | "replaced" | "deleted";

/**
 * One entry in a filing's chain of custody for evidence changes.
 *
 * Append-only: these rows are written in the same transaction as the change they
 * describe and have no delete path, which is the point — after a file is removed,
 * this is the only surviving record of what it was.
 *
 * `fileId` is a bare id, not a reference to a row that is expected to still
 * exist: a `deleted` event points at an id that is deliberately gone.
 */
export interface FileEvent {
  id: string;
  kind: FileEventKind;
  fileId: string | null;
  actorId: string;
  actorName?: string;
  actorRole?: Role;
  filename: string;
  sizeBytes: number | null;
  checksumSha256: string | null;
  previousFilename?: string;
  previousSizeBytes?: number;
  previousChecksumSha256?: string;
  createdAt: string;
  note?: string;
}

export interface StatusEvent {
  to: ApplicationStatus;
  changedById: string;
  /**
   * Resolved server-side from the `changedBy` relation. Optional because the
   * seeded mock rows only carry an id; the UI falls back to looking the id up
   * in the user list before giving up.
   */
  changedByName?: string;
  changedByRole?: Role;
  changedAt: string;
  note?: string;
}

/**
 * Report result payload. Deliberately freeform JSON: an attached report is an
 * arbitrary document, so the UI renders whatever keys arrive rather than a fixed
 * field list.
 *
 * The tree is recursive because the documents are. `ReportResultData` used to be
 * `Record<string, ReportValue>` with `ReportValue` a primitive, which could not
 * describe `{"finding": {"ndc": "…", "quantities": [1, 2]}}` without a cast —
 * so nested results were unrepresentable at the type level even though the
 * column accepted them.
 */
export type ReportValue = string | number | boolean | null;
export type ReportNode =
  ReportValue | ReportNode[] | { [key: string]: ReportNode };
export type ReportResultData = { [key: string]: ReportNode };

/**
 * Rich nodes the analysis service tags with a reserved key.
 *
 * The result payload is a recursive label→value tree, so anything richer than a
 * scalar has to be expressed as an object. A `$`-prefixed key marks a subtree as
 * *drawable* rather than tabular: without it the panel would show a bar chart as
 * a list of `"label — value"` strings, which is what the service used to send
 * because nothing here could render anything else.
 *
 * The tags are additive: a report with none of them still renders exactly as
 * before, which is why a hand-attached document is unaffected.
 */
export interface ChartNode {
  $chart: "bar" | "table";
  /** Present on `bar`: summed magnitude, so the reader has the denominator. */
  Total?: string;
  Bars?: { Label: string; Value: string; Share: string }[];
  /** Present on `table`. */
  Columns?: string[];
  Rows?: string[][];
}

export interface NoteItem {
  Severity: string;
  Subject: string;
  Detail: string;
}

export interface ForecastPoint {
  Period: string;
  Value: string;
  /** Interval bounds; present on projected points only. */
  Low?: string;
  High?: string;
}

export interface ForecastNode {
  $forecast: true;
  Series: string;
  Granularity: string;
  Method: string;
  "Method note": string;
  Confidence: string;
  Horizon: string;
  History: ForecastPoint[];
  Projected: ForecastPoint[];
  Accuracy?: Record<string, string>;
  Notes?: string[];
}

export interface NotesNode {
  $notes: NoteItem[];
}

/**
 * A tagged subtree, as a value of the tree type.
 *
 * The intersection is what the type system needs rather than an index signature
 * on each interface above: `ReportNode`'s object arm is `{[key: string]:
 * ReportNode}`, and a plain interface is not assignable to an index-signature
 * type, so `node is ChartNode` on a `ReportNode` parameter is rejected as a type
 * predicate. Intersecting keeps the readable interfaces and satisfies the
 * constraint in one place.
 */
type Tagged<T> = { [key: string]: ReportNode } & T;

export function isChartNode(
  node: ReportNode | undefined,
): node is Tagged<ChartNode> {
  return isPlainObject(node) && typeof node.$chart === "string";
}

export function isForecastNode(
  node: ReportNode | undefined,
): node is Tagged<ForecastNode> {
  return isPlainObject(node) && node.$forecast === true;
}

export function isNotesNode(
  node: ReportNode | undefined,
): node is Tagged<NotesNode> {
  return isPlainObject(node) && Array.isArray(node.$notes);
}

/** The tagged keys the panel hands to a renderer instead of walking. */
export const RICH_NODE_KEYS = ["$chart", "$forecast", "$notes"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ReportSource = "manual" | "service";

export interface Report {
  id: string;
  applicationId: string;
  status: ReportStatus;
  source: ReportSource;
  resultData: ReportResultData;
  generatedBy: string;
  /** Resolved server-side; see `StatusEvent.changedByName` for why. */
  generatedByName?: string;
  generatedAt: string;
  /**
   * Provenance when `source = "service"`. Never sent with an application row —
   * an attached report is up to 4 MB of text, so it is fetched on demand from
   * `GET /api/reports/[id]/raw` when the panel's raw toggle is opened.
   */
  engineVersion?: string;
  rawData?: string;
}

/**
 * Lifecycle of one analysis run, as tracked here.
 *
 * The service owns the same four states; this app records them so the filing can
 * show progress and survive a reload. `queued` and `running` are the only
 * non-terminal states.
 */
export type AnalysisRunStatus = "queued" | "running" | "succeeded" | "failed";

/** The most recent analysis run for a filing, as the detail page receives it. */
export interface AnalysisRunSummary {
  runId: string;
  status: AnalysisRunStatus;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface Application {
  id: string;
  /**
   * Human-readable filing reference, e.g. `AP-2026-2601`.
   *
   * Distinct from `id`, which is a UUID. The mock layer used the reference
   * *as* the primary key; the database keeps them separate so the number shown
   * in the interface never leaks database identity and cannot be guessed to
   * reach a row.
   */
  reference: string;
  title: string;
  pharmacyId: string;
  associationId: string;
  submittedBy: string;
  files: ApplicationFile[];
  status: ApplicationStatus;
  submittedAt: string;
  updatedAt: string;
  history: StatusEvent[];
  reportId?: string;
  /**
   * Most recent analysis run, or `null`/`undefined` when the filing has never
   * been analysed.
   *
   * Present on the detail projection only. It exists so a page opened after an
   * automatic trigger can pick the run back up: without it, a filing whose
   * analysis started on submission would look un-analysed to anyone arriving
   * later, and the only way to find out would be to ask the analysis service.
   */
  latestRun?: AnalysisRunSummary | null;
  /**
   * Custody log for changes to this filing's files, newest first.
   *
   * Detail projection only, for the same reason as `latestRun`: no other screen
   * renders it, so the list does not pay to fetch it.
   */
  fileEvents?: FileEvent[];
  /**
   * Whether this viewer may attach another file to this filing.
   *
   * Server-derived, like the per-file `editable`, because the rule is not
   * guessable in the browser: it is the submitter, a prior uploader of this
   * filing, or a super admin. Undefined on projections that did not resolve a
   * viewer, which is "cannot tell" rather than "denied".
   */
  canAddFiles?: boolean;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  moderator: "Moderator",
  pharmacy_association_admin: "Association admin",
  pharmacy_worker: "Pharmacy worker",
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  reported: "Reported",
  rejected: "Rejected",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Draft",
  final: "Final",
};

export interface ReportRichTextNode {
  $rich: {
    content: unknown;
    title?: string;
  };
}

export function isRichTextNode(value: unknown): value is ReportRichTextNode {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!record.$rich || typeof record.$rich !== "object") return false;
  const rich = record.$rich as Record<string, unknown>;
  return "content" in rich;
}
