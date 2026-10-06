"use client";

import * as React from "react";
import { useCurrentUser } from "@/components/session-provider";
import { can } from "@/lib/permissions";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";
import { ExtractorDropzone } from "@/components/extractor-dropzone";
import { ExtractorResult, type ExtractorRunView, type ExtractorTable } from "@/components/extractor-result";

type Status = {
  ok: boolean;
  enabled: boolean;
  model: string;
  keyCount: number;
  allowUrl: boolean;
};

type RunPollResponse = {
  ok: true;
  run: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed";
    tables?: ExtractorTable[];
    errorCode?: string | null;
    errorMessage?: string | null;
  };
  csvUrl?: string | null;
};

type RunState = ExtractorRunView | null;

export default function ExtractorPage() {
  const user = useCurrentUser();
  const allowed = React.useMemo(() => (user ? can(user, "useExtractor") : false), [user]);
  const [status, setStatus] = React.useState<Status | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [runState, setRunState] = React.useState<RunState>(null);
  const [error, setError] = React.useState<string | null>(null);
  const pollRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!allowed) return;
    void (async () => {
      try {
        const res = await apiFetch<Status>("/api/extractor/status");
        if (res) setStatus(res);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load status");
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed]);

  const clearPoll = () => {
    if (pollRef.current !== null) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const pollRun = (id: string) => {
    clearPoll();
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await apiFetch<RunPollResponse>(`/api/extractor/runs/${id}`);
        if (res && res.run) {
          const r = res.run;
          setRunState({
            runId: r.id,
            status: r.status,
            tables: Array.isArray(r.tables) ? r.tables : [],
            csvUrl: res.csvUrl || null,
            errorCode: r.errorCode || null,
            errorMessage: r.errorMessage || null,
          });
          if (r.status === "succeeded" || r.status === "failed") {
            clearPoll();
            setBusy(false);
          }
        }
      } catch {}
    }, 1500);
  };

  const start = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setRunState(null);
    try {
      const reserved = await apiFetch<{
        ok: true;
        uploadId: string;
        mode: "direct" | "presigned";
        url?: string;
        headers?: Record<string, string>;
        completeUrl: string;
      }>("/api/uploads", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          declaredBytes: file.size,
          mimeType: file.type || undefined,
        }),

      });
      if (!reserved) throw new Error("Failed to reserve upload");
      const r = reserved;
      const uploadId = r.uploadId;
      if (r.mode === "presigned" && r.url) {
        await fetch(r.url, { method: "PUT", headers: r.headers ?? {}, body: file });
      }
      await fetch(r.completeUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const res = await apiFetch<{ ok: boolean; runId?: string }>("/api/extractor", {
        method: "POST",
        body: { uploadId },
      });
      if (!res || !res.ok) throw new Error("Failed to start");
      const runId = res.runId;
      if (runId) pollRun(runId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to start extraction");
      setBusy(false);
    }
  };

  React.useEffect(() => () => clearPoll(), []);

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <h1 className="text-2xl font-semibold">Extractor</h1>
        <p className="text-sm text-muted">Permission denied.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Extractor</h1>
        <p className="text-sm text-muted">Extract tables from PDFs and HTML files using Gemini.</p>
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="space-y-3">
          {!status?.enabled ? (
            <div className="rounded-card border border-hairline bg-paper-raised p-3 text-sm text-muted">
              Extractor not configured.
            </div>
          ) : null}
          <ExtractorDropzone onFile={setFile} />
          <div className="flex gap-2">
            <Button onClick={start} disabled={busy || !file || status?.enabled === false}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Working...
                </>
              ) : (
                "Extract tables"
              )}
            </Button>
            {runState ? (
              <div className="self-center text-xs text-muted">
                Status: <span className="font-medium capitalize">{runState.status}</span>
              </div>
            ) : null}
          </div>
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
          {runState?.status === "failed" ? (
            <div className="rounded-card border border-hairline bg-paper-raised p-3 text-sm text-red-600">
              {runState.errorMessage || runState.errorCode || "Extraction failed"}
            </div>
          ) : null}
          {runState?.status === "succeeded" && runState.tables.length > 0 ? (
            <ExtractorResult run={runState} csvUrl={runState.csvUrl} />
          ) : null}
        </div>
      )}
    </div>
  );
}
