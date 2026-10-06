import "server-only";

export function formatBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} bytes`;
}

export function slugify(s: string): string {
  const slug = s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/-{2,}/g, "-").replace(/^[-.]+/, "").slice(-96).replace(/-+$/, "");
  return slug || "extraction";
}