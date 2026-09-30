# Authorization & Tenant Isolation — Spec

> Normative spec for who may read and write what in SiroQ-Client.
> `lib/permissions.ts` implements this; `scripts/verify-authz.ts` proves it.
> Read this before touching a route, a role check, or a query that touches
> `applications` / `application_files` / `uploads`.

Last updated: 2026-09-27 · Applies to: upload routes, user management

---

## The one rule

**Never compare `user.role` in a route or a query.** Every decision goes
through `can()` / `requirePermission()` / `requireUploadRead()` /
`canAttachToApplication()`. Inline role checks are how this codebase shipped a
cross-tenant data leak, and they are the defect this document exists to prevent.

`Application` denormalises both `pharmacyId` and `associationId`
(`prisma/schema.prisma`), so a resource is one indexed select — there is never a
justification for hand-rolling a scope join in a route.

---

## Roles and the tenant they belong to

| Role | Tenant scope | Notes |
|---|---|---|
| `super_admin` | global | full read/write |
| `moderator` | global read | **`viewAllData` only** — read-only, cannot attach or mutate |
| `pharmacy_association_admin` | one `associationId` | sees every pharmacy inside that association |
| `pharmacy_worker` | one `pharmacyId` | sees only their own pharmacy |

A user with no `associationId` / `pharmacyId` has **no** tenant scope. Their
access is limited to rows they own. `dataScope()` returns `"none"`.

---

## Resource shape

`PermissionResource` (`lib/permissions.ts`) is what a decision is made against:

```ts
{ associationId, pharmacyId, pharmacyAssociationId }
```

`pharmacyAssociationId` is the association that **owns** the pharmacy. It is
what scopes an association admin: comparing `pharmacyId` alone would let one
pharmacy's admin read a sibling pharmacy's filings, and comparing nothing at all
is the bug that was live in `app/api/uploads/[id]/content/route.ts`.

Build it with `lib/upload-access.ts` (`applicationScope()`), not by hand.

---

## Two ways to read a file

| Situation | Rule |
|---|---|
| Upload **not yet attached** to a filing (`applicationId === null`) | uploader only, plus global roles. It belongs to no tenant yet. |
| Upload **attached** to a filing | `can(user,"viewAllData") \|\| can(user,"viewPharmacyData", resource)` |

The `||` is load-bearing. `moderator` is granted `viewAllData` and **nothing
else** (`lib/permissions.ts`, the `moderator` case returns
`action === "viewAllData"`). Testing `viewPharmacyData` alone silently strips
moderators of all file access. Do not "simplify" it away.

---

## Writing: attaching a file to a filing

`canAttachToApplication()` (`lib/upload-access.ts`) gates the file-write path.

- An upload slot may be created unattached (pick-a-file-then-start-a-filing).
- The `applicationId` supplied at **create** time *and* the one supplied at
  **complete** time are both checked. `complete` re-checks rather than trusting
  create, because the request can retarget the upload to a different filing.
  Owning a slot proves nothing about the right to write into another tenant's
  filing.
- Authorization happens **before** any bytes are written. A rejected attach
  must not leave an object in storage.

This gate tests `can(user, "createApplication")`, **not** `attachReport`.

**These are two different rights and conflating them was a live bug.**

| | right | who |
|---|---|---|
| `createApplication` | file evidence into a filing | pharmacy worker (own pharmacy), association admin (own association), staff |
| `attachReport` | produce the review report and mark the filing `reported` | **super admin only** |

`canAttachToApplication` once delegated to `attachReport`, so `attachReport`
carried a scoped row for tenant roles to make file attachment work. The result
was that a pharmacy worker could attach a report to her own filing and stamp it
`reported` — the terminal state, the one the pharmacy receives — without Requis
reviewing anything. Found by `npm run verify:reports`, not by reading the
matrix.

Note the shape of the mistake: it looked correct, and `docs/AUTHORIZATION.md`
described it in the present tense. Passing a test and being described in the
docs are not the same as being right.

If you add an action, add its rows in the same change, and add a role-negative
assertion to `verify:authz` — a matrix that is only tested from the allowed side
cannot catch a row that was never meant to be there.

---

## Verified behaviour

`npm run verify:authz` — 12 assertions, real HTTP against a running server.
Requires `STORAGE_DRIVER=local`; it is self-cleaning (removes its own uploads,
application files, storage objects, and sessions, leaving pre-existing ones).

| Assertion | Expected |
|---|---|
| own association admin reads | 200 |
| worker at the filing's pharmacy reads | 200 |
| moderator reads | 200 |
| super admin reads | 200 |
| **other association admin reads** | **403** |
| **worker at a different pharmacy reads** | **403** |
| own filing accepts a slot | 200 |
| **other tenant reserves a slot against it** | **403** |
| unattached slot | 200 |
| **attach to another tenant's filing** | **403** |
| no cookie | 401 |
| unknown upload id | 404 |

**A passing suite proves nothing on its own.** The suite was validated by
reintroducing each vulnerability and confirming it fails:

- restoring the old read check → `10 passed, 2 failed`
- removing the relocated write guard → `11 passed, 1 failed`

If you change scoping, re-run it *that* way. A suite that has never been seen
red is not evidence.

---

## Not yet covered

These remain open and are **not** protected by anything in this document:

- **Page-level authorization.** All 9 pages under `app/(app)/` are client
  components; `proxy.ts` checks only that a cookie *exists*. No page resolves
  the session server-side. Not exploitable yet because no real data is behind
  them — it becomes exploitable the moment the data layer lands.
- **Impersonation.** `components/app-shell.tsx` still has a "Viewing as" menu
  and `lib/store.ts` still has `setCurrentUser`.
- **Rate limiting.** None on login / accept-invite / forgot / reset-password.
- **Host-header trust.** `lib/mail.ts` falls back to `x-forwarded-host` when
  `APP_BASE_URL` is unset, which makes reset-link targets attacker-controllable.
