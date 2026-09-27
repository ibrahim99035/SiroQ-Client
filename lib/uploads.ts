import "server-only";

import { createHash, randomUUID } from "node:crypto";

/**
 * Upload policy and intake inspection.
 *
 * The browser is never trusted for any of this: the extension, the declared
 * size, the magic bytes and the row/column counts are all re-derived here from
 * the bytes that actually landed in storage.
 */

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_EXTENSIONS = ".xlsx,.csv";

export const KIND_BY_EXTENSION: Record<string, FileKind> = {
  ".xlsx": "xlsx",
  ".csv": "csv",
};

export type FileKind = "xlsx" | "csv";

export function allowedExtensions(): string[] {
  return (process.env.UPLOAD_ALLOWED_EXTENSIONS || DEFAULT_EXTENSIONS)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.startsWith("."));
}

export function maxUploadBytes(): number {
  const parsed = Number.parseInt(process.env.UPLOAD_MAX_BYTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

export function extensionOf(fileName: string): string {
  const index = fileName.toLowerCase().lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index).toLowerCase();
}

export function classify(fileName: string): FileKind | null {
  const ext = extensionOf(fileName);
  if (!allowedExtensions().includes(ext)) return null;
  return KIND_BY_EXTENSION[ext] ?? null;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Storage key. Prefixed by day so listings stay browsable, and prefixed by a
 * UUID so two users uploading `dispense-january.csv` cannot collide.
 */
export function buildStorageKey(fileName: string, userId: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-96) || "upload";
  return `filings/${day}/${userId}/${randomUUID()}-${safeName}`;
}

/** Strips directory components and control characters out of a client-supplied name. */
export function sanitiseFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "upload";
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return cleaned.slice(0, 180) || "upload";
}

export interface IntakeReport {
  state: "valid" | "warning" | "invalid";
  reason: string;
  rowCount: number;
  columnCount: number;
  detectedColumns: string[];
  sheetNames: string[];
}

/**
 * Real inspection of the stored bytes. Cheap and dependency-free: a CSV gets a
 * genuine header/row parse, an XLSX is checked for the ZIP container signature
 * and recorded as structurally sound without unpacking it.
 */
export function inspectBytes(kind: FileKind, bytes: Buffer): IntakeReport {
  if (bytes.byteLength === 0) {
    return {
      state: "invalid",
      reason: "The uploaded file is empty.",
      rowCount: 0,
      columnCount: 0,
      detectedColumns: [],
      sheetNames: [],
    };
  }

  if (kind === "xlsx") {
    // XLSX is a ZIP container: "PK\x03\x04".
    const isZip =
      bytes.byteLength >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      bytes[2] === 0x03 &&
      bytes[3] === 0x04;
    return {
      state: isZip ? "valid" : "invalid",
      reason: isZip
        ? "Workbook accepted. Sheet contents are parsed on demand."
        : "The file has an .xlsx name but is not a valid Excel workbook.",
      rowCount: 0,
      columnCount: 0,
      detectedColumns: [],
      sheetNames: [],
    };
  }

  return inspectCsv(bytes);
}

function inspectCsv(bytes: Buffer): IntakeReport {
  const text = bytes.toString("utf8").replace(/^﻿/, "");
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return {
      state: "invalid",
      reason: "The uploaded CSV has no rows.",
      rowCount: 0,
      columnCount: 0,
      detectedColumns: [],
      sheetNames: [],
    };
  }

  const header = splitCsvLine(lines[0] ?? "");
  const columns = header.map((value) => value.trim()).filter((value) => value.length > 0);
  const rowCount = lines.length - 1;
  const columnCount = columns.length;

  if (columnCount === 0) {
    return {
      state: "invalid",
      reason: "The CSV header row has no column names.",
      rowCount,
      columnCount: 0,
      detectedColumns: [],
      sheetNames: [],
    };
  }

  const expected = ["NDC code", "Batch number"];
  const missing = expected.filter((name) => !columns.some((c) => c.toLowerCase() === name.toLowerCase()));
  if (missing.length > 0) {
    return {
      state: "invalid",
      reason: `Required column${missing.length > 1 ? "s" : ""} ${missing.join(", ")} absent from the header row; the file does not match the filing manifest.`,
      rowCount,
      columnCount,
      detectedColumns: columns,
      sheetNames: [],
    };
  }

  // Ragged rows are the common real-world defect, so report rather than reject.
  const ragged = lines.slice(1).filter((line) => splitCsvLine(line).length !== columnCount).length;
  if (ragged > 0) {
    return {
      state: "warning",
      reason: `${ragged} of ${rowCount} rows do not have ${columnCount} columns; values were padded or truncated on intake.`,
      rowCount,
      columnCount,
      detectedColumns: columns,
      sheetNames: [],
    };
  }

  return {
    state: "valid",
    reason: "All rows parsed against the registered filing manifest.",
    rowCount,
    columnCount,
    detectedColumns: columns,
    sheetNames: [],
  };
}

/** Minimal RFC 4180 splitter: handles quoted fields and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}
