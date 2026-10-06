import "server-only";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];
const HTML_SIGS = ["<!doctype html", "<html", "<?xml", "<!DOCTYPE"];

export function sniffMimeFromBytes(bytes: Buffer): string | null {
  if (bytes.length >= 4 && PDF_MAGIC.every((b, i) => bytes[i] === b)) return "application/pdf";
  const head = bytes.subarray(0, Math.min(1024, bytes.length)).toString("utf8").toLowerCase();
  for (const s of HTML_SIGS) if (head.startsWith(s.toLowerCase()) || head.includes(s.toLowerCase())) return "text/html";
  return null;
}
