import "server-only";

import type { FileKind } from "@/lib/types";

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
  storageDriver: true,
  // Selected only so the mapper can decide whether this viewer may replace or
  // delete the file. The decision itself stays server-side: the flag is derived
  // from the same `canEditApplicationFile` rule the route enforces, and the
  // client only uses it to decide whether to draw a button.
  uploadedById: true,
} as const;

/**
 * Custody log for evidence changes.
 *
 * Ordered newest-first, unlike `events`, because this is a log an auditor reads
 * from the present backwards: what changed, by whom, and whether the bytes the
 * review relied on are still the bytes on the filing. `previous*` carries what
 * the file was before, which is the only trace of the old object once it is
 * gone from storage.
 */
const fileEventSummary = {
  id: true,
  kind: true,
  fileId: true,
  actorId: true,
  filename: true,
  sizeBytes: true,
  checksumSha256: true,
  previousFilename: true,
  previousSizeBytes: true,
  previousChecksumSha256: true,
  note: true,
  createdAt: true,
  actor: { select: { id: true, name: true, role: true } },
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

/**
 * Detail projection: adds the structured result tree for the report panel.
 *
 * `analysisRuns` carries only the most recent run. The detail page needs to know
 * whether an analysis is already in flight — an automatic trigger may have
 * started one the user never asked for — and reading that from the filing's own
 * row costs one indexed lookup instead of a second call into the analysis
 * service on every page view.
 */
export const applicationDetailRowSelect = {
  ...baseRowSelect,
  report: { select: { ...reportSummary, resultData: true } },
  fileEvents: { select: fileEventSummary, orderBy: { createdAt: "desc" } },
  analysisRuns: {
    take: 1,
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
    },
  },
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
    role:
      | "super_admin"
      | "moderator"
      | "pharmacy_association_admin"
      | "pharmacy_worker";
    status: "active" | "invited" | "disabled";
    associationId: string | null;
    pharmacyId: string | null;
    createdAt: Date;
  };
  files: {
    id: string;
    originalName: string;
    kind: FileKind;
    mimeType: string;
    sizeBytes: bigint;
    rowCount: number;
    columnCount: number;
    detectedColumns: string[];
    validationState: "valid" | "warning" | "invalid";
    validationReason: string;
    uploadedAt: Date;
    storageDriver: string;
    uploadedById: string;
  }[];
  /**
   * Only under `applicationDetailRowSelect`. Absent on the list projection for
   * the same reason `analysisRuns` is: a page of filings has no custody panel,
   * so fetching a log nobody renders is waste.
   */
  fileEvents?: {
    id: string;
    kind: "uploaded" | "replaced" | "deleted";
    fileId: string | null;
    actorId: string;
    filename: string;
    sizeBytes: bigint | null;
    checksumSha256: string | null;
    previousFilename: string | null;
    previousSizeBytes: bigint | null;
    previousChecksumSha256: string | null;
    note: string | null;
    createdAt: Date;
    actor: { id: string; name: string; role: string } | null;
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
  /**
   * Only under `applicationDetailRowSelect`, and only the most recent entry —
   * absent on the list projection.
   *
   * Optional rather than nullable-for-now: the list projection genuinely does not
   * fetch it, which is a different thing from "this filing has no runs".
   */
  analysisRuns?: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed";
    errorMessage: string | null;
    startedAt: Date;
    completedAt: Date | null;
  }[];
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
export function serializeApplicationRow(
  row: ApplicationRowPayload,
  /**
   * Who is serializing, and whether they could change this filing's files at
   * all. Optional, and passed explicitly rather than inferred: the per-file
   * verdict also needs the row's own uploader, so the rule is "uploader, or
   * holds `editApplicationFiles`" and both halves have to meet here.
   *
   * `viewer.canEditFiles` is the caller's answer from `can(...)`, already
   * scoped to this filing — the same expression the route uses, so the button a
   * reviewer sees and the 403 they would get cannot drift apart.
   *
   * `viewer.canAddFiles` governs the "Add files" control and comes from
   * `canAddFilesToFiling`, a different and narrower rule (see lib/upload-access).
   */
  viewer?: { id: string; canEditFiles: boolean; canAddFiles?: boolean },
) {
  const totalRows = row.files.reduce((sum, file) => sum + file.rowCount, 0);
  // Accumulated as BigInt, then narrowed once at the end. Reducing with a `0`
  // seed would make this `number + bigint`, which is a type error rather than a
  // silent truncation — `rowCount` is a plain Int so it reduces in `number`.
  // `BigInt(0)` rather than the `0n` literal: the TS target is below ES2020.
  const totalBytes = row.files.reduce(
    (sum, file) => sum + file.sizeBytes,
    BigInt(0),
  );

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
        // Built here, not in the browser: the download path and the route that
        // authorizes it are then guaranteed to be the same one.
        //
        // Seeded fixtures hold metadata with no stored bytes, so they have
        // nothing to serve. Handing the client a URL it cannot use produces a
        // button that always fails, so the flag travels with the row instead.
        downloadable: file.storageDriver !== "seed",
        downloadUrl: `/api/applications/${row.id}/files/${file.id}/content`,
        sizeBytes: Number(file.sizeBytes),
        kind: file.kind,
        rowCount: file.rowCount,
        columnCount: file.columnCount,
        detectedColumns: file.detectedColumns,
        validationState: file.validationState,
        validationReason: file.validationReason,
        uploadedAt: file.uploadedAt.toISOString(),
        // Undefined without a viewer rather than `false`: on a projection that
        // never fetched the permission, "cannot tell" is the honest answer and is
        // not the same as "denied".
        editable: viewer
          ? viewer.canEditFiles || file.uploadedById === viewer.id
          : undefined,
      })),
      // Whether the "Add files" control should exist at all. Server-derived for
      // the same reason as the per-file `editable`: a client-side guess would
      // either offer a button that 403s or hide one that would have worked.
      // Undefined, not `false`, when no viewer context was supplied.
      canAddFiles: viewer?.canAddFiles,
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
      // Custody log for evidence changes. `editable` files are in the map above;
      // a `deleted` event points at a `fileId` that is intentionally no longer
      // resolvable, which is why the filename is denormalised onto the event.
      fileEvents: (row.fileEvents ?? []).map((event) => ({
        id: event.id,
        kind: event.kind,
        fileId: event.fileId,
        actorId: event.actorId,
        actorName: event.actor?.name,
        actorRole: event.actor?.role,
        filename: event.filename,
        sizeBytes: event.sizeBytes === null ? null : Number(event.sizeBytes),
        checksumSha256: event.checksumSha256,
        previousFilename: event.previousFilename,
        previousSizeBytes:
          event.previousSizeBytes === null
            ? null
            : Number(event.previousSizeBytes),
        previousChecksumSha256: event.previousChecksumSha256,
        createdAt: event.createdAt.toISOString(),
        note: event.note ?? undefined,
      })),
      reportId: row.report?.id,
      // `analysisRuns` is a one-element list only because Prisma cannot express
      // "the newest row" any other way; the panel wants the run itself. `?.` and
      // `?? null` rather than a default object, so "never analysed" stays
      // distinguishable from "analysed, and the run has since been trimmed".
      latestRun: (() => {
        const run = row.analysisRuns?.[0];
        if (!run) return null;
        return {
          runId: run.id,
          status: run.status,
          errorMessage: run.errorMessage ?? undefined,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt?.toISOString(),
        };
      })(),
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
