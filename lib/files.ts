import type { FileKind, FileValidationState } from "./types";

export const SUPPORTED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

export interface UploadCandidate {
  fileName: string;
  sizeBytes: number;
  kind: FileKind | null;
  state: FileValidationState;
  reason: string;
  rowCount: number;
  columnCount: number;
  detectedColumns: string[];
  /**
   * The real handle from the file input or drop event.
   *
   * Everything else on this object is *derived metadata* — including the row and
   * column counts, which `simulateFileValidation` invents from the file name.
   * Those numbers are shown before the user submits, and they are not true. The
   * server re-derives size, checksum and schema results from the stored bytes in
   * `POST /api/uploads/[id]/complete`; only `file` is something the browser
   * alone can supply, so it is the one field worth carrying through.
   *
   * Optional because the seeded fixtures describe files that do not exist on the
   * user's disk.
   */
  file?: File;
}

function hashStr(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index < 0) return "";
  return name.slice(index).toLowerCase();
}

/**
 * Extension gate — client-side only, before any simulated content pass.
 */
export function classifyFileKind(fileName: string): FileKind | null {
  const ext = extensionOf(fileName);
  if (ext === ".xlsx") return "xlsx";
  if (ext === ".xls") return "xls";
  if (ext === ".csv") return "csv";
  return null;
}

const COL_DISPENSE = [
  "NDC code",
  "Batch number",
  "Quantity dispensed",
  "Dispense date",
  "Rx number",
];
const COL_PATIENT = [
  "NDC code",
  "Batch number",
  "Quantity dispensed",
  "Dispense date",
  "Rx number",
  "Patient ID",
];
const COL_COMPOUND = [
  "NDC code",
  "Batch number",
  "Quantity dispensed",
  "Dispense date",
  "Dosage form",
  "Prescriber DEA",
];

const REASON_BAD_EXT =
  "Only .xlsx, .xls or .csv files are accepted. The file was held back and not staged for review.";
const REASON_BAD_DATE =
  "Dispense date out of range at row {N}; value falls outside the reporting window. Correct the source and re-stage.";
const REASON_MISSING_COL =
  'Required column "NDC code" is absent from the header row; file does not match the filing manifest.';
const REASON_MISSING_BATCH =
  "{N} rows carry a missing Batch number value; schema-level completeness at risk.";
const REASON_DATE_FORMAT =
  "Date format inconsistent at row {N}; normalized on intake.";

/**
 * Simulated content validation pass. Deterministic per filename so reaction
 * is stable across re-stages.
 */
export function simulateFileValidation(fileName: string, sizeBytes: number): Omit<UploadCandidate, "kind"> {
  const h = hashStr(fileName.toLowerCase());
  const baseRows = Math.max(8, Math.round(sizeBytes / 720));
  const rows = baseRows + (h % 17);
  const pickColumns = (set: string[]): string[] => {
    const count = 5 + (h % (set.length - 4 > 0 ? 3 : 1));
    return set.slice(0, Math.min(count, set.length));
  };

  const lower = fileName.toLowerCase();
  const columns = lower.includes("compound")
    ? pickColumns(COL_COMPOUND)
    : lower.includes("patient")
      ? pickColumns(COL_PATIENT)
      : pickColumns(COL_DISPENSE);

  const n = (offset: number) => Math.max(4, Math.round(rows * (0.12 + ((h >> offset) % 6) / 100)));

  if (lower.includes("backdate") || lower.includes("2023")) {
    return {
      fileName,
      sizeBytes,
      state: "invalid",
      reason: REASON_BAD_DATE.replace("{N}", String(n(3))),
      rowCount: rows,
      columnCount: columns.length,
      detectedColumns: columns,
    };
  }
  if (lower.includes("schema") || lower.includes("incomplete") || lower.includes("missing")) {
    return {
      fileName,
      sizeBytes,
      state: "invalid",
      reason: REASON_MISSING_COL,
      rowCount: rows,
      columnCount: columns.length,
      detectedColumns: columns,
    };
  }
  if (
    (lower.includes("opioid") || lower.includes("controlled") || lower.includes("schedule")) &&
    h % 2 === 0
  ) {
    return {
      fileName,
      sizeBytes,
      state: "warning",
      reason: REASON_MISSING_BATCH.replace("{N}", n(5).toLocaleString("en-US")),
      rowCount: rows,
      columnCount: columns.length,
      detectedColumns: columns,
    };
  }
  if (lower.includes("week") && h % 3 === 0) {
    return {
      fileName,
      sizeBytes,
      state: "warning",
      reason: REASON_DATE_FORMAT.replace("{N}", String(n(7))),
      rowCount: rows,
      columnCount: columns.length,
      detectedColumns: columns,
    };
  }
  return {
    fileName,
    sizeBytes,
    state: "valid",
    reason: "All rows passed schema checks against the registered filing manifest.",
    rowCount: rows,
    columnCount: columns.length,
    detectedColumns: columns,
  };
}

export function validateUpload(
  fileName: string,
  sizeBytes: number,
  file?: File,
): UploadCandidate {
  const kind = classifyFileKind(fileName);
  if (!kind) {
    return {
      fileName,
      sizeBytes,
      kind: null,
      state: "invalid",
      reason: REASON_BAD_EXT,
      rowCount: 0,
      columnCount: 0,
      detectedColumns: [],
      file,
    };
  }
  return { ...simulateFileValidation(fileName, sizeBytes), kind, file };
}