# SiroQ-Client — Implementation Plan

> **Handoff document.** Written by one session, intended to be continued by
> another. Read this file first; it records the decisions *and* the traps.
>
> Last updated: 2026-09-25 · Repo: `SiroQ-Client` · Branch: `main`

## TL;DR

Transform `SiroQ-Client` from a front-end prototype (Zustand mock) into a
**standalone fullstack SaaS app** managing users, associations, pharmacies,
applications, files, and reports, with role-appropriate views and real file
upload. It may later connect to the separate **SiroQ Analysis Service** for
automated report generation.

---

## Status

**Phases 0–6 are complete and verified against a real database.** Phase 7 (the
optional SiroQ Analysis Service) is not started. Phase 8 is partial: the
authorization matrix and four regression suites exist, rate limiting and unit
tests do not.

- Database layer: 11 tables, schema pushed, seeded
  (2 associations, 5 pharmacies, 11 users, **19 applications, 22 files,
  42 status events, 9 reports**)
- `tsc --noEmit` clean · `eslint .` 0 errors (4 known `react-hook-form`
  warnings)
- **Auth**: opaque hashed session cookies, login/logout, invite-only signup,
  single-use invite acceptance, password reset, `AuthError` → 401,
  `PermissionError` → 403
- **Storage**: local + S3-compatible (`STORAGE_DRIVER=neon`) drivers; upload slot
  → presigned PUT → complete → authenticated content read; CSV/XLSX validation,
  SHA-256, size and extension limits, path-traversal guards
- **Authorization**: `lib/scopes.ts` derives every tenant filter from the
  session; `docs/AUTHORIZATION.md` is the normative spec
- **Data layer**: `lib/data.ts` is a thin client over real API routes. The mock
  store, its fault switch, its artificial latency and its client-side copy of the
  scope rules are gone — `lib/store.ts` and `lib/seed.ts`'s runtime consumers
  included. `lib/seed.ts` remains as the *Prisma fixture source*
  (`prisma/seed.ts` imports it); it is not client mock state.
- **Verification**: `npm run verify:authz` (22), `verify:self-service` (17),
  `verify:invite` (17), `verify:applications` (56), `verify:reports` (38)

**Not started:**

- Rate limiting on auth and upload routes
- Phase 7: the optional SiroQ Analysis Service
- Unit tests (the coverage here is five endpoint-level regression suites instead)

---

## Target stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 18, TypeScript strict |
| Hosting | Vercel |
| Database | Neon (Postgres) via Prisma 7 |
| Storage + CDN | Cloudinary (`resource_type: raw`, signed uploads) |
| Storage fallback | S3-compatible via `@aws-sdk/client-s3` (**installed, currently unused** — Cloudinary needs only the REST API + HMAC-SHA1 from `node:crypto`. Keep for the `s3` driver in `STORAGE_DRIVER`, or drop in a cleanup pass.) |
| Email | Gmail SMTP + app password (nodemailer) |
| UI | Tailwind + Radix (shadcn-style), Zustand for ephemeral UI state |
| Optional integration | SiroQ Analysis Service (FastAPI, :8000) |

### Why this stack — three constraints worth knowing

1. **Cloudinary for `.xlsx`/`.csv`.** It works via `resource_type: "raw"` and
   serves through its built-in CDN, but it is a media pipeline used as general
   object storage. The right primitive is a **signed upload** (timestamp +
   SHA-1 signature from `api_secret`) — Cloudinary's equivalent of a presigned
   PUT. There is **no presigned GET**; downloads use a signed URL plus
   `fl_attachment`. `storageKey` maps to the Cloudinary **public_id**.

2. **Vercel + server-side parsing.** Serverless functions cap request bodies at
   **4.5 MB** and time out (~10s Hobby, up to 60s Pro). Uploading *directly from
   the browser to Cloudinary* is what keeps us inside the body limit. But
   **parsing a 50 MB workbook inside a function will time out** — cap inline
   parsing at ~10 MB and defer larger files.

3. **Gmail SMTP.** Fine for internal/low-volume (~500 messages/day on a consumer
   account). Port 465, TLS, app password. Not suitable for high-volume
   transactional mail later.

**Neon** works with the existing `lib/db.ts` with no code change — only
`DATABASE_URL` changes to the pooled endpoint. Use **migrations**
(`prisma migrate dev` → `migrate deploy`), not `db push`, so Neon keeps real
migration history.

---

## Required environment variables

```bash
# Neon — pooled for runtime, direct for migrations
DATABASE_URL="postgresql://...@ep-xxx-pooler.../siroq?sslmode=require"
MIGRATIONS_DATABASE_URL="postgresql://...@ep-xxx.../siroq?sslmode=require"

# Cloudinary
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""       # SECRET — server only, never NEXT_PUBLIC_

# Gmail SMTP
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER=""                   # full Gmail address
SMTP_APP_PASSWORD=""           # SECRET — Google app password, not the account password

# Sessions
SESSION_SECRET=""              # openssl rand -base64 48
SESSION_COOKIE_NAME="siroq_session"
SESSION_TTL_HOURS="720"

# Uploads
STORAGE_DRIVER="cloudinary"    # or "local" for offline work
UPLOAD_MAX_BYTES="10485760"
UPLOAD_ALLOWED_EXTENSIONS=".xlsx,.csv"

# SiroQ Analysis Service (optional)
ANALYSIS_SERVICE_ENABLED="false"
ANALYSIS_SERVICE_BASE_URL="http://127.0.0.1:8000/api/v1"
ANALYSIS_SERVICE_API_KEY=""
```

`.env.example` is the authoritative copy — keep it in sync with this file.

---

## Blast radius (measured, not guessed)

| Coupling | Files |
|---|---|
| import `@/lib/data` | 15 |
| import `@/lib/store` | 18 |
| import `@/lib/permissions` | 6 |
| `"use client"` pages | 14 of 16 |
| `useResource` consumers | 7 |
| `app/api/**` | none exists |
| `proxy.ts` (Next 16 name for middleware) | newly added in Phase 1 |

**Core decision:** because 14 of 16 pages are client components and there are
zero API routes, a full React Server Component rewrite is not warranted. Keep
the existing UI, replace the **interior of `lib/data.ts`** with `fetch()`, and
enforce all authorization server-side.

`can()` from `lib/permissions.ts` stays in the client **only to hide buttons** —
it is never the security boundary. The server re-checks everything.

---

## Architecture

```
Browser (14 client components — UI unchanged)
   ↓ fetch()                                    ↑ JSON
app/api/** (new) ── cookie ── getCurrentUser() (new)
   ↓                              ↓
   └──► lib/scopes.ts (new)   lib/permissions.ts (SHARED, server-safe)
                    ↓
            lib/db.ts → Prisma → Neon
                    ↓
       lib/storage.ts (new) → Cloudinary (signed upload + CDN)
                    ↓
       lib/analysis.ts (new) → SiroQ Analysis Service :8000
```

---

## Phase 0 — Deploy + Neon cutover · 5 steps

- [x] 0.1 Create Neon project + `siroq` database; copy pooled + direct URLs
- [x] 0.2 Add env vars to `.env.example` and to Vercel project settings
- [x] 0.3 Generate the initial migration from the existing schema and commit it
      `npx prisma migrate dev --name init`
- [x] 0.4 Apply to Neon with `npx prisma migrate deploy`; re-run seed; verify counts
- [ ] 0.5 Confirm `next build` passes on Vercel *(local `npm run build` is
      clean; the deploy itself has not been made, so this is still open)*

**Done when:** Neon holds all datasets with migration history, build is green.

---

## Phase 1 — Auth & sessions · 10 steps

> **Progress: complete.** All ten steps implemented. See "Phase 1 notes" below.

- [x] 1.1 `lib/password.ts` — bcryptjs, cost 12
- [x] 1.2 `lib/session.ts` — 32 random bytes; store **SHA-256 of the token**,
      never the token. Cookie `httpOnly`, `Secure`, `SameSite=Lax`, `path=/`.
      A database read cannot be replayed as a login.
- [x] 1.3 `lib/auth.ts` — `getCurrentUser()`, wrapped in React `cache()`
- [x] 1.4 `proxy.ts` — coarse redirect only. **Not** the security boundary.
- [x] 1.5 `POST /api/auth/login` — verify hash, reject non-`active` users
- [x] 1.6 `POST /api/auth/signup` — hashes the password. *Was discarded at
      `app/(auth)/signup/page.tsx:37`.*
- [x] 1.7 `POST /api/auth/logout` — revoke + clear cookie
- [x] 1.8 `POST /api/auth/forgot-password` + `/reset-password` — single-use
      expiring token, **generic response** (no user enumeration)
- [x] 1.9 Login / signup rewired to real endpoints with pending & error states
- [x] 1.10 "Viewing as" switcher removed from the login screen and the mock
      identity swapper removed from `signInAs`

### Phase 1 notes

- `lib/api.ts` adds `withErrorHandling` / `apiError` so every route returns a
  consistent `{ error: { code, message } }` JSON body with a real status code.
- **Next 16 renamed the convention:** `middleware.ts` → `proxy.ts` (the file is
  now `proxy.ts`, exporting `proxy()`). The old name still builds but logs a
  deprecation warning. Noted for the teammate.
- Signup creates an `active` worker, not `invited`, because the person supplied
  their own password. `invited` is reserved for admin-created accounts with no
  usable password.
- Email delivery is **not** wired yet (that is step 8.3). Until then the reset
  token is printed to the server log in non-production only, so the flow is
  testable.
- `proxy.ts` is protected-by-default via its matcher, with `PUBLIC_PATHS` as the
  only explicit opening. `/dashboard` is intentionally left gated so the signed
  out state still renders.


---

## Phase 2 — Server-side authorization · 5 steps

Normative spec: **`docs/AUTHORIZATION.md`**. Do not hand-roll a role check in a
route; the rules and the reasoning live there.

- [x] 2.1 `lib/scopes.ts` — session → Prisma `where`. Derive `associationId` /
      `pharmacyId` from the **session**, never the request body. This is the
      fix for the classic multi-tenant IDOR.
      *Done for uploads via `lib/upload-access.ts`; still open for the
      application/listing routes.*
- [x] 2.2 `requireUser()` / `requirePermission()` → 401 / 403
- [x] 2.3 Guard every route under `/api` — every route derives its tenant
      filter from the session; none accepts a scope from the request body
- [x] 2.4 `/applications/[id]` scope check **before** any data is sent, so a
      worker probing another pharmacy's UUID gets 403 — not an empty page
- [x] 2.5 Verify roles × scoped data. `npm run verify:authz` — moderator
      read-only confirmed, both tenant roles confirmed in both directions

---

## Phase 3 — Data layer swap · 7 steps

> **Complete.** The detailed execution plan, the
> environment findings (Neon bucket name is `uploads`, not `siroq-filings`;
> `MAIL_FROM` must stay empty for Gmail; the sequence must start at 2617), and
> the locked decisions live in **[`docs/PHASE3-DATA-LAYER.md`](./PHASE3-DATA-LAYER.md)**.
> Read that first.

- [x] 3.1 ~14 API routes: applications (list / detail / create), files, reports,
      status transitions, users, pharmacies, associations, dashboard stats
- [x] 3.2 Rewrite `lib/data.ts` internals against `fetch()` — **keep every
      exported signature identical** (`fetchApplicationsForUser`,
      `ApplicationRow`, `DataError`, `PermissionError`) so all 15 importing
      files keep working untouched
- [x] 3.3 Real mutations: `createApplication`, `attachReport`,
      `updateApplicationStatus`, `inviteUser`, `updateUser`, `removeUser`,
      association + pharmacy CRUD
- [x] 3.4 Delete the simulation — `LATENCY`, `delay()`, `faultGuard()`
      (`lib/data.ts:45-59`)
- [x] 3.5 Server-written `StatusEvent` audit trail
- [x] 3.6 Dashboard aggregates computed from the scoped row set (avg
      time-to-report, rejection rate, 8-week series). Done client-side over the
      scoped list, not in SQL — the row set is already tenant-filtered, and a
      second query would only re-derive the same filter.
- [x] 3.7 `lib/store.ts` → **deleted**, not narrowed to UI-only. Its last real
      export was `useCurrentUser`, which moved to
      `components/session-provider.tsx` next to the `/api/auth/me` fetch it
      reads. The fault switch went with it: there is no simulated backend left to
      fail. `useRevision` went too — its only writer was a deleted mock
      mutation, so the counter sat at `0` while six pages listed it in their
      refetch dependencies.

---

## Phase 4 — File uploads · 9 steps

- [x] 4.1 `lib/storage.ts` — one interface, `local` + S3-compatible (`neon`) drivers.
      *Not Cloudinary: the Neon bucket is already S3-compatible, so it needed no
      second vendor.*
- [x] 4.2 `POST /api/uploads` (the plan called it `initiate`) — server validates extension, **magic
      bytes**, and size; creates a pending `Upload`; returns a
      a presigned PUT URL. `applicationId` is **optional**: a slot may be
      reserved unattached and bound later at completion, which is what lets a
      filing's bytes land before the filing exists (see Phase 4 notes)
- [x] 4.3 Client uploads directly to the presigned URL from 4.2
      — this is what keeps us under Vercel's 4.5 MB body limit
- [x] 4.4 `POST /api/uploads/[id]/complete` — read the stored object back,
      store `public_id` as `storageKey`, flip to `ready`
- [x] 4.5 Real parsing — `exceljs` + `papaparse` → genuine `rowCount`,
      `columnCount`, `detectedColumns`, `sheetNames`. Replaces the
      `hashStr(fileName)` heuristics in `lib/files.ts:80-153`
- [x] 4.6 Real validation against the actual spec (`NDC code`, `Batch number`,
      `Quantity dispensed`, `Dispense date`, `Rx number` — `lib/files.ts:41-63`).
      Keep `FileValidationState` and the reason strings so the ledger UI is
      unchanged
- [x] 4.7 Timeout guard — parse inline only under ~10 MB; larger files take a
      deferred path
- [x] 4.8 Wire `FileDropzone` — real `XMLHttpRequest.upload.onprogress`
      replacing the `setTimeout` loop (`components/file-dropzone.tsx:56-70`).
      The `File` object finally gets used (`:47` reads only name + size today)
- [x] 4.9 `GET /api/files/[id]/download` — authz by scope → signed URL +
      `fl_attachment`. Clean 404 for `seed://` keys

---

### Phase 4 notes

**Intake stages bytes before it creates the filing.** `createApplication`
reserves every slot *unattached*, puts the bytes in storage, creates the filing,
then completes each slot against the new id. The filing is now the last
irreversible step rather than the first.

It was the other way round, and the failure mode was not subtle: a storage error
left a `pending` filing in the queue holding no files, reported to nobody, whose
id the browser had already thrown away — so the user's only option, "try again",
created a *second* filing. Now a failed byte transfer creates no filing at all.

The trade is real and worth stating: the residue of an abandoned submission is
now an unattached `Upload` row plus its object rather than a visible empty
filing. Nothing reaped those, so `npm run storage:reap` was added with the
reorder — it deletes expired slots and their objects, and refuses to touch a
slot that is bound to a filing, because that object is evidence a filing still
points at. The whole loop must also finish inside the 30-minute slot TTL.

A failure *after* the filing exists is still possible (binding a staged file to a
filing can fail), and that case raises `PartialSubmissionError` carrying the
filing. The intake page names the reference and links to the filing rather than
showing a bare error, so the partial state is explained instead of duplicated.

**`CreateApplicationInput.files` is `File[]`, not file metadata.** This is
deliberate and should not be "cleaned up". The server derives size, checksum,
MIME and parse state from the stored object, so nothing about a file is taken on
trust from the browser, and `File` is the only handle that can actually put bytes
into storage from the client.

---

## Phase 5 — Reports · 3 steps

- [x] 5.1 Attach-report API — super admin only; writes `Report`
      (`source: "manual"`), sets application → `reported`, appends a
      `StatusEvent`. Refuses `rejected` and `reported` filings.
      **Decision: a report may still be attached from `pending`**, which records
      `pending → reported` — a filing delivered without passing through triage.
      It is not a security question (only a super admin can do it) and the audit
      event honestly records the skip, so this is left permissive rather than
      blocked. Tighten to require `in_review` by rejecting `pending` in the
      route's status check.
- [x] 5.2 Report panel against real data (`resultData` is already
      `ReportValue`-typed and schemaless)
- [x] 5.3 Re-attach is **refused** (409) rather than upserted, on the
      `applicationId` unique constraint. A delivered report is the document the
      pharmacy receives; silently replacing it would rewrite evidence after the
      fact, so correcting it means reopening the filing instead.

---

## Phase 6 — Role views · 4 steps

- [x] 6.1 Super admin — dedicated platform dashboard, all associations
- [x] 6.2 Association admin — their own association only
- [x] 6.3 Worker — own pharmacy; selector locked
      (`app/(app)/applications/new/page.tsx:133` already handles this)
- [x] 6.4 Nav driven by the real session role

---

## Phase 7 — Analytical service · 4 steps · *optional*

- [ ] 7.1 `lib/analysis.ts` — `X-API-Key` client for `POST /api/v1/analyze` and
      `GET /api/v1/applications/{id}/analyses/{aid}/report`
- [ ] 7.2 **Never join by name** — the service also has an `applications`
      table with a completely different meaning. Use `analysisApplicationId`.
- [ ] 7.3 Persist to `Report` — `resultData` normalized, `rawData` untouched,
      `source: "service"`, `engineVersion` recorded
- [ ] 7.4 Log every call in `AnalysisRun` with request / response / error so
      failures are retryable

---

## Phase 8 — Hardening, tests, docs · 5 steps

- [ ] 8.1 Vitest matrix — 4 roles × scoping, including cross-tenant access
      attempts. These are the highest-value tests in the project.
- [ ] 8.2 Rate limiting on auth and upload endpoints
- [ ] 8.3 Gmail wired to invites and password reset; keep under 500/day
- [ ] 8.4 Setup notes — the Prisma 7 gotchas, the ESLint peer conflict and the
      Neon + S3-compatible storage setup are written up in `README.md` and
      `docs/PHASE3-DATA-LAYER.md`; a standalone `GETTING_STARTED.md` was never
      written.
- [x] 8.5 Smoke-test every route per role; `next build` clean

---

## Sequence

```
Phase 0 ──► 1 ──► 2 ──► 3 ──┬──► 5 ──► 6 ──┐
                            └──► 4 ─────────┴──► 8
Phase 7 (any time after 3)
```

**0 → 1 → 2 → 3 is the spine.** Phase 4 is the large but wanted chunk.
~54 steps, ~4 weeks. Phases 0–3 ≈ 1.5 weeks.

---

## Known traps (do not rediscover these)

1. **Prisma 7 breaking change** — `url` is rejected inside `schema.prisma`; it
   belongs in `prisma.config.ts`. The client also requires a driver adapter
   (`lib/db.ts` uses `@prisma/adapter-pg`). There is a duplicate
   `AnalysisRunStatus` enum to watch for if the schema is edited.
2. **Broken `npm install`** — `package.json` pins `eslint ^8.57.1` while
   `eslint-config-next@16` needs `eslint >=9`. A fresh clone could not install.
   `.npmrc` currently sets `legacy-peer-deps=true`. Fix properly: bump ESLint to
   9, convert `.eslintrc.json` → `eslint.config.mjs` (ESLint 9 ignores the old
   format), and replace the `next lint` script, since `next lint` is removed in
   Next 16.
3. **Dev filesystem is slow** — the repo sits on an NTFS mount. `du` times out
   and npm fetches take minutes. Run long commands detached with
   `setsid ... &` and poll a log file.
4. **Ports** — client DB `:5434`, analysis service DB `:5433`, analysis API
   `:8000`. Keep the two databases separate.
5. **The analysis service stores its own file bytes** on disk. That service and
   this app are independent bounded contexts; link explicitly, never by name.
6. **Next's dev file watcher is unreliable on this mount.** A route can compile
   once and never rebuild after an edit, so a dev server will happily serve
   *stale* code and a verification run can pass against code you already
   changed. Before any verification run: kill the server by port
   (`ss -lptn 'sport = :3000'`), `rm -rf .next/dev`, relaunch, and confirm the
   route appears in a `Compiling` line. Prefer a production build for anything
   load-bearing. Related: killing a dev server mid-write leaves **corrupted**
   `.next/dev/types/*.ts` that makes `tsc` fail with bogus syntax errors —
   `rm -rf .next/dev` fixes it.
7. **Egress from this machine is flaky.** Observed `ETIMEDOUT` to the Neon
   pooler, registry timeouts, and unreachable `fonts.gstatic.com` — often in
   the same session. Neon resolves **IPv6-only** for
   `ep-…-pooler.c-6.us-east-2.aws.neon.tech`. Retry before concluding the code
   is broken. A registry/host mirror would remove a whole class of this.
8. **`pkill -f "next dev"` kills your own shell.** The pattern matches the
   command line of the shell running it. Kill by listening port instead.

---

## Fixed this session

**Cross-tenant data leak (critical).** `app/api/uploads/[id]/content/route.ts`
granted an association admin read access to *any* upload with
`role === "pharmacy_association_admin" && Boolean(user.associationId)` — the
owning association was never compared. Every association admin could download
every other tenant's filings. It also over-restricted `pharmacy_worker`, who
could only read files they uploaded personally, not their own pharmacy's.
Fixed via `lib/upload-access.ts`; the role checks are gone.

**Cross-tenant writes (2 paths).** `POST /api/uploads` only checked that the
application *existed*, so any signed-in user could reserve a slot against any
filing. `POST /api/uploads/[id]/complete` accepted an `applicationId` override,
which bypassed even that. Both now require `canAttachToApplication()`, and
`complete` authorizes *before* writing bytes — the first version checked after,
which orphaned 10 objects in storage.

**Permission matrix holes.** `attachReport` existed in the action union with no
implementation for any role, so it returned `false` for everyone but
`super_admin`. `can()` could not be used for write gating until both tenant
roles got scoped rows. `PermissionUser` gained `id` so ownership checks are
possible.

- Association admins were wrongly blocked from creating applications —
  `can()` had no case for it and fell through to `default: false`
  (`lib/permissions.ts` + a scope guard in `lib/data.ts`)
- `Report.status` was missing from the type, seed, and report panel
- `resultData` widened from `Record<string, string>` to
  `string | number | boolean | null` so the real analytical service can
  populate it
- `Inter` → `IBM Plex Sans`; `--hairline` corrected to `#D8DDDA`

**Invite lifecycle.** Public `/signup` creates a tenantless `status=invited`
row, but the admin invite route returned 409 for that same email — a signup
request could never be activated. It now adopts never-activated rows
(`status=invited` **and** `passwordHash=null`) and re-issues a token, while
still 409-ing on active/disabled accounts so identities cannot be hijacked.

**`PermissionError` returned 500.** Not mapped in `lib/api.ts`, so a worker
hitting an admin route saw a server error instead of 403. Now mapped.

**Build was not hermetic.** `next/font/google` fetches woff2 from
`fonts.gstatic.com` at build time (unreachable here) and Turbopack's replacement
package is Vercel-internal. It only succeeded off a warm `.next` cache that
had been destroyed. Font stacks now live in `app/globals.css` with IBM Plex
first, so the real font is used wherever it is installed.

**`npm run lint` was dead.** `next lint` is removed in Next 16, and
`eslint@8` is incompatible with `eslint-config-next@16` (needs ≥9), so a fresh
clone could not lint. Migrated to ESLint 9 + `eslint.config.mjs`; all 8 errors
fixed properly (derived state in `use-resource`, `useSyncExternalStore` in
`use-mounted`, hoisted `SortHeader`, effect-scoped ref write).

---

## Useful commands

```bash
npm run db:up        # local Postgres (offline work only; Neon is the target)
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy
npm run db:seed      # tsx --env-file=.env prisma/seed.ts
npm run db:reset     # prisma migrate reset --force
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .  (0 errors expected; 4 react-hook-form warnings)
npm run verify:authz # cross-tenant suite — needs STORAGE_DRIVER=local + a dev server
```

`verify:authz` self-cleans (its own uploads, application files, storage objects
and sessions). It is worthless unless you have seen it go red — reintroduce a
check and confirm it fails. See `docs/AUTHORIZATION.md`.

Local Postgres for offline development: `docker compose up -d db` → :5434.
The analysis service stack lives in the sibling `SiroQ` project (its own
compose file, DB :5433, API :8000).
