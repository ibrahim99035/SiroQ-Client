import "server-only";

/**
 * The filing row the UI consumes, in one place.
 *
 * `GET /api/applications` (list) and `GET /api/applications/[id]` (detail) return
 * the *same* shape, so there is one select and one serializer. Two projections
 * were tempting — the list does not read the report, and a real report is
 * ~8,202 nodes — but a second shape means the client mapper has to reconstruct a
 * partial `ApplicationRow`, i.e. a type that lies about what it holds. When
 * report payloads actually hurt, the fix is a summary projection declared in
 * `lib/types.ts`, not a quietly truncated row.
 */

const userSummary = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  associationId: true,
  pharmacyId: true,
  createdAt: true,
} as const;

const associationSummary = {
  id: true,
  name: true,
  region: true,
  gmpCertificateId: true,
  status: true,
  createdAt: true,
} as const;

const pharmacySummary = {
  id: true,
  associationId: true,
  name: true,
  address: true,
  licenseNumber: true,
  status: true,
  createdAt: true,
} as const;

const fileSummary = {
  id: true,
  originalName: true,
  kind: true,
  mimeType: true,
  sizeBytes: true,
  rowCount: true,
  columnCount: true,
  detectedColumns: true,
  validationState: true,
  validationReason: true,
  uploadedAt: true,
} as const;

/**
 * The actor is selected alongside each event rather than resolved in the UI.
 * `StatusTimeline` used to look `changedById` up in the seeded mock user list,
 * which never contains a real database uuid, so every audit line fell through
 * to "System" and a super admin's triage action was attributed to the machine.
 */
const eventSummary = {
  to: true,
  fromStatus: true,
  changedById: true,
  note: true,
  changedAt: true,
  changedBy: { select: { id: true, name: true, role: true } },
} as const;

/**
 * Report columns carried on every row.
 *
 * `rawData` is deliberately absent. An attached report is an arbitrary document
 * capped at 4 MB, and inlining that text in the list endpoint would multiply it
 * by the page size; the panel fetches it from `GET /api/reports/[id]/raw` when
 * the raw toggle is opened.
 */
const reportSummary = {
  id: true,
  status: true,
  source: true,
  generatedById: true,
  generatedAt: true,
  engineVersion: true,
  generatedBy: { select: { name: true } },
} as const;

const baseRowSelect = {
  id: true,
  title: true,
  reference: true,
  pharmacyId: true,
  associationId: true,
  submittedById: true,
  status: true,
  submittedAt: true,
  updatedAt: true,
  analysisApplicationId: true,
  analysisName: true,
  pharmacy: { select: pharmacySummary },
  association: { select: associationSummary },
  submittedBy: { select: userSummary },
  files: { select: fileSummary, orderBy: { uploadedAt: "asc" } },
  events: { select: eventSummary, orderBy: { changedAt: "asc" } },
} as const;

/** List projection: no report payload, so a page of filings stays small. */
export const applicationRowSelect = {
  ...baseRowSelect,
  report: { select: reportSummary },
} as const;

/** Detail projection: adds the structured result tree for the report panel. */
export const applicationDetailRowSelect = {
  ...baseRowSelect,
  report: { select: { ...reportSummary, resultData: true } },
} as const;

type ApplicationRowPayload = {
  id: string;
  title: string;
  reference: string;
  pharmacyId: string;
  associationId: string;
  submittedById: string;
  status: "pending" | "in_review" | "reported" | "rejected";
  submittedAt: Date;
  updatedAt: Date;
  analysisApplicationId: string | null;
  analysisName: string | null;
  pharmacy: {
    id: string;
    associationId: string;
    name: string;
    address: string;
    licenseNumber: string;
    status: "active" | "suspended";
    createdAt: Date;
  };
  association: {
    id: string;
    name: string;
    region: string;
    gmpCertificateId: string;
    status: "active" | "suspended";
    createdAt: Date;
  };
  submittedBy: {
    id: string;
    email: string;
    name: string;
    role: "super_admin" | "moderator" | "pharmacy_association_admin" | "pharmacy_worker";
    status: "active" | "invited" | "disabled";
    associationId: string | null;
    pharmacyId: string | null;
    createdAt: Date;
  };
  files: {
    id: string;
    originalName: string;
    kind: "xlsx" | "csv";
    mimeType: string;
    sizeBytes: bigint;
    rowCount: number;
    columnCount: number;
    detectedColumns: string[];
    validationState: "valid" | "warning" | "invalid";
    validationReason: string;
    uploadedAt: Date;
  }[];
  events: {
    to: "pending" | "in_review" | "reported" | "rejected";
    fromStatus: "pending" | "in_review" | "reported" | "rejected" | null;
    changedById: string;
    note: string | null;
    changedAt: Date;
    changedBy: { id: string; name: string; role: string } | null;
  }[];
  report: {
    id: string;
    status: "draft" | "final";
    source: "manual" | "service";
    /** Only present under `applicationDetailRowSelect`. */
    resultData?: unknown;
    generatedById: string;
    generatedBy: { name: string } | null;
    generatedAt: Date;
    engineVersion: string | null;
  } | null;
};

/**
 * Prisma shape → the `ApplicationRow` the components render.
 *
 * Three conversions happen here and nowhere else:
 *
 * - `BigInt` (`sizeBytes`) → `Number`. `JSON.stringify` throws on a BigInt, so a
 *   filing with any file would 500 on read. Files are capped well inside
 *   `Number.MAX_SAFE_INTEGER`, so the cast cannot lose precision.
 * - `Date` → ISO string, matching the client types.
 * - The app's own vocabulary wins over the database's. The columns are
 *   `submittedById`/`events`/`originalName`, but the UI has always read
 *   `submittedBy`/`history`/`filename`; renaming the columns would churn every
 *   component and query for no user-visible gain, so the mapper carries the
 *   translation instead.
 */
export function serializeApplicationRow(row: ApplicationRowPayload) {
  const totalRows = row.files.reduce((sum, file) => sum + file.rowCount, 0);
  // Accumulated as BigInt, then narrowed once at the end. Reducing with a `0`
  // seed would make this `number + bigint`, which is a type error rather than a
  // silent truncation — `rowCount` is a plain Int so it reduces in `number`.
  // `BigInt(0)` rather than the `0n` literal: the TS target is below ES2020.
  const totalBytes = row.files.reduce((sum, file) => sum + file.sizeBytes, BigInt(0));

  return {
    application: {
      id: row.id,
      title: row.title,
      reference: row.reference,
      pharmacyId: row.pharmacyId,
      associationId: row.associationId,
      submittedBy: row.submittedById,
      status: row.status,
      submittedAt: row.submittedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      analysisApplicationId: row.analysisApplicationId,
      analysisName: row.analysisName,
      files: row.files.map((file) => ({
        id: file.id,
        filename: file.originalName,
        sizeBytes: Number(file.sizeBytes),
        kind: file.kind,
        rowCount: file.rowCount,
        columnCount: file.columnCount,
        detectedColumns: file.detectedColumns,
        validationState: file.validationState,
        validationReason: file.validationReason,
        uploadedAt: file.uploadedAt.toISOString(),
      })),
      // `note` is nullable in the database and optional in the client type, so a
      // null is normalised to `undefined` rather than leaking into `note && …`
      // checks, which would render the string "null"-ish falsy branches.
      history: row.events.map((event) => ({
        to: event.to,
        fromStatus: event.fromStatus,
        changedById: event.changedById,
        changedByName: event.changedBy?.name,
        changedByRole: event.changedBy?.role,
        changedAt: event.changedAt.toISOString(),
        note: event.note ?? undefined,
      })),
      reportId: row.report?.id,
    },
    pharmacy: {
      id: row.pharmacy.id,
      associationId: row.pharmacy.associationId,
      name: row.pharmacy.name,
      address: row.pharmacy.address,
      licenseNumber: row.pharmacy.licenseNumber,
      status: row.pharmacy.status,
      createdAt: row.pharmacy.createdAt.toISOString(),
    },
    association: {
      id: row.association.id,
      name: row.association.name,
      region: row.association.region,
      gmpCertificateId: row.association.gmpCertificateId,
      status: row.association.status,
      createdAt: row.association.createdAt.toISOString(),
    },
    submitter: {
      id: row.submittedBy.id,
      email: row.submittedBy.email,
      name: row.submittedBy.name,
      role: row.submittedBy.role,
      status: row.submittedBy.status,
      // The API sends `null` for "no tenant"; the client type models absence as
      // `undefined`. Same asymmetry the user/association rows already handle.
      associationId: row.submittedBy.associationId ?? undefined,
      pharmacyId: row.submittedBy.pharmacyId ?? undefined,
      createdAt: row.submittedBy.createdAt.toISOString(),
    },
    report: row.report
      ? {
          id: row.report.id,
          applicationId: row.id,
          status: row.report.status,
          source: row.report.source,
          // `{}` under the list projection, which does not select it. The list
          // never renders the panel, and a missing tree is honest where the
          // projection deliberately did not fetch one.
          resultData: (row.report.resultData ?? {}) as Record<string, never>,
          generatedBy: row.report.generatedById,
          generatedByName: row.report.generatedBy?.name,
          generatedAt: row.report.generatedAt.toISOString(),
          engineVersion: row.report.engineVersion ?? undefined,
        }
      : null,
    totalRows,
    totalBytes: Number(totalBytes),
  };
}
