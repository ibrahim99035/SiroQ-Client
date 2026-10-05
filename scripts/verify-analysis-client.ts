/**
 * Analysis-service client regression suite.
 *
 * Covers the four things that are easy to break silently and impossible to spot
 * by reading the call site:
 *
 *   1. **The multipart body is not labelled JSON.** `request` defaults to
 *      `Content-Type: application/json`, and a `FormData` body sent under that
 *      header reaches the service with no boundary, so every local-driver upload
 *      fails as an unreadable 422 that looks like a schema problem.
 *
 *   2. **Every request is authenticated.** The API key is the only thing standing
 *      between the filing system and an open analysis service.
 *
 *   3. **Errors carry the service's own reason.** `detail` is a string for the
 *      service's HTTPException and a list for a pydantic validation failure; the
 *      two need different handling or the message shown to a user is either
 *      empty or literally "[object Object]".
 *
 *   4. **The dedupe lookup only counts fetched files.** A file the service has
 *      registered but not yet downloaded has no digest, and treating it as
 *      known would strand a retry that needs a fresh URL for it.
 *
 * Uses a real loopback HTTP server rather than a fetch mock, because the
 * behaviour under test *is* the bytes and headers `fetch` puts on the wire —
 * a mock would assert the code against itself.
 *
 * Usage:
 *   npm run verify:analysis
 *
 * Needs no database and no running Next server: `ANALYSIS_SERVICE_BASE_URL` is
 * pointed at the stub for the duration of the run.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  AnalysisServiceError,
  analysisServiceEnabled,
  fetchStoredDigests,
  registerFilesByUpload,
  registerFilesByUrl,
} from "../lib/analysis-client";

const API_KEY = "verify-key";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log(`        ${JSON.stringify(detail)}`);
  }
}

interface Recorded {
  method: string;
  url: string;
  contentType: string | undefined;
  apiKey: string | undefined;
  body: Buffer;
}

type Responder = (req: Recorded) => { status: number; body: unknown };

/** A stub service that records what it was sent and replies with `responder`. */
function startStub(responder: Responder) {
  const received: Recorded[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const record: Recorded = {
        method: req.method ?? "",
        url: req.url ?? "",
        // Node types a header as `string | string[]`; a repeated header is
        // never something this client sends, so the first value is the one.
        contentType: first(req.headers["content-type"]),
        apiKey: first(req.headers["x-api-key"]),
        body: Buffer.concat(chunks),
      };
      received.push(record);
      const { status, body } = responder(record);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });

  return new Promise<{ url: string; received: Recorded[] }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}/api/v1`, received });
    });
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The single request a stub recorded, failing loudly if there was not exactly one. */
function only(received: Recorded[]): Recorded {
  if (received.length !== 1) {
    throw new Error(`expected exactly one request, got ${received.length}`);
  }
  return received[0]!;
}

async function main() {
  process.env.ANALYSIS_SERVICE_ENABLED = "true";
  process.env.ANALYSIS_SERVICE_API_KEY = API_KEY;

  // ---------------------------------------------------------------------
  // 1. A FormData body must keep the multipart header fetch derives
  // ---------------------------------------------------------------------
  {
    const stub = await startStub(() => ({
      status: 201,
      body: { application_id: "app-1", registered: [{ file_id: "f1" }] },
    }));
    process.env.ANALYSIS_SERVICE_BASE_URL = stub.url;

    await registerFilesByUpload("app-1", [
      { originalFilename: "sales.csv", bytes: Buffer.from("region,total\n"), mimeType: "text/csv" },
    ]);

    const sent = only(stub.received);
    check(
      "multipart upload is not labelled application/json",
      sent.contentType?.startsWith("multipart/form-data") === true,
      sent.contentType,
    );
    check(
      "multipart upload carries a boundary",
      (sent.contentType ?? "").includes("boundary="),
      sent.contentType,
    );
    check("multipart body is a real multipart payload", sent.body.includes("sales.csv"));
    check(
      "multipart upload uses the defer flag",
      sent.url.includes("defer=true"),
      sent.url,
    );
    stub.received.length = 0;

    // 2. A JSON body still gets the JSON header, and both are authenticated.
    await registerFilesByUrl("app-1", [
      { original_filename: "sales.csv", source_url: "https://example.test/sales.csv" },
    ]);
    const jsonSent = only(stub.received);
    check(
      "by-url registration is sent as JSON",
      jsonSent.contentType === "application/json",
      jsonSent.contentType,
    );
    check(
      "by-url registration carries the API key",
      jsonSent.apiKey === API_KEY,
      jsonSent.apiKey,
    );
    check(
      "every request carries the API key",
      stub.received.every((r) => r.apiKey === API_KEY),
    );
  }

  // ---------------------------------------------------------------------
  // 3. The dedupe lookup reports only files the service has actually fetched
  // ---------------------------------------------------------------------
  {
    const stub = await startStub(() => ({
      status: 200,
      body: {
        id: "app-1",
        files: [
          // Fetched: the service hashed the bytes it stored.
          { original_filename: "a.csv", sha256: "a".repeat(64) },
          // Registered from a URL but not yet downloaded: no digest yet.
          { original_filename: "b.csv", sha256: null },
          { original_filename: "c.csv", sha256: null },
        ],
      },
    }));
    process.env.ANALYSIS_SERVICE_BASE_URL = stub.url;

    const digests = await fetchStoredDigests("app-1");
    check("fetched file is reported", digests.has("a".repeat(64)));
    check(
      "unfetched files are not reported as known",
      digests.size === 1,
      [...digests],
    );

    // An application with no files must yield an empty set, not a throw.
    const empty = await startStub(() => ({ status: 200, body: { id: "app-2", files: [] } }));
    process.env.ANALYSIS_SERVICE_BASE_URL = empty.url;
    const none = await fetchStoredDigests("app-2");
    check("empty application yields an empty set", none.size === 0);
  }

  // ---------------------------------------------------------------------
  // 4. Failure modes surface something a user can read
  // ---------------------------------------------------------------------
  {
    const httpError = await startStub(() => ({
      status: 400,
      body: { detail: "No files provided" },
    }));
    process.env.ANALYSIS_SERVICE_BASE_URL = httpError.url;
    const httpResult = await capture(() => fetchStoredDigests("app-1"));
    check(
      "a service HTTPException detail is passed through",
      httpResult.error?.message === "No files provided",
      httpResult.error?.message,
    );
    check(
      "a 4xx keeps its status so the route can treat it as the caller's fault",
      httpResult.error?.status === 400,
      httpResult.error?.status,
    );

    const validation = await startStub(() => ({
      status: 422,
      body: { detail: [{ msg: "source_url: field required", loc: ["body", "files"] }] },
    }));
    process.env.ANALYSIS_SERVICE_BASE_URL = validation.url;
    const validationResult = await capture(() => fetchStoredDigests("app-1"));
    check(
      "a pydantic validation detail is unwrapped to its first message",
      validationResult.error?.message === "source_url: field required",
      validationResult.error?.message,
    );

    const garbage = await startStub(() => ({ status: 500, body: { oops: true } }));
    process.env.ANALYSIS_SERVICE_BASE_URL = garbage.url;
    const garbageResult = await capture(() => fetchStoredDigests("app-1"));
    check(
      "an unrecognised error body still yields a readable message",
      (garbageResult.error?.message ?? "").includes("500"),
      garbageResult.error?.message,
    );

    // Nothing listening: an outage is ours to report, not the filing's fault.
    process.env.ANALYSIS_SERVICE_BASE_URL = "http://127.0.0.1:1/api/v1";
    process.env.ANALYSIS_SERVICE_TIMEOUT_MS = "2000";
    const downResult = await capture(() => fetchStoredDigests("app-1"));
    check(
      "an unreachable service is a 503, not a crash",
      downResult.error?.status === 503,
      downResult.error?.status,
    );
    check(
      "an unreachable service explains itself",
      (downResult.error?.message ?? "").includes("could not be reached"),
      downResult.error?.message,
    );
  }

  // ---------------------------------------------------------------------
  // 5. Enabled but unconfigured reads as off, so the UI hides the button
  // ---------------------------------------------------------------------
  {
    process.env.ANALYSIS_SERVICE_ENABLED = "true";
    process.env.ANALYSIS_SERVICE_API_KEY = "";
    check("enabled without a key reads as unavailable", analysisServiceEnabled() === false);

    process.env.ANALYSIS_SERVICE_ENABLED = "false";
    process.env.ANALYSIS_SERVICE_API_KEY = API_KEY;
    check("disabled with a key reads as unavailable", analysisServiceEnabled() === false);

    process.env.ANALYSIS_SERVICE_ENABLED = "TRUE";
    check("the flag is case-insensitive", analysisServiceEnabled() === true);

    delete process.env.ANALYSIS_SERVICE_ENABLED;
    check("unset reads as unavailable", analysisServiceEnabled() === false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

/** Runs `fn`, reporting the typed service error it raised rather than throwing. */
async function capture(
  fn: () => Promise<unknown>,
): Promise<{ error?: AnalysisServiceError }> {
  try {
    await fn();
    return {};
  } catch (error) {
    if (error instanceof AnalysisServiceError) return { error };
    throw error;
  }
}

void main();
