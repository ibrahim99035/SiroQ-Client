"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface ExtractorTable {
  headers: string[];
  rows: string[][];
}

export interface ExtractorRunView {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  tables: ExtractorTable[];
  csvUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export function ExtractorResult({
  run,
  csvUrl,
}: {
  run: ExtractorRunView;
  csvUrl: string | null;
}) {
  if (!run) return null;
  const tables = Array.isArray(run.tables) ? run.tables : [];
  return (
    <div className="mt-4 space-y-4">
      {tables.map((t: ExtractorTable, i: number) => {
        const headers = t.headers || [];
        const rows = (t.rows || []).slice(0, 8);
        return (
          <div key={i} className="overflow-auto rounded-card border border-hairline bg-paper-raised p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs text-muted">Table {i + 1} · {rows.length} preview rows · {headers.length} columns</div>
              {csvUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`${csvUrl}?index=${i}`} download>Download CSV</a>
                </Button>
              ) : null}
            </div>
            <table className="min-w-full text-xs">
              <thead>
                <tr>
                  {headers.map((h: string, j: number) => (
                    <th key={j} className="border-b px-2 py-1 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r: string[], k: number) => (
                  <tr key={k}>
                    {r.map((c: string, j: number) => (
                      <td key={j} className="border-b px-2 py-1">{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      {csvUrl && tables.length > 1 ? (
        <Button variant="outline" size="sm" asChild>
          <a href={csvUrl} download>Download all tables</a>
        </Button>
      ) : null}
    </div>
  );
}
