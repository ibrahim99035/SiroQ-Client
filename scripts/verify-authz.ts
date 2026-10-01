/**
 * Cross-tenant authorization regression suite.
 *
 * The bug this guards against: an association admin could download any
 * tenant's filing, and any signed-in user could bind an upload to any filing.
 * Both are silent, invisible in review, and would only surface as a data breach
 * in production — so they are pinned here with real HTTP requests against a
 * running server rather than asserted in prose.
 *
 * Usage:
 *   npx next dev &
 *   npx tsx scripts/verify-authz.ts
 *
 * Works against either storage driver: the server reports `mode: "direct"` or
 * `mode: "presigned"` on slot creation and the suite follows it, so an object
 * store is exercised exactly as production uses it.
 *
 * Env:
 *   BASE_URL            default http://localhost:3000
 *   SEED_PASSWORD       default siroq-dev-password (must match the seed)
 *   DATABASE_URL        required (same as the app)
 *
 * Exits non-zero if any assertion fails.
 */
import { unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { can } from "@/lib/permissions";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/** Strips the quoting dotenv files use so values compare as plain strings. */
function env(name: string): string {
  return (process.env[name] ?? "").replace(/^['"]|['"]$/g, "");
}

/**
 * Deletes one stored object through whichever driver the app is running.
 *
 * The suite cannot import `lib/storage.ts` — it is `server-only`, so importing
 * it outside a React Server Component request throws. The client is therefore
 * rebuilt here from the same environment variables. The mirror matters: when
 * this still assumed the local driver, every run silently leaked its objects
 * into the bucket while reporting a clean cleanup.
 */
async function removeStoredObject(key: string): Promise<void> {
  if (!key) return;
  const driver = (env("STORAGE_DRIVER") || "local").toLowerCase();

  if (driver === "neon" || driver === "s3") {
    const endpoint = env("S3_ENDPOINT");
    const bucket = env("S3_BUCKET") || "siroq-filings";
    if (!endpoint || !env("S3_ACCESS_KEY_ID")) return;
    const s3 = new S3Client({
      region: env("S3_REGION") || "us-east-2",
      endpoint,
      credentials: {
        accessKeyId: env("S3_ACCESS_KEY_ID"),
        secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: (env("S3_FORCE_PATH_STYLE") || "true") !== "false",
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => undefined);
    return;
  }

  const root = resolve(env("STORAGE_LOCAL_ROOT") || "./data/storage");
  const target = resolve(join(root, key));
  if (!target.startsWith(root + sep)) return;
  await unlink(target).catch(() => undefined);
}

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = process.env.SEED_PASSWORD ?? "siroq-dev-password";
const CONNECTION = process.env.DATABASE_URL;

if (!CONNECTION) {
  console.error("DATABASE_URL is not set.");
  process.exit(2);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: CONNECTION }) });

const CSV_NAME = "authz-fixture-manifest.csv";

/** Header + data rows the intake validator requires for a valid manifest. */
const CSV = [
  "NDC code,Batch number,Quantity,Expiry",
  "00074-3955,BT-1001,100,2027-01-31",
  "00074-3956,BT-1002,250,2027-06-30",
].join("\n");

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

type Reply = { status: number; body: unknown; headers: Headers };

/** Reads the uploadId out of an API reply without trusting the shape. */
function uploadIdFrom(body: unknown): string {
  const parsed = body as { uploadId?: unknown };
  return typeof parsed.uploadId === "string" ? parsed.uploadId : "";
}

/**
 * Reads the bound `ApplicationFile` id out of a `/complete` reply.
 *
 * A different uuid from the upload slot: binding a file to a filing mints a fresh
 * `application_files` row. Anything addressing a file through its filing needs
 * this one, not the upload id.
 */
function fileIdFrom(body: unknown): string {
  const parsed = body as { file?: { id?: unknown } } | null;
  const id = parsed?.file?.id;
  return typeof id === "string" ? id : "";
}

/** Reads the reserved storage key out of an API reply. */
function storageKeyFrom(body: unknown): string {
  const parsed = body as { storageKey?: unknown };
  return typeof parsed.storageKey === "string" ? parsed.storageKey : "";
}

async function call(
  path: string,
  opts: { method?: string; cookie?: string; body?: unknown } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: "manual",
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* binary or html body */
  }
  return { status: res.status, body, headers: res.headers };
}

/** Signs in and returns the session cookie header value. */
async function login(email: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  const raw = res.headers.getSetCookie?.() ?? [];
  const session = raw.find((c) => c.startsWith("siroq_session="));
  if (!session) throw new Error(`no session cookie returned for ${email}`);
  return session.split(";")[0]!;
}

/**
 * Rows created by this run, removed afterwards. A suite that leaves records
 * behind in the development database is a suite nobody will keep running.
 */
const createdUploads: string[] = [];
const createdKeys: string[] = [];
/** Sessions that already existed, so cleanup never touches a developer's own. */
let preExistingSessions: string[] = [];

/** Uploads a file end-to-end and returns the completed upload id. */
async function uploadFile(
  cookie: string,
  fileName: string,
  applicationId?: string,
): Promise<{ uploadId: string; fileId: string; created: number; completed?: Reply }> {
  const created = await call("/api/uploads", {
    method: "POST",
    cookie,
    body: { fileName, declaredBytes: Buffer.byteLength(CSV), applicationId },
  });
  if (created.status !== 200) {
    return { uploadId: "", fileId: "", created: created.status, completed: created };
  }
  const uploadId = uploadIdFrom(created.body);
  createdUploads.push(uploadId);
  createdKeys.push(storageKeyFrom(created.body));

  // The server chooses the transport. With an object store it returns a
  // presigned URL and the bytes go there directly, so /complete only verifies
  // what actually landed. The local driver has nothing to presign against, so
  // the bytes ride along with /complete instead. Branching on `mode` is what
  // lets this suite exercise the deployed configuration rather than only the
  // offline one — before this, the suite silently assumed `local` and reported
  // a false "the file never arrived in storage" against a working bucket.
  const mode = (created.body as { mode?: unknown } | null)?.mode;
  if (mode === "presigned") {
    const url = (created.body as { url?: unknown }).url;
    const headers =
      (created.body as { headers?: Record<string, string> }).headers ?? {};
    if (typeof url !== "string" || !url) {
      return { uploadId, fileId: "", created: created.status, completed: { status: 0, body: null, headers: new Headers() } };
    }
    const put = await fetch(url, { method: "PUT", headers, body: CSV });
    if (!put.ok) {
      return {
        uploadId,
        fileId: "",
        created: created.status,
        completed: { status: put.status, body: { error: `presigned PUT failed` }, headers: new Headers() },
      };
    }
  }

  const completed = await call(`/api/uploads/${uploadId}/complete`, {
    method: "POST",
    cookie,
    body: {
      ...(mode === "presigned" ? {} : { dataBase64: Buffer.from(CSV).toString("base64") }),
      ...(applicationId ? { applicationId } : {}),
    },
  });
  return { uploadId, fileId: fileIdFrom(completed.body), created: created.status, completed };
}

/** Removes every upload slot this run opened, plus the files they produced. */
async function cleanup(): Promise<void> {
  if (createdUploads.length === 0) return;
  try {
    await prisma.applicationFile.deleteMany({
      where: { originalName: { in: [CSV_NAME, "own.csv", "override.csv"] } },
    });
    await prisma.upload.deleteMany({ where: { id: { in: createdUploads } } });

    // Drop the sessions this run opened, leaving any that predate it alone.
    const survivors = await prisma.session.findMany({ select: { id: true } });
    const fresh = survivors.map((r) => r.id).filter((id) => !preExistingSessions.includes(id));
    if (fresh.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: fresh } } });
    }

    // Remove the stored bytes as well, so a run leaves no orphaned objects
    // behind in whichever store the app is using.
    for (const key of createdKeys) {
      await removeStoredObject(key);
    }
    console.log(`\n  cleaned up ${createdUploads.length} upload slot(s)`);
  } catch (err) {
    console.error(
      `\n  cleanup failed: ${err instanceof Error ? err.message : String(err)}` +
        `\n  run: DELETE FROM application_file WHERE original_name = '${CSV_NAME}';`,
    );
  }
}

async function main(): Promise<void> {
  console.log(`\nAuthorization suite against ${BASE_URL}\n`);

  preExistingSessions = (await prisma.session.findMany({ select: { id: true } })).map((r) => r.id);

  // Fixtures: one filing in each of the two seeded associations.
  const apps = await prisma.application.findMany({
    select: {
      id: true,
      reference: true,
      associationId: true,
      pharmacyId: true,
      pharmacy: { select: { name: true } },
    },
    orderBy: { reference: "asc" },
  });
  const tenants = [...new Set(apps.map((a) => a.associationId))];
  if (tenants.length < 2) {
    throw new Error("need filings in at least two associations; run `npm run db:seed`");
  }
  const [assocA, assocB] = tenants as [string, string];
  const appA = apps.find((a) => a.associationId === assocA)!;
  const appB = apps.find((a) => a.associationId === assocB)!;
  const ownAssociation = appA.associationId;
  const ownPharmacy = appA.pharmacyId;

  const adminA = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_association_admin", associationId: assocA, status: "active" },
  });
  const adminB = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_association_admin", associationId: assocB, status: "active" },
  });
  // A worker at appA's own pharmacy: must be able to read it.
  const workerSame = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_worker", pharmacyId: appA.pharmacyId, status: "active" },
  });
  const workerOther = await prisma.user.findFirstOrThrow({
    where: { role: "pharmacy_worker", pharmacyId: { not: appA.pharmacyId }, status: "active" },
  });
  const moderator = await prisma.user.findFirstOrThrow({
    where: { role: "moderator", status: "active" },
  });
  const superAdmin = await prisma.user.findFirstOrThrow({
    where: { role: "super_admin", status: "active" },
  });

  console.log(
    `  A = ${appA.reference} @ ${appA.pharmacy.name}\n  B = ${appB.reference} @ ${appB.pharmacy.name}\n`,
  );

  const cookieAdminA = await login(adminA.email);
  const cookieAdminB = await login(adminB.email);
  const cookieWorkerSame = await login(workerSame.email);
  const cookieWorkerOther = await login(workerOther.email);
  const cookieModerator = await login(moderator.email);
  const cookieSuper = await login(superAdmin.email);

  // --- 1. Read scoping -----------------------------------------------------
  // The file is owned by admin A, so every read below is a *cross-user* read
  // and only tenant scope can allow or deny it.
  const seed = await uploadFile(cookieAdminA, CSV_NAME, appA.id);
  if (seed.completed?.status !== 200) {
    throw new Error(
      `setup failed: admin A could not upload to their own filing (${JSON.stringify(seed.completed?.body)})`,
    );
  }
  const read = (cookie: string) =>
    call(`/api/uploads/${seed.uploadId}/content`, { cookie }).then((r) => r.status);

  // The same bytes addressed through the filing, which is what the ledger's
  // download button actually hits. `ApplicationFile.id` is a *different* uuid
  // from the upload slot, so this cannot be the `/api/uploads` path above.
  if (!seed.fileId) {
    throw new Error("setup failed: /complete returned no bound ApplicationFile id");
  }
  const download = (cookie: string, applicationId = appA.id, fileId = seed.fileId) =>
    call(`/api/applications/${applicationId}/files/${fileId}/content`, { cookie });
  const downloadStatus = (cookie: string, applicationId?: string, fileId?: string) =>
    download(cookie, applicationId, fileId).then((r) => r.status);

  console.log("  Read scoping");
  check("own association admin can read", (await read(cookieAdminA)) === 200);
  check(
    "worker at the filing's pharmacy can read",
    (await read(cookieWorkerSame)) === 200,
    "same-pharmacy worker should not be locked out",
  );
  check("moderator can read", (await read(cookieModerator)) === 200);
  check("super admin can read", (await read(cookieSuper)) === 200);
  check(
    "OTHER association admin is denied",
    (await read(cookieAdminB)) === 403,
    "cross-tenant read",
  );
  check(
    "worker at a different pharmacy is denied",
    (await read(cookieWorkerOther)) === 403,
    "cross-tenant read",
  );

  // --- 1b. Filing-scoped file download ------------------------------------
  console.log("\n  File download scoping (via the filing)");
  check("own association admin can download", (await downloadStatus(cookieAdminA)) === 200);
  check("worker at the filing's pharmacy can download", (await downloadStatus(cookieWorkerSame)) === 200);
  check("moderator can download", (await downloadStatus(cookieModerator)) === 200);
  check("super admin can download", (await downloadStatus(cookieSuper)) === 200);
  check(
    "OTHER association admin is denied",
    (await downloadStatus(cookieAdminB)) === 404,
    "cross-tenant download must not even confirm the filing exists",
  );
  check(
    "worker at a different pharmacy is denied",
    (await downloadStatus(cookieWorkerOther)) === 404,
    "cross-tenant download",
  );

  // A file reached through the *wrong* filing is the confused-deputy case: the
  // caller may see appB, but the bytes belong to appA, so the parent check must
  // be re-applied against the pairing rather than the file alone.
  check(
    "file cannot be read through another filing they can see",
    (await downloadStatus(cookieAdminB, appB.id, seed.fileId)) === 404,
    "appB's admin must not fetch appA's file by pairing a visible filing with a foreign file id",
  );

  const attachment = await download(cookieAdminA);
  const disposition = attachment.headers.get("content-disposition") ?? "";
  check(
    "download is an attachment carrying the stored filename",
    attachment.status === 200 &&
      disposition.includes("attachment") &&
      disposition.includes(CSV_NAME),
    `got ${attachment.status} ${disposition}`,
  );
  check(
    "download bytes match what was uploaded",
    typeof attachment.body === "string" && attachment.body === CSV,
    "the streamed body should be the CSV verbatim",
  );

  // --- 2. Create scoping ---------------------------------------------------
  console.log("\n  Upload-slot creation scoping");
  const ownSlot = await call("/api/uploads", {
    method: "POST",
    cookie: cookieAdminA,
    body: { fileName: "own.csv", declaredBytes: 10, applicationId: appA.id },
  });
  if (ownSlot.status === 200) {
    createdUploads.push(uploadIdFrom(ownSlot.body));
    createdKeys.push(storageKeyFrom(ownSlot.body));
  }
  check("own filing accepts a slot", ownSlot.status === 200, `got ${ownSlot.status}`);

  const foreignSlot = await call("/api/uploads", {
    method: "POST",
    cookie: cookieAdminB,
    body: { fileName: "intrusion.csv", declaredBytes: 10, applicationId: appA.id },
  });
  check(
    "other tenant cannot reserve a slot against it",
    foreignSlot.status === 403,
    `expected 403, got ${foreignSlot.status}`,
  );

  // --- 3. Attach-at-complete scoping --------------------------------------
  console.log("\n  Attach-at-complete scoping");
  // Admin B owns this slot (no applicationId), then tries to attach it to
  // tenant A's filing — the override path that bypassed the create check.
  const override = await call("/api/uploads", {
    method: "POST",
    cookie: cookieAdminB,
    body: { fileName: "override.csv", declaredBytes: Buffer.byteLength(CSV) },
  });
  check("unattached slot is allowed", override.status === 200, `got ${override.status}`);
  if (override.status === 200) {
    createdUploads.push(uploadIdFrom(override.body));
    createdKeys.push(storageKeyFrom(override.body));
  }
  if (override.status === 200) {
    const forced = await call(`/api/uploads/${uploadIdFrom(override.body)}/complete`, {
      method: "POST",
      cookie: cookieAdminB,
      body: {
        dataBase64: Buffer.from(CSV).toString("base64"),
        applicationId: appA.id,
      },
    });
    check(
      "cannot attach it to another tenant's filing",
      forced.status === 403,
      `expected 403, got ${forced.status}`,
    );
  }

  // --- 4. Anonymous --------------------------------------------------------
  console.log("\n  Anonymous access");
  const anon = await call(`/api/uploads/${seed.uploadId}/content`);
  check("no cookie is rejected", anon.status === 401, `expected 401, got ${anon.status}`);

  // --- 5. The permission matrix, denied side ------------------------------
  // A matrix tested only from the allowed side cannot catch a row that should
  // never have been there. `attachReport` is the worked example: it carried a
  // scoped tenant row so that file attachment would work, which let a pharmacy
  // worker mark her own filing `reported`. See docs/AUTHORIZATION.md.
  console.log("\n  Permission matrix (denied side)");
  const resource = (pharmacyId: string, associationId: string) => ({
    associationId,
    pharmacyId,
    pharmacyAssociationId: associationId,
  });

  // Literal actors rather than seeded rows: this asserts the shape of the
  // matrix, so it must not depend on a fixture being present or on which
  // tenant that fixture happens to be.
  const ACTOR = {
    worker: {
      id: "actor-worker",
      role: "pharmacy_worker",
      status: "active",
      associationId: assocA,
      pharmacyId: ownPharmacy,
    },
    assocAdmin: {
      id: "actor-admin",
      role: "pharmacy_association_admin",
      status: "active",
      associationId: assocA,
      pharmacyId: null,
    },
    moderator: {
      id: "actor-moderator",
      role: "moderator",
      status: "active",
      associationId: null,
      pharmacyId: null,
    },
    superAdmin: {
      id: "actor-super",
      role: "super_admin",
      status: "active",
      associationId: null,
      pharmacyId: null,
    },
  } as const;

  const ownResource = resource(ownPharmacy, ownAssociation);
  const otherResource = resource(appB.pharmacyId, assocB);

  // `attachReport` is Requis-side: it produces the deliverable the pharmacy
  // receives. Only a super admin may do it, in any tenant.
  for (const label of ["worker", "assocAdmin", "moderator"] as const) {
    check(
      `${label} cannot attachReport, in its own tenant or any other`,
      can(ACTOR[label], "attachReport", ownResource) === false &&
        can(ACTOR[label], "attachReport", otherResource) === false,
    );
  }
  check(
    "super admin can attachReport",
    can(ACTOR.superAdmin, "attachReport", ownResource) === true,
  );
  check(
    "a disabled actor cannot attachReport even as super admin",
    can({ ...ACTOR.superAdmin, status: "disabled" }, "attachReport", ownResource) === false,
  );

  // Status changes are also Requis-side.
  check(
    "worker cannot updateApplicationStatus",
    can(ACTOR.worker, "updateApplicationStatus", ownResource) === false,
  );
  check(
    "assocAdmin cannot updateApplicationStatus",
    can(ACTOR.assocAdmin, "updateApplicationStatus", ownResource) === false,
  );
  check(
    "super admin can updateApplicationStatus",
    can(ACTOR.superAdmin, "updateApplicationStatus", ownResource) === true,
  );

  // Filing-side writes stay with the tenant.
  check(
    "worker can createApplication in its own pharmacy",
    can(ACTOR.worker, "createApplication", ownResource) === true,
  );
  check(
    "worker cannot createApplication in another tenant",
    can(ACTOR.worker, "createApplication", otherResource) === false,
  );
  // `canAttachToApplication` is not asserted here: `lib/upload-access.ts` is
  // `server-only` and this suite is plain tsx. Its cross-tenant behaviour is
  // covered over HTTP by the upload assertions above, which is the stronger
  // form of the same claim. It delegates to `createApplication`, so the two
  // `createApplication` rows above are the matrix it now depends on.

  // --- 6. Unknown ids do not leak -----------------------------------------
  console.log("\n  Non-disclosure");
  const missing = await call("/api/uploads/00000000-0000-4000-8000-000000000000/content", {
    cookie: cookieAdminA,
  });
  check("unknown upload id 404s", missing.status === 404, `got ${missing.status}`);

  const missingFile = await call(
    `/api/applications/${appA.id}/files/00000000-0000-4000-8000-000000000000/content`,
    { cookie: cookieAdminA },
  );
  check("unknown file id 404s", missingFile.status === 404, `got ${missingFile.status}`);

  const notUuid = await call(`/api/applications/${appA.id}/files/not-a-uuid/content`, {
    cookie: cookieAdminA,
  });
  check("malformed file id 404s rather than 500", notUuid.status === 404, `got ${notUuid.status}`);

  const anonDownload = await call(
    `/api/applications/${appA.id}/files/${seed.fileId}/content`,
  );
  check("anonymous download is refused", anonDownload.status === 401, `got ${anonDownload.status}`);

  // --- summary -------------------------------------------------------------
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  await cleanup();
  await prisma.$disconnect();
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(`\nsuite error: ${err instanceof Error ? err.message : String(err)}`);
  await cleanup();
  await prisma.$disconnect().catch(() => undefined);
  process.exit(2);
});
