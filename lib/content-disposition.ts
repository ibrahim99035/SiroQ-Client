/**
 * Builds a `Content-Disposition` header for a file download.
 *
 * Header values must be ByteStrings (Latin-1). A raw UTF-8 filename is not one,
 * and assigning it throws before a single byte reaches the client:
 *
 *   TypeError: Cannot convert argument to a ByteString because the character
 *   at index 22 has a value of 1491 which is greater than 255
 *
 * That is not a cosmetic problem. It happens while the response is being
 * constructed, so it surfaces as an opaque 500 rather than a download. Real
 * filenames carry real scripts — `الاكثر والاقل مبيعا.xlsx`,
 * `דוח מגירה יומי.xlsx` — so this path is the normal case, not an edge case.
 *
 * RFC 6266 §4.3 solves this with two parameters: an ASCII `filename` for old
 * clients, plus `filename*` (RFC 5987) carrying the percent-encoded UTF-8 name
 * that every current browser prefers. Both are emitted so nothing regresses.
 */

/** Characters that would let a name break out of the quoted-string. */
const UNSAFE_IN_QUOTED = /["\\]/g;

/** Printable ASCII that is legal inside a header value. */
const NON_PRINTABLE_ASCII = /[^\x20-\x7e]/g;

const MAX_FALLBACK = 120;

/**
 * ASCII fallback for clients that ignore `filename*`.
 *
 * Non-ASCII characters collapse to `_` rather than being dropped, so
 * `الاكثر.xlsx` degrades to something like `_____.xlsx` instead of `.xlsx`,
 * which would hide the extension. The real name is always available in
 * `filename*`, so legibility here is a courtesy, not the source of truth.
 */
function asciiFallback(fileName: string): string {
  const cleaned = fileName
    .replace(NON_PRINTABLE_ASCII, "_")
    .replace(UNSAFE_IN_QUOTED, "")
    .slice(0, MAX_FALLBACK)
    .trim();
  return cleaned || "download";
}

/**
 * Percent-encodes a filename per RFC 5987.
 *
 * `encodeURIComponent` already leaves every attr-char alone except `'`, `(`, `)`
 * and `*`, which are not attr-chars, so those four are escaped by hand.
 */
function encodeExtended(fileName: string): string {
  return encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `attachment` disposition preserving the operator's original filename.
 *
 * The name is server-chosen: a client-supplied `download` attribute would
 * rename the file the operator actually uploaded, so the header is the only
 * thing that decides what lands on disk.
 */
export function contentDisposition(fileName: string, disposition = "attachment"): string {
  const name = fileName.trim() || "download";
  return `${disposition}; filename="${asciiFallback(name)}"; filename*=UTF-8''${encodeExtended(name)}`;
}