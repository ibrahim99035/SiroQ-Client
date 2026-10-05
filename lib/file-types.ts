/**
 * The file-type policy, in one place.
 *
 * Deliberately free of `server-only` and of any browser API, because three
 * different layers need to agree on exactly which extensions are accepted and
 * what each one is called:
 *
 *  - the server's upload gate and intake inspection (`lib/uploads.ts`),
 *  - the storage layer, which serves a content type from the key
 *    (`lib/storage.ts`),
 *  - and the browser's extension gate and dropzone (`lib/files.ts`).
 *
 * Those used to be three independent lists. When they disagree the symptom is
 * silent and confusing: a file the UI happily stages is rejected by the server
 * with a generic "wrong file type", or worse, is accepted and then stored under
 * a guessed MIME type that makes it download as something it is not.
 */

export const SUPPORTED_EXTENSIONS = [
  // Dispensing ledgers: the formats the analysis service reads.
  ".xlsx",
  ".xls",
  ".csv",
  // Power BI.
  ".pbix",
  ".pbit",
  // Tableau.
  ".twb",
  ".twbx",
  ".tds",
  ".tdsx",
  ".hyper",
  // Raw data and documents, stored as supporting evidence.
  ".parquet",
  ".json",
  ".sql",
  ".pdf",
] as const;

/**
 * The formats held as evidence rather than analysed.
 *
 * A single `FileKind` bucket, not one value per format: the concrete format is
 * already on `ApplicationFile.originalName` and `mimeType`, so splitting the enum
 * would add a branch to every `kind ===` test without adding a distinction
 * anything could query.
 *
 * `.zip` is deliberately absent. It is a container we never open, so nothing
 * inside it would ever be size-checked, type-checked or scanned -- it would be a
 * way to store an arbitrary blob behind a name that implies we inspected it.
 */
export const ATTACHMENT_EXTENSIONS = [
  ".pbix",
  ".pbit",
  ".twb",
  ".twbx",
  ".tds",
  ".tdsx",
  ".hyper",
  ".parquet",
  ".json",
  ".sql",
  ".pdf",
] as const;

/** The kinds the analysis service is given. Everything else is evidence only. */
export const ANALYSABLE_KINDS = ["xlsx", "xls", "csv"] as const;

/**
 * Is this kind one the analysis service can read?
 *
 * Takes a `string` rather than the `FileKind` union so it can be applied to a
 * value straight off a database row without a cast at every call site.
 */
export function isAnalysableKind(kind: string): boolean {
  return (ANALYSABLE_KINDS as readonly string[]).includes(kind);
}

/**
 * Content type per extension.
 *
 * Used both when a slot is reserved (so the object is stored, signed and later
 * served under the right type) and when a download falls back to the key. The
 * fallback matters: the reserve route used to guess `text/csv` or the XLSX type
 * for anything that was not a CSV, which handed a Power BI project back to the
 * browser labelled as a spreadsheet.
 */
export const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".pbix": "application/vnd.ms-powerbi",
  ".pbit": "application/vnd.ms-powerbi",
  // Tableau workbook and datasource are plain XML.
  ".twb": "application/xml",
  ".tds": "application/xml",
  // The packaged forms are ZIP containers, and are treated as opaque bytes.
  ".twbx": "application/zip",
  ".tdsx": "application/zip",
  ".hyper": "application/octet-stream",
  ".parquet": "application/vnd.apache.parquet",
  ".json": "application/json",
  ".sql": "application/sql",
  ".pdf": "application/pdf",
};

export const OCTET_STREAM = "application/octet-stream";

/** Extension of a filename, lowercased. Empty when there is none. */
export function extensionOf(fileName: string): string {
  const index = fileName.toLowerCase().lastIndexOf(".");
  return index < 0 ? "" : fileName.slice(index).toLowerCase();
}

/** The content type for a filename or storage key, by its extension. */
export function contentTypeForName(name: string): string {
  return MIME_BY_EXTENSION[extensionOf(name)] ?? OCTET_STREAM;
}

/** A short, human label for a file, derived from its extension. */
export function kindLabelForName(name: string): string {
  const ext = extensionOf(name);
  if (!ext) return "file";
  return ATTACHMENT_EXTENSIONS.includes(ext as (typeof ATTACHMENT_EXTENSIONS)[number])
    ? ext.slice(1).toUpperCase()
    : ext.slice(1);
}
/**
 * The accepted extensions as one readable phrase, for error messages.
 *
 * Written here rather than at each call site because a hand-maintained list in
 * an error message is a list that goes stale: the message said "only .xlsx, .xls
 * or .csv" long after intake had started accepting thirteen extensions, so the
 * one place a rejected uploader was told what was allowed was the one place
 * that could not answer.
 */
export function humanExtensionList(extensions: readonly string[]): string {
  return extensions.join(", ");
}
