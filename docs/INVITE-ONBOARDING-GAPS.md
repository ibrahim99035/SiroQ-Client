# Invite & onboarding gaps — deferred work

**Status: agreed, not started.** Nothing in this document has been implemented.
Decisions were taken on 2026-09-30 and are recorded under *Decisions* below.

The symptom that prompted this: a visitor fills in `/signup`, a super admin tries
to resolve the resulting row, and the flow dead-ends with *"This invitation has
not been accepted yet, so the account has no password"* and no email arriving.

---

## Root cause

This is not one bug. It is a **half-built design** — three subsystems already
support tenantless users with an empty scope, while the invite route, the admin
form and the signup page all contradict that support:

- `lib/permissions.ts:105-111` and `lib/scopes.ts:74-76` explicitly support a
  `pharmacy_worker` with no pharmacy bound: listings resolve to `{ id: none() }`
  and `createApplication` is denied because
  `resource.pharmacyId === user.pharmacyId` fails when the user's is `null`.
- `app/api/users/route.ts:161-167` already *adopts* tenantless rows created by
  public `/signup`.
- `prisma/schema.prisma` — both `associationId` and `pharmacyId` are nullable.

What is missing is the **recovery affordances**. The invite token can only ever be
issued by `POST /api/users`; there is no way to re-issue it, the admin is never
told whether mail was delivered, and the directory shows no invite state. So any
lapsed 48h window or failed send strands the row at `invited` forever.

---

## Evidence

### The password is collected, then discarded

- `app/api/auth/signup/page.tsx:106-115` renders `Password` + `Confirm password`,
  validated at 8+ characters.
- `app/api/auth/signup/route.ts:48-55` writes `passwordHash: null`. The
  credential is used only to length-check the request.
- The invite link then asks for a **different** password at 12+ characters
  (`app/api/auth/accept-invite/route.ts:15`).

Two password prompts; the first is meaningless and implies an account exists that
does not.

> Note: `docs/PLAN.md:196` currently claims this endpoint "hashes the password".
> It does not. That line needs correcting.

### Tenant assignment is forced, and inconsistently so

- `components/forms/user-form.tsx:34` requires `associationId`
  **unconditionally**, but `lib/invites.ts:47-51` nulls it for `super_admin` and
  `moderator`. An admin must pick an association for platform staff and the
  server discards the choice.
- Worse: editing an existing platform-staff user loads `associationId: ""`
  (`user-form.tsx:66`), which can never satisfy `.min(1)`. **Platform-staff
  accounts cannot be edited at all.**
- Pharmacy is presented as optional — `user-form.tsx:184` offers an "Unassigned"
  option and `:202` promises "Workers without a pharmacy assignment see an empty
  scope" — but `lib/invites.ts:64-66` rejects a worker with no pharmacy. The
  helper text describes behaviour that invite creation forbids, and which the
  permission and scope layers already support.

### Nothing tells the admin why it failed

- `app/api/users/[id]/route.ts:167-173` refuses `status: "active"` when there is
  no password hash. The guard is correct; the form offers "Active" anyway
  (`user-form.tsx:215`), so the admin can walk into a guaranteed 409.
- The directory never shows invite state or expiry, so a stuck row is
  indistinguishable from one that was never invited.

### The mail result is discarded

- `app/api/users/route.ts:209-222` returns `inviteUrl` **and** `mailDelivered`.
- `lib/data.ts:643-652` throws both away and returns only `body.user`. The admin
  sees a normal success.
- `lib/mail.ts:82-87` swallows `smtp_error`; `lib/mail.ts:73-75` only
  `console.info`s when SMTP is unconfigured. "No email" is silent by design.

### The emailed link was unusable

- `APP_BASE_URL` is **not set in `.env`** (it exists only in `.env.example`), so
  `lib/mail.ts:54-64` falls back to the request `Host` header. Invitation emails
  therefore contained `http://localhost:3000/invite/<token>` — dead on arrival
  even when delivery succeeded.

### "No solid way to end it"

Delete does work for a zero-history row and is wired to the Trash2 button
(`components/user-directory.tsx:132-141`). The problem is that the UI argues
against using it:

- `user-directory.tsx:176-178` promises "Filings keep their audit trail — the
  submitter name is retained on the records the person filed". That describes
  precisely the case where `app/api/users/[id]/route.ts:236-251` **refuses** the
  delete. The copy reads as though deletion destroys evidence.
- The refusal message then says "Disable the account instead", which reads as
  *removal is not available*.
- `app/api/users/[id]/route.ts:236-241` counts `applications`, `statusEvents`,
  `reports`, `uploads` and `applicationFiles` — but not `analysisRuns`, even
  though `User.analysisRuns` exists. A user with only analysis runs would hit an
  FK violation (500) instead of the friendly 409.

---

## Decisions

Taken 2026-09-30.

| Question | Decision |
| --- | --- |
| Password at `/signup` | **Drop the password fields entirely.** Signup becomes a pure access *request*. The invite link is the only thing that proves mailbox ownership. |
| Unplaced invitees | **Allow tenantless invites, assign later.** Guard so a tenantless user can never see cross-tenant data. |
| Public `/signup` | **Keep it as a request queue**, labelled "Request access" so it is obviously not registration. |
| Ending a stuck invite | **Both, with accurate copy.** A "Decline request" delete for zero-history rows; disable for anyone with history. |

Rejected alternatives worth remembering:

- *Store the signup password and activate on attach* — smoother, but lets
  someone sign up with another person's email and gain access the moment an
  admin carelessly attaches the row. Weakens the trust model.
- *Keep tenant mandatory, fix the wording* — safe, but contradicts the
  permission/scope layers that already implement an empty scope.
- *Disable-only* — leaves permanent rows and no way to clear spam signups.

---

## Plan

### 1. Signup becomes a password-free access request

- `app/api/auth/signup/route.ts` — drop `password` from `signupSchema`; keep
  `passwordHash: null`. Rewrite the doc comment to record *why* no credential is
  stored.
- `app/(auth)/signup/page.tsx` — remove both password inputs, the match
  `refine`, and the `password`/`confirm` defaults. Retitle to "Request access".
- `docs/PLAN.md:196` — correct the false "hashes the password" claim.

### 2. Allow tenantless invites, assign later

- `lib/invites.ts` `resolveInviteTarget` — for `pharmacy_worker` with no
  pharmacy, return an unplaced target instead of erroring. **Keep the association
  required for `pharmacy_association_admin`**, since that role *is* its tenant.
  (Relax if wanted.)
- `components/forms/user-form.tsx` — role-aware `superRefine`:
  - `associationId` required only for `pharmacy_association_admin`, omitted for
    `super_admin`/`moderator`. This also unbreaks editing platform staff.
  - Keep "Unassigned" for workers; replace the incorrect helper text with the
    real rule (no scope until a pharmacy is assigned).
  - Hide `active` from the status list for accounts that have never set a
    password, so the 409 is unreachable by construction.

### 3. Make errors actionable

- `app/api/users/[id]/route.ts` — reword the no-password 409 to name the next
  step. Add `analysisRuns` to the DELETE history check.
- `components/user-directory.tsx` — rewrite the delete confirmation to state the
  real constraint and what disabling does instead.

### 4. Expose invite state, and give the admin the link

- Derive `inviteState` (`unplaced` / `pending` / `expired` / `accepted`) and
  `inviteExpiresAt` in the GET/PATCH selects, **reusing `inviteProblem()`** so
  the UI and server cannot disagree. Never return `passwordHash`.
- New `POST /api/users/[id]/resend-invite` — re-issue the token, extend the 48h
  window, send mail, return `{ inviteUrl, mailDelivered, reason }`. Guarded by the
  same `manageUsers` + tenant scoping as PATCH; refuses non-`invited` targets and
  self-targeting.
- `lib/data.ts` — stop discarding `inviteUrl`/`mailDelivered`; add `resendInvite`.
- `components/forms/user-form.tsx` — on success, show the invite link with a
  copy button and an explicit warning when `mailDelivered === false`.
- `components/user-directory.tsx` — invite-state column with expiry, plus a
  per-row resend action.

### 5. Fix the dead link at the source

- Add `APP_BASE_URL` to `.env` (gitignored; already in `.env.example`).
- `lib/mail.ts` — warn loudly when `APP_BASE_URL` is unset, since a link derived
  from the request Host is unusable off-host. Add a boot-time notice when SMTP is
  unconfigured so "no email" is never silent again.

---

## Verification

Extend `scripts/verify-invite-lifecycle.ts` (already 17 assertions) rather than
adding a parallel suite:

- signup with no password → row created, `passwordHash` null, no second prompt
- invite a worker with no pharmacy → accepted, account `active`
- that account sees an **empty scope** *and* gets 403 creating a filing — this is
  the security property that makes tenantless safe
  (`lib/permissions.ts:109-111`)
- resend issues a fresh token, invalidates the old one, reports delivery
- activate-without-password still 409s; delete-with-history still 409s; a user
  with only `analysisRuns` returns 409 and not 500

Then `npm run typecheck`, `npm run lint`, `npm run build`, plus a browser pass of
the full journey: request → invite (unplaced) → accept → empty workspace → assign
pharmacy → scope appears → resend → delete.

---

## Open flags

- **Rotate the exposed SMTP app password.** Mail may be failing on auth, which is
  likely a *second* cause of "no email showed up" alongside the missing
  `APP_BASE_URL`. Step 5 makes failures visible but does not make mail arrive.
- **Existing tenantless signup rows** get no invite token backfill. Each still
  needs one invite; the resend action is what makes that tractable.
- **Platform staff (`super_admin`/`moderator`) may not be a real requirement.**
  The association being forced on them is arguably its own bug. `PLAN.md:474`
  notes `can()` once had no case for `moderator` and fell through to `false` —
  worth confirming moderator is genuinely needed before wiring that role up.
