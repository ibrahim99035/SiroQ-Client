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

**Complete and verified:**

- Database layer: 11 tables, schema pushed, seeded
  (2 associations, 5 pharmacies, 11 users, 16 applications, 19 files,
  36 status events, 8 reports)
- `tsc --noEmit` clean
- `prisma/schema.prisma` + `prisma/seed.ts` written
- `lib/db.ts` Prisma singleton working
- Frontend spec fixes (see "Fixed this session" at the bottom)

**Not started:** everything that connects the app to the database.

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

- [ ] 0.1 Create Neon project + `siroq` database; copy pooled + direct URLs
- [ ] 0.2 Add env vars to `.env.example` and to Vercel project settings
- [ ] 0.3 Generate the initial migration from the existing schema and commit it
      `npx prisma migrate dev --name init`
- [ ] 0.4 Apply to Neon with `npx prisma migrate deploy`; re-run seed; verify counts
- [ ] 0.5 Confirm `next build` passes on Vercel

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

- [ ] 2.1 `lib/scopes.ts` — session → Prisma `where`. Derive `associationId` /
      `pharmacyId` from the **session**, never the request body. This is the
      fix for the classic multi-tenant IDOR.
- [ ] 2.2 `requireUser()` / `requirePermission()` → 401 / 403
- [ ] 2.3 Guard every route under `/api`
- [ ] 2.4 `/applications/[id]` scope check **before** any data is sent, so a
      worker probing another pharmacy's UUID gets 403 — not an empty page
- [ ] 2.5 Verify all 4 roles × scoped data. Moderator must be read-only
      everywhere.

---

## Phase 3 — Data layer swap · 7 steps

- [ ] 3.1 ~14 API routes: applications (list / detail / create), files, reports,
      status transitions, users, pharmacies, associations, dashboard stats
- [ ] 3.2 Rewrite `lib/data.ts` internals against `fetch()` — **keep every
      exported signature identical** (`fetchApplicationsForUser`,
      `ApplicationRow`, `DataError`, `PermissionError`) so all 15 importing
      files keep working untouched
- [ ] 3.3 Real mutations: `createApplication`, `attachReport`,
      `updateApplicationStatus`, `inviteUser`, `updateUser`, `removeUser`,
      association + pharmacy CRUD
- [ ] 3.4 Delete the simulation — `LATENCY`, `delay()`, `faultGuard()`
      (`lib/data.ts:45-59`)
- [ ] 3.5 Server-written `StatusEvent` audit trail
- [ ] 3.6 Dashboard aggregates in SQL (avg time-to-report, rejection rate,
      8-week series)
- [ ] 3.7 `lib/store.ts` → UI-only; keep `simulateFault` as a dev toggle

---

## Phase 4 — File uploads · 9 steps

- [ ] 4.1 `lib/storage.ts` — one interface, `local` + `cloudinary` drivers
- [ ] 4.2 `POST /api/uploads/initiate` — server validates extension, **magic
      bytes**, and size; creates a pending `Upload`; returns Cloudinary signed
      upload params (timestamp, signature, api_key, folder)
- [ ] 4.3 Client uploads directly to `api.cloudinary.com/v1_1/<cloud>/raw/upload`
      — this is what keeps us under Vercel's 4.5 MB body limit
- [ ] 4.4 `POST /api/uploads/[id]/complete` — verify via the Cloudinary API,
      store `public_id` as `storageKey`, flip to `ready`
- [ ] 4.5 Real parsing — `exceljs` + `papaparse` → genuine `rowCount`,
      `columnCount`, `detectedColumns`, `sheetNames`. Replaces the
      `hashStr(fileName)` heuristics in `lib/files.ts:80-153`
- [ ] 4.6 Real validation against the actual spec (`NDC code`, `Batch number`,
      `Quantity dispensed`, `Dispense date`, `Rx number` — `lib/files.ts:41-63`).
      Keep `FileValidationState` and the reason strings so the ledger UI is
      unchanged
- [ ] 4.7 Timeout guard — parse inline only under ~10 MB; larger files take a
      deferred path
- [ ] 4.8 Wire `FileDropzone` — real `XMLHttpRequest.upload.onprogress`
      replacing the `setTimeout` loop (`components/file-dropzone.tsx:56-70`).
      The `File` object finally gets used (`:47` reads only name + size today)
- [ ] 4.9 `GET /api/files/[id]/download` — authz by scope → signed URL +
      `fl_attachment`. Clean 404 for `seed://` keys

---

## Phase 5 — Reports · 3 steps

- [ ] 5.1 Attach-report API — super admin only; writes `Report`
      (`source: "manual"`), sets application → `reported`, appends a
      `StatusEvent`
- [ ] 5.2 Report panel against real data (`resultData` is already
      `ReportValue`-typed and schemaless)
- [ ] 5.3 Re-attach upserts on the `applicationId` unique constraint

---

## Phase 6 — Role views · 4 steps

- [ ] 6.1 Super admin — dedicated platform dashboard, all associations
- [ ] 6.2 Association admin — their own association only
- [ ] 6.3 Worker — own pharmacy; selector locked
      (`app/(app)/applications/new/page.tsx:133` already handles this)
- [ ] 6.4 Nav driven by the real session role

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
- [ ] 8.4 `GETTING_STARTED.md` — the Prisma 7 gotchas, the ESLint peer
      conflict, Neon + Cloudinary setup
- [ ] 8.5 Smoke-test every route per role; `next build` clean

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

---

## Fixed this session (frontend, uncommitted)

- Association admins were wrongly blocked from creating applications —
  `can()` had no case for it and fell through to `default: false`
  (`lib/permissions.ts` + a scope guard in `lib/data.ts`)
- `Report.status` was missing from the type, seed, and report panel
- `resultData` widened from `Record<string, string>` to
  `string | number | boolean | null` so the real analytical service can
  populate it
- `Inter` → `IBM Plex Sans`; `--hairline` corrected to `#D8DDDA`

---

## Useful commands

```bash
npm run db:up        # local Postgres (offline work only; Neon is the target)
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy
npm run db:seed      # tsx --env-file=.env prisma/seed.ts
npm run db:reset     # prisma migrate reset --force
npm run typecheck    # tsc --noEmit
```

Local Postgres for offline development: `docker compose up -d db` → :5434.
The analysis service stack lives in the sibling `SiroQ` project (its own
compose file, DB :5433, API :8000).
