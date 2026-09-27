import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for uploaded filings (.xlsx / .csv).
 *
 * Two drivers, selected by STORAGE_DRIVER:
 *
 *   "neon"  — Neon Object Storage. S3-compatible and branch-scoped, so a
 *             preview branch gets its own namespace and uploads there cannot
 *             touch production objects. Only available on projects in
 *             AWS us-east-2.
 *   "local" — writes under STORAGE_LOCAL_ROOT and streams back through a route
 *             handler. Used for offline development and for running the app on
 *             a single host where a bucket is not available.
 *
 * No credential ever reaches the browser: the upload path hands out a
 * presigned URL scoped to a single key, and reads are proxied through an
 * authenticated route.
 */

export type StorageDriver = "neon" | "local";

const DEFAULT_BUCKET = "siroq-filings";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in — see docs/GETTING_STARTED.md.`,
    );
  }
  return value;
}

export function storageDriver(): StorageDriver {
  const raw = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  if (raw === "neon" || raw === "s3") return "neon";
  if (raw === "local" || raw === "disk") return "local";
  throw new Error(
    `STORAGE_DRIVER must be "neon" or "local", received "${raw}".`,
  );
}

function bucket(): string {
  return process.env.S3_BUCKET || DEFAULT_BUCKET;
}

const globalForS3 = globalThis as unknown as { siroqS3?: S3Client };

/**
 * Neon Object Storage endpoint + credentials.
 *
 * `requestChecksumCalculation: "WHEN_REQUIRED"` is mandatory. Recent AWS SDK
 * versions otherwise compute a checksum over an empty body while presigning,
 * which produces a PUT URL the browser cannot satisfy with real content.
 */
function s3Client(): S3Client {
  if (globalForS3.siroqS3) return globalForS3.siroqS3;

  const client = new S3Client({
    region: process.env.S3_REGION || "us-east-2",
    endpoint: required("S3_ENDPOINT"),
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") !== "false",
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  if (process.env.NODE_ENV !== "production") {
    globalForS3.siroqS3 = client;
  }
  return client;
}

/**
 * Absolute path for a key under the local root, refusing anything that escapes it.
 *
 * The `turbopackIgnore` hints are deliberate. The key is dynamic by design, so
 * Turbopack's static analysis would otherwise decide this reads anywhere on disk
 * and trace the entire project into the server bundle. The local driver is a
 * development-only backend: production uses Neon Object Storage, and the escape
 * check below is what actually keeps reads inside the root.
 */
function localPath(key: string): string {
  const root = resolve(
    /*turbopackIgnore: true*/ process.env.STORAGE_LOCAL_ROOT || "./data/storage",
  );
  const target = resolve(join(/*turbopackIgnore: true*/ root, key));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Refusing to access "${key}" outside the storage root.`);
  }
  return target;
}

/** Rejects absolute paths and traversal segments before they reach a driver. */
export function assertSafeKey(key: string): void {
  if (!key || key.length > 512) throw new Error("Invalid storage key.");
  if (isAbsolute(key) || key.includes("..") || key.includes("\\") || key.includes("\0")) {
    throw new Error("Invalid storage key.");
  }
}

export interface StoredObject {
  key: string;
  sizeBytes: number;
  contentType: string;
  /** Hex SHA-256 of the bytes, when the backend can report it cheaply. */
  checksumSha256?: string;
}

/** Writes an object. Overwrites any existing object at the same key. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<StoredObject> {
  assertSafeKey(key);

  if (storageDriver() === "local") {
    const path = localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, sizeBytes: body.byteLength, contentType };
  }

  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  // HeadObject gives us the authoritative size the backend accepted.
  const head = await s3Client().send(
    new HeadObjectCommand({ Bucket: bucket(), Key: key }),
  );
  return {
    key,
    sizeBytes: Number(head.ContentLength ?? body.byteLength),
    contentType: head.ContentType ?? contentType,
  };
}

/** Returns object bytes, or null when the key does not exist. */
export async function getObject(
  key: string,
): Promise<{ body: Buffer; contentType: string; sizeBytes: number } | null> {
  assertSafeKey(key);

  if (storageDriver() === "local") {
    try {
      const body = await readFile(/*turbopackIgnore: true*/ localPath(key));
      return { body, contentType: contentTypeFor(key), sizeBytes: body.byteLength };
    } catch {
      return null;
    }
  }

  try {
    const result = await s3Client().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
    );
    if (!result.Body) return null;
    const bytes = await result.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType ?? contentTypeFor(key),
      sizeBytes: bytes.byteLength,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  assertSafeKey(key);

  if (storageDriver() === "local") {
    await rm(localPath(key), { force: true });
    return;
  }
  await s3Client()
    .send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
    .catch((error: unknown) => {
      if (!isNotFound(error)) throw error;
    });
}

/**
 * Presigned PUT so the browser can send bytes straight to storage, bypassing
 * the function body-size limit. Only valid for the object driver.
 */
export async function presignPut(
  key: string,
  contentType: string,
  expiresInSeconds = 300,
): Promise<{ url: string; expiresIn: number }> {
  assertSafeKey(key);
  if (storageDriver() === "local") {
    throw new Error("The local storage driver has no presigned uploads.");
  }
  const url = await getSignedUrl(
    s3Client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds },
  );
  return { url, expiresIn: expiresInSeconds };
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

function contentTypeFor(key: string): string {
  if (key.toLowerCase().endsWith(".csv")) return "text/csv";
  if (key.toLowerCase().endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

/** Converts a Node stream into the Web stream a Next response needs. */
export function toWebStream(stream: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}
