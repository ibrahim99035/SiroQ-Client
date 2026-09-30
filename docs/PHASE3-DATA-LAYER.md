# Phase 3 — Data layer swap (execution plan)

> Focused plan for the work tracked as "Phase 3" in [`PLAN.md`](./PLAN.md).
> Written 2026-09-29 against `main` (clean tree, `tsc --noEmit` green).
>
> **Goal: no mocks anywhere.** Every authenticated page reads and writes real
> data through permissioned, Prisma-backed API routes.

## TL;DR

`lib/data.ts` is 883 lines of Zustand fake data backing all 7 authenticated
pages. Underneath it sits a complete backend — 10 API routes, full Prisma
schema, real sessions, real tenant-scoped permissions. **The two halves are
completely disconnected:** no real route imports the mock, and no page calls the
real domain routes.

| | |
|---|---|
| Mock files | 14 (7 pages + 7 components) |
| Mock functions | 21 in one file, already `async` and user-scoped |
| Real API routes | 10 — only auth + uploads are reachable from the UI |
| Missing routes | applications, reports, associations, pharmacies, users read/update/delete, dashboard |
| `lib/data.ts` | 883 lines, 40 `useAppStore` reads, `faultGuard()` failure injection |

**Core decision:** keep all 21 exported signatures in `lib/data.ts` and replace
only their internals (store reads → `fetch()`). The 14 consuming components then
barely change. This is what turns "rewrite 14 files" into "rewrite one file plus
small loader swaps."

## Decisions locked

| Decision | Choice |
|---|---|
| Seeded demo files (8 × `seed://`) | **Leave broken.** No backfill. Downloads 404; metadata and lists work. |
| `Application.reference` generation | **Postgres sequence**, DB-side default |
| Audit trail scope | **Application-only** (`StatusEvent`). No entity-audit model. |
| Storage driver | **`neon`** (Neon Object Storage) |
| Report JSON provenance | Service-exported JSON, uploaded manually by an admin |
| Live analysis-service wiring | **Out of scope.** `ANALYSIS_SERVICE_ENABLED=false`. |

## Environment findings (verified, not assumed)

### Storage — the bucket exists, under a different name

`lib/storage.ts` is a complete dual-driver S3 implementation with `neon` as a
first-class driver. Verified against the live endpoint:

| Setting | Value |
|---|---|
| `S3_ENDPOINT` | `https://br-wispy-voice-b4zmsbo4.storage.c-6.us-east-2.aws.neon.tech` |
| `S3_REGION` | `us-east-2` (confirmed via `GetBucketLocation`) |
| `S3_BUCKET` | **`uploads`** — created 2026-09-29, currently 0 objects |
| CORS | already set: `GET,PUT,POST,HEAD,DELETE`, origin `*`, exposes `ETag` |

**Trap:** `.env` shipped `S3_BUCKET="siroq-filings"`, which returns
`NoSuchBucket`. `ListBuckets` shows the only bucket is `uploads`. One-line fix,
no code change.

`br-wispy-voice` is a **branch** of the same Neon project as the database
(`b4t23dj5`), so branch-scoped storage is branch-scoped with the data. CORS
being pre-configured means the presigned-PUT path works from the browser as-is.

### The seeded files are unrecoverable by configuration

All 8 seeded `application_file` rows carry `storageDriver: "seed"` with keys like
`seed://AP-2026-2601/dispensing_2026_wk34_alderst.csv`. **No bytes exist
anywhere** — not in the bucket, not on disk. `assertSafeKey()` rejects `seed://`
outright, so `uploads/[id]/content` 404s with "recorded but missing from
storage" for every seeded filing regardless of driver. Accepted as-is.

### Mail — Gmail is already the default, and failure is non-fatal

`SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465` are already set. `lib/mail.ts:37`
derives `secure: port === 465`, so implicit TLS is correct with no code change.

**Trap:** `MAIL_FROM` **must stay empty**. `lib/mail.ts:51` resolves
`fromAddress()` as `MAIL_FROM || SMTP_USER`. Gmail rejects mail whose From does
not match the authenticated account, so setting a custom From
(`no-reply@requis.dev`) would silently break every invite.

Delivery cannot break onboarding: `app/api/users/route.ts:202-220` awaits
`sendWorkspaceInvite()`, which never throws, and returns `inviteUrl` in the
`201` regardless of `mailDelivered`. Safe to turn on, and now verified on.

## Two schema/type mismatches to fix

- **`Application.reference`** is `@unique`, required, **no default** in the
  schema, but is **missing** from the client `Application` type. The mock
  fabricates IDs like `AP-2026-2601`. Must be generated server-side — database
  identity must never leak to the client.
- **`Report.source` / `engineVersion`** exist in the DB but not in the client
  `Report` type. Needed by the manual-upload path.

## Phase 0 — Storage + mail wiring (no code changes)

- [x] 0.1 `.env`: `S3_BUCKET=uploads`, `STORAGE_DRIVER=neon`
- [x] 0.2 `.env`: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (SECRET)
- [x] 0.3 `.env`: `SMTP_USER`, `SMTP_APP_PASSWORD` (SECRET). `MAIL_FROM` stays empty
- [x] 0.3a Verified: a real invite to a live Gmail inbox returns
      `mailDelivered: true` over `smtp.gmail.com:465`. The app password alone was
      never sufficient — Gmail authenticates with the **full address** as the
      username, so `SMTP_USER` (and `MAIL_FROM`, which must match it) is the
      second required half, not an optional extra.
- [x] 0.4 Verified: presigned PUT lands in `uploads`, reads back byte-exact
      through `uploads/[id]/content`; `npm run verify:authz` **12/12** against
      the real bucket, and the bucket is left empty afterwards
- [ ] 0.5 Verify: a real invite email is delivered

`.env` is gitignored (`.gitignore:21` covers `.env*`). `.env.example` ships empty
placeholders — keep it that way.

### Two bugs found while verifying 0.4

Both were latent assumptions that the offline `local` driver was the only one.

**`scripts/verify-authz.ts` could not drive an object store.** It sent the file
bytes inline with `/complete` and never performed the presigned PUT, so against a
working bucket it failed with `"The file never arrived in storage"` — a false
alarm that reads like a broken bucket. The server already reports
`mode: "direct" | "presigned"` on slot creation; the suite now follows it.

**`scripts/verify-authz.ts` leaked an object per run.** Cleanup unlinked from
`STORAGE_LOCAL_ROOT` only ("Only the local driver is exercised by this suite"), so
every run silently added a file to the bucket while reporting a clean teardown.
It now mirrors `lib/storage.ts` for whichever driver is active. The suite cannot
import `lib/storage.ts` — it is `server-only`, so importing outside a React
Server Component request throws.

**A stale `.next` made the content route 404 with an HTML page.** Per trap #6 in
`PLAN.md`, `rm -rf .next/dev` was not enough on this mount; only removing
`.next` outright got Turbopack to register
`app/api/uploads/[id]/content`. The symptom is worth recognising: a **404 whose
body is the app's HTML not-found page, not JSON**, means the route was never
matched. Every JSON `apiError(...)` 404 in this app looks different.

## Phase 1 — Users, associations, pharmacies

New routes following the `app/api/uploads/route.ts` pattern exactly:
`requireUser()` → zod → **authorize before write** → Prisma → `apiError`.

| Route | Methods | Replaces |
|---|---|---|
| `/api/users`, `/api/users/[id]` | GET, PATCH, DELETE | `fetchUsersForUser`, `updateUser`, `removeUser` |
| `/api/associations`, `/api/associations/[id]` | GET, POST, PATCH, DELETE | `fetchAssociationsForUser` + CRUD |
| `/api/pharmacies`, `/api/pharmacies/[id]` | GET, POST, PATCH, DELETE | `fetchPharmaciesForUser` + CRUD |

- [x] 1.1 All scoping through `lib/permissions.ts` — **never** inline `user.role`
      checks (`docs/AUTHORIZATION.md` is normative)
- [x] 1.2 Repoint the consumers. `lib/data.ts` keeps its 21 signatures; the ten
      Phase 1 functions now call the real endpoints, and the `user: User`
      argument is no longer read (it is the *server* that decides scope, so
      client-side filtering could only ever narrow what was already allowed).
      Consumers: user directory, user form, association form, pharmacy form,
      both admin pages, settings profile.
- [x] 1.3 Prove the invite flow end-to-end against Neon (invite → accept → session),
      cleaning up throwaway records. Now proven with **real mail delivery**, not
      just the token path: `npm run verify:invite` (17 checks) issues a live
      invitation, confirms it cannot sign in before accepting, that acceptance
      hashes the password and preserves the invited tenant binding, that the
      new session sees only that tenant, and that the token is single-use. It
      sends one email per run to a `+`-addressed alias of `SMTP_USER`.
- [x] 1.4 Self-service profile edits go through `/api/users/me`, **not**
      `PATCH /api/users/[id]`. The admin route refuses every self-targeted write
      via `guardWritable` — it exists to stop self-demotion and self-disable —
      so a settings form wired to it silently 409s while reporting success.
      `/api/users/me` whitelists name and email, so it cannot become an
      escalation path. Pinned by `npm run verify:self-service`.
- [x] 1.5 Delete dialogs and page copy state the *actual* rule: deletes are
      refused (409) while a tenant or site still holds data, rather than
      cascading. The UI must not promise a cascade the server refuses.

## Phase 2 — Applications, files, status

- [x] 2.1 `/api/applications` (GET, POST), `/api/applications/[id]` (GET, PATCH),
      `/api/applications/[id]/status` (PATCH)
- [x] 2.2 Sequence migration. **Must start above the highest seeded reference** —
      references are contiguous from `AP-2026-2601` and `reference` is `@unique`,
      so a default starting at 1 both collides conceptually and makes numbering
      jump backwards in the demo. It was written when the fixture set ended at
      2616 and started at 2617; the set later grew to 2619, so the same rule now
      reads "start at 2620". `prisma/seed.ts` derives this from the seed rather
      than hardcoding it, which is why the migration did not have to be edited:

      ```sql
      CREATE SEQUENCE application_reference_seq START 2617;  -- first cut; see above
      ALTER TABLE applications ALTER COLUMN reference
        SET DEFAULT 'AP-2026-' || lpad(nextval('application_reference_seq')::text, 4, '0');
      ```

      Prisma returns the default from `INSERT … RETURNING`, so no re-read needed.

      **Do this by hand and it rots.** The seed truncates the tables, which
      restarts table identities but leaves a standalone sequence object
      untouched, and the seeded rows write `reference` explicitly so the
      database default never fires. Re-seeding therefore left the sequence at
      whatever value the previous database had reached. `prisma/seed.ts` now
      ends with a `setval` against the highest seeded reference, so
      `npm run db:seed` leaves the sequence consistent by construction.
- [x] 2.3 Status transitions write `StatusEvent` **inside a `$transaction`** — the
      audit trail is the reason the table exists

## Phase 3 — Reports + recursive renderer

- [x] 3.1 Widen `ReportResultData` to a recursive `JsonValue`. Real reports are
      ~depth 10 / 8,202 nodes, so the flat renderer is not viable: depth-capped
      tree, collapsible objects, tables for object arrays
- [x] 3.2 `POST /api/applications/[id]/report` — 4 MB cap, the document must be a
      JSON **object** (an array is rejected: a report is a document, not a
      list), and report row + `reported` status + status event are written in
      one transaction

      **Rule chosen here, so it is a decision and not an accident:** a report
      may be attached from `pending` as well as `in_review`; only `rejected` and
      `reported` are refused. The tight reading — that `pending` exists to be
      triaged, so it should not be possible to skip straight to `reported` — is
      defensible, and tightening it is a two-line change plus a test. What is
      *not* defensible is leaving it implicit: the status event records
      `pending → reported`, so the chain of custody will show a filing that was
      never triaged. Pick one deliberately.
- [x] 3.3 `GET /api/reports/[id]/raw` — authenticated, filing-scoped, full nested
      JSON, fetched on demand rather than inlined on the application row
- [x] 3.4 `attachReport` is **super-admin only**. It produces the deliverable the
      pharmacy receives, so it is a Requis-side write. This was not obvious and
      shipped wrong: `canAttachToApplication` delegated to `can(user,
      "attachReport")` so that a pharmacy worker could attach *files* to her own
      filing, and a worker attaching a *report* to her own filing marked it
      `reported`. Caught by `verify:reports`, not by reading the matrix. See
      `docs/AUTHORIZATION.md`.

### Phase 3 notes worth keeping

- **Postgres `jsonb` does not preserve key order.** It stores keys by length then
  bytewise, so `result_data` round-trips as the same document in a different key
  order. Assert on structural equality, never on `JSON.stringify` equality, or
  the test will fail on correct behaviour and pass on reordered garbage.
- The application detail/list split matters now: the list projection carries
  `resultData: {}` and the detail projection carries the full tree, so opening
  the applications list does not pull every report body into the response.
- The report's database id is never rendered. It is used only to key the raw
  fetch — same principle as the filing reference.
- `reported` and `rejected` are terminal. The triage bar renders a closure note
  on them instead of a prompt, and in particular no longer offers "Reject
  filing" on a rejected filing, which the API answers with 409.

## Phase 4 — Delete the simulation

- [x] 4.1 `lib/data.ts` internals → `fetch()`, signatures unchanged
- [x] 4.2 Delete `LATENCY`, `delay()`, `faultGuard()` (`lib/data.ts:45-59`)
- [x] 4.3 `grep -r '@/lib/data'` returns zero
- [x] 4.4 `lib/store.ts` → **deleted**, and `lib/data.ts` → the only data module

### What 4.4 actually removed, and what it left behind

The plan said to narrow the store to UI-only state. That turned out to leave
nothing worth keeping, so the file is gone:

- `useCurrentUser` was the last real export. It read `/api/auth/me` and belongs
  next to the provider that fetches it, so it moved to
  `components/session-provider.tsx` and 16 import lines were repointed.
- `useRevision` was a cache-buster incremented by `markMutated()`. Its only
  caller was `createAccount`, a mock mutation — so the counter was permanently
  `0` while six pages listed `revision` in their `useResource` dependency
  arrays, implying a re-fetch on mutation that could never happen. Deleted along
  with the six entries; `reload()` is what views actually call.
- `simulateFault` drove a toggle for a simulated backend that no longer exists.
- `lib/data.ts` also carried a **second copy of the authorization rules**
  (`enforceApplicationScope`) plus `getApplication`, both reading the mock
  arrays, and both now unreachable. Deleting them is a security improvement as
  much as a cleanup: client-side scope checks are a copy that silently rots away
  from `lib/permissions.ts`, and scope is decided server-side in every route.

**`lib/seed.ts` is not part of this.** It is the Prisma fixture source, imported
by `prisma/seed.ts`, and it must stay. Only its use as a runtime client data
source went away.

### One live bug the store was hiding

`fetchDashboardForUser`'s `scopeLabelFor()` looked the tenant name up in the mock
store, comparing fixture ids (`assoc-002`) against real UUIDs — a comparison that
can never match. Every pharmacy worker therefore saw "Unassigned pharmacy" on
their dashboard regardless of which pharmacy they belonged to, while the stats
beside it were real. It now reads the name off the application rows already
fetched for the stats, so it needs no second request; a tenant with no filings
has no row to read from and falls back to the generic role label.

## Seed coverage gap found while testing in the browser

`North Point Rx` had **no filings at all**, and it is the pharmacy that owns the
only pharmacy-worker account in the fixture set (Angela Rowe). Logging in as the
persona the intake flow was built for produced an empty applications list, so the
one account that matters most for exercising the upload path had nothing to
exercise it against. Three filings were added for it — one `reported` (so the
report panel is reachable without creating anything), one `in_review`, one
`pending` — with file specs named for that pharmacy rather than reusing another
pharmacy's files inside its filing.

Fixture set is now 19 filings / 5 pharmacies / 2 associations / 9 reports.

## Intake ordering — bytes before the filing

Worth its own section because it is a correctness fix, not a migration step.
`createApplication` used to create the filing first and upload afterwards, so a
storage failure left a `pending` filing holding no files — visible in the queue,
explainable to nobody, with an id the browser had thrown away. The only remedy
offered to the user was "try again", which produced a *second* filing.

The flow is now: reserve every slot unattached → put the bytes in storage →
create the filing → complete each slot against the new id. The filing is the last
irreversible step. `PartialSubmissionError` covers the one case that can still
fail afterwards, and the intake page names the reference instead of inviting a
retry. Covered by `verify:applications`, including a guard that the byte failure
test really reaches the transfer — a 401 from an unauthenticated reserve made
that assertion pass for free at first.

This moved the leak rather than removing it, so `npm run storage:reap`
(`scripts/reap-expired-uploads.ts`) shipped with it. It was not optional: nothing
deleted abandoned slots or their objects before, so the reorder would have traded
a visible empty filing for an invisible pile of leaked storage. It refuses to
touch a bound slot, since that object is evidence a filing points at.

## Verification gate (after every phase)

`npm run typecheck` · `npm run lint` · `npm run verify:authz` ·
`npm run verify:self-service` · `npm run verify:invite` (sends one real email)
· plus a real browser pass on all 7 authenticated pages. Each phase stays independently green so there is always a
working path.

`verify:self-service` (17 checks) covers the identity boundary: profile edits
via `/api/users/me`, the admin route's refusal to act on one's own row, the
name/email-only whitelist, anonymous rejection, and per-role directory and
tenant scoping. It renames a real seeded account and restores it in a
`finally` block, so an interrupted run cannot leave the database altered.

The suites need a running server and a `DATABASE_URL`:

```
npm run dev &
set -a && . ./.env && set +a
npm run verify:authz && npm run verify:self-service && npm run verify:invite
```

## Explicitly out of scope

- Backfilling the 8 seeded `seed://` files
- `analysisApplicationId` → tenant FK backfill (9 of 16 applications have it
  null; it stays a manual link)
- The SiroQ Analysis Service work (`ANALYSIS_SERVICE_ENABLED=false`)
- Any audit model beyond `StatusEvent`

## Traps carried over from `PLAN.md`

See "Known traps" in [`PLAN.md`](./PLAN.md) — especially #6 (stale dev server on
this mount: kill by port, `rm -rf .next/dev`, relaunch before any verification)
and #8 (`pkill -f "next dev"` kills your own shell).
