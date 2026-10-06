import "server-only";

/**
 * RFC 4180-aware CSV field splitter.
 * Handles quoted fields, escaped quotes ("") and embedded commas/newlines.
 */
export function splitCsvLine(line: string): string[] {
  const result: string[] = [];
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
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export function escapeCsvField(field: string): string {
  const needsQuotes = /[",\n\r]/.test(field);
  if (!needsQuotes) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

export function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    if (d === "\t" && line.includes("    ")) continue;
    const count = (line.match(new RegExp(`\\${d}`, "g")) || []).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return bestCount > 0 ? best : ",";
}
