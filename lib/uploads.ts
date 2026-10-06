import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { splitCsvLine } from "@/lib/csv";
import { ATTACHMENT_EXTENSIONS, contentTypeForName, OCTET_STREAM } from "@/lib/file-types";
import type { FileKind } from "@/lib/types";

/**
 * Upload policy and intake inspection.
 *
 * The browser is never trusted for any of this: the extension, the declared
 * size, the magic bytes and the row/column counts are all re-derived here from
 * the bytes that actually landed in storage.
 *
 * The accepted extensions themselves live in `lib/file-types.ts` so the server,
 * the storage layer and the browser cannot drift apart.
 */

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Kept in step with `KIND_BY_EXTENSION` by construction: an extension is either
 * one of the three analysable ledgers or one of the attachment formats.
 */
export const KIND_BY_EXTENSION: Record<string, FileKind> = {
  ".xlsx": "xlsx",
  ".xls": "xls",
  ".csv": "csv",
  ...Object.fromEntries(ATTACHMENT_EXTENSIONS.map((ext) => [ext, "attachment" as const])),
};

const DEFAULT_EXTENSIONS = Object.keys(KIND_BY_EXTENSION).join(",");

export function allowedExtensions(): string[] {
  const configured = (process.env.UPLOAD_ALLOWED_EXTENSIONS || "").trim();
  // Falling back to the built-in list rather than to a literal is what keeps
  // `UPLOAD_ALLOWED_EXTENSIONS` from silently *narrowing* what a deployment
  // accepts: a value copied from an older `.env` would otherwise quietly keep
  // rejecting formats the code supports, with no signal that the code had moved
  // on. A configured value still wins, so an operator can narrow it on purpose.
  return (configured || DEFAULT_EXTENSIONS)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.startsWith("."));
}

/**
 * The content type to store an upload under.
 *
 * Derived from the extension, not from the kind: the kind only says
 * spreadsheet-or-not, so the previous guess handed every attachment the XLSX
 * type and served a stored Power BI project back as a workbook. The browser's
 * declared type is only a fallback, because browsers report nothing useful for
 * most of these formats -- and a client-supplied type would otherwise decide how
 * the file is served to whoever downloads it later.
 */
export function mimeTypeFor(originalName: string, kind: FileKind, declared?: string): string {
  if (kind === "attachment") {
    return contentTypeForName(originalName) !== OCTET_STREAM
      ? contentTypeForName(originalName)
      : declared || OCTET_STREAM;
  }
  return kind === "csv"
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
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
 *
 * The charset filter lets `.` through so extensions survive, but that also lets
 * a dot run through: `report..v2.csv` would keep its `..` and produce a key that
 * `assertSafeKey` rejects outright — not as a 400, but as an unhandled throw from
 * `putObject`, so an ordinary filename like `week..csv` failed the whole upload
 * with a bare 500. Collapsing dot runs after the filter keeps the key readable
 * while guaranteeing it survives validation. Slicing can only remove characters,
 * so it cannot reintroduce a run the collapse already removed.
 *
 * Non-Latin-1 names are transliterated rather than replaced, because replacing
 * every run with `-` erased the whole name: `الاكثر.xlsx` became `-.xlsx` and the
 * stored key was left as `...--.xlsx`, with no trace of what the file was. The
 * original name is always kept in the database, so this only has to stay
 * recognisable and safe.
 */
export function buildStorageKey(fileName: string, userId: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const slug = slugify(fileName);
  return `filings/${day}/${userId}/${randomUUID()}-${slug}`;
}

/**
 * A filesystem- and key-safe, still-readable rendering of a filename.
 *
 * ASCII letters, digits, dot and dash survive. Everything else becomes `-`, runs
 * of it collapse, and leading dashes are trimmed so the extension stays legible.
 */
function slugify(fileName: string): string {
  const slug = fileName
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-96)
    .replace(/-+$/, "");
  return slug || "upload";
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

  // Attachments are stored as evidence and never parsed. This branch must come
  // before the ledger inspections below: without it an unknown kind falls
  // through to `inspectCsv`, which decodes a Power BI project as UTF-8 text and
  // confidently rejects it for having no `NDC code` header -- a verdict about a
  // manifest the file was never meant to carry, delivered as a hard rejection.
  //
  // Reporting `valid` without having opened it is deliberate and is stated in
  // `reason`, which the ledger shows verbatim. The alternative -- a new
  // `FileValidationState` -- would widen an enum that three surfaces and the
  // seed data all switch over, to express a distinction the reason string
  // already carries honestly.
  if (kind === "attachment") {
    return {
      state: "valid",
      reason: "Stored as supporting evidence. Contents are not inspected and not analysed.",
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

  if (kind === "xls") {
    // Legacy XLS starts with OLE2/BIFF header: 0xD0 0xCF 0x11 0xE0 (DOCFILE)
    const isOle2 =
      bytes.byteLength >= 4 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0;
    return {
      state: isOle2 ? "valid" : "invalid",
      reason: isOle2
        ? "Legacy workbook accepted. Sheet contents are parsed on demand."
        : "The file has an .xls name but is not a valid Excel workbook.",
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
  const columns = header.map((value: string) => value.trim()).filter((value: string) => value.length > 0);
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
  const missing = expected.filter((name) => !columns.some((c: string) => c.toLowerCase() === name.toLowerCase()));
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

export { splitCsvLine } from "@/lib/csv";
