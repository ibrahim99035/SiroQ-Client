import "server-only";

import { detectDelimiter, escapeCsvField, splitCsvLine } from "@/lib/csv";
import { separatorPattern, TABLE_SEPARATOR } from "./prompt";

export interface TableRow {
  values: string[];
}

export interface NormalisedTable {
  headers: string[];
  rows: string[][];
  headerInferred: boolean;
  raggedRows: number;
}

export interface SplitTablesResult {
  blocks: string[];
  trailingProse: boolean;
}

export function splitTables(text: string): SplitTablesResult {
  let s = text;
  s = s.replace(/^\s*```[\s\S]*?```/gm, (m) => {
    if (m.includes(TABLE_SEPARATOR)) return m;
    return "";
  });
  const fenceStart = s.match(/^\s*```/m);
  const fenceEnd = s.match(/```/m);
  if (fenceStart && !fenceEnd) s = s.replace(/^\s*```[^\n]*\n?/m, "");
  s = s.replace(/\n```$/m, "");

  const pattern = separatorPattern();
  const parts = s.split(pattern);
  const blocks = parts
    .map((p) => p.replace(/^\n+/, "").replace(/\n+$/, ""))
    .filter((p) => p.trim().length > 0);

  let trailingProse = false;
  if (blocks.length > 0) {
    const last = parts[parts.length - 1];
    if (last && last.trim().length > 0 && parts.length >= blocks.length) {
      const trimmed = last.trim();
      if (!(trimmed === "NO_TABLE_FOUND" || trimmed === "INPUT_UNREADABLE")) {
        trailingProse = /[A-Za-z0-9]/.test(trimmed);
      }
    }
  } else {
    const trimmed = s.trim();
    trailingProse = trimmed.length > 0 && !(trimmed === "NO_TABLE_FOUND" || trimmed === "INPUT_UNREADABLE");
  }
  return { blocks, trailingProse };
}

function isLikelyDataRow(row: string[], headerCount: number): boolean {
  if (headerCount === 0) return true;
  if (row.length < Math.max(1, Math.floor(headerCount * 0.5))) return false;
  const nonEmpty = row.filter((c) => c.trim().length > 0).length;
  return nonEmpty >= Math.max(1, Math.floor(headerCount * 0.5));
}

export function normaliseTable(block: string): NormalisedTable {
  const lines = block
    .split(/\r\n|\n|\r/)
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [], headerInferred: false, raggedRows: 0 };
  }
  const firstLine = lines[0] || "";
  const delim = detectDelimiter(firstLine) || ",";
  const split = (l: string): string[] => {
    if (delim === ",") return splitCsvLine(l);
    const d = delim || ",";
    const parts = l.split(new RegExp(`\\${d === "\t" ? "\t" : d}`, "g"));
    return parts.map((p) => p.trim());
  };
  const first = split(firstLine);
  let headers: string[] = [];
  let dataStart = 1;
  let headerInferred = false;
  if (isLikelyDataRow(first, first.length)) {
    headers = first.map((_, i) => `col_${i + 1}`);
    headerInferred = true;
    dataStart = 0;
  } else {
    headers = first.map((v) => v.replace(/\s+/g, " ").trim());
    dataStart = 1;
  }
  const rows: string[][] = [];
  let raggedRows = 0;
  for (let i = dataStart; i < lines.length; i += 1) {
    const parts = split(lines[i] || "");
    if (parts.length === 0) continue;
    if (parts.length !== headers.length) raggedRows += 1;
    while (parts.length < headers.length) parts.push("");
    while (parts.length > headers.length) parts.pop();
    rows.push(parts.map((p) => p.replace(/\s+/g, " ").trim()));
  }
  return { headers, rows, headerInferred, raggedRows };
}

export function buildCsv(tables: NormalisedTable[], mode: "separate" | "concat" = "separate"): string {
  const lines: string[] = [];
  const useBOM = (process.env.EXTRACTOR_CSV_BOM || "1") !== "0";
  const bom = useBOM ? "\ufeff" : "";
  if (tables.length === 0) return bom;
  const emitTable = (t: NormalisedTable) => {
    lines.push(t.headers.map((h) => escapeCsvField(h)).join(","));
    for (const r of t.rows) lines.push(r.map((c) => escapeCsvField(c)).join(","));
  };
  if (tables.length === 1 || mode === "separate") {
    for (let i = 0; i < tables.length; i += 1) {
      if (i > 0) lines.push(TABLE_SEPARATOR);
      const t = tables[i]; if (t) emitTable(t);
    }
  } else {
    for (let i = 0; i < tables.length; i += 1) {
      const t = tables[i]; if (t) emitTable(t);
      if (i < tables.length - 1) lines.push("");
    }
  }
  return bom + lines.join("\n");
}
