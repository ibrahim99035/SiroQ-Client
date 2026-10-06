"use client";

import type { UploadCandidate } from "@/lib/files";

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Expected a data URL"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function stageFileForUpload(file: File): Promise<UploadCandidate> {
  const { validateUpload } = await import("@/lib/files");
  return validateUpload(file.name, file.size, file);
}

export async function completeStagedUpload(uploadId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/uploads/${uploadId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`complete upload failed: ${res.status}`);
  return res.json();
}
