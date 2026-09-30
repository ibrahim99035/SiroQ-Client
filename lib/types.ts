export type Role =
  | "super_admin"
  | "moderator"
  | "pharmacy_association_admin"
  | "pharmacy_worker";

export type UserStatus = "active" | "invited" | "disabled";
export type EntityStatus = "active" | "suspended";
export type ApplicationStatus = "pending" | "in_review" | "reported" | "rejected";
export type FileKind = "xlsx" | "csv";
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
  sizeBytes: number;
  kind: FileKind;
  rowCount: number;
  columnCount: number;
  detectedColumns: string[];
  validationState: FileValidationState;
  validationReason: string;
  uploadedAt: string;
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
export type ReportNode = ReportValue | ReportNode[] | { [key: string]: ReportNode };
export type ReportResultData = { [key: string]: ReportNode };

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