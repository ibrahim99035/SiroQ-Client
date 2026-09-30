"use client";

import { format, startOfWeek, subWeeks } from "date-fns";
import { ApiError, apiFetch, apiSend } from "./client-api";
import { can, type PermissionResource } from "./permissions";
import type {
  Application,
  ApplicationStatus,
  Pharmacy,
  PharmacyAssociation,
  Report,
  
  User,
} from "./types";

/**
 * -------------------------------------------------------------------------
 * Requis data layer — the only place the browser talks to the API.
 *
 * Single source of truth for both SCOPING and MUTATION. Components never
 * filter arrays inline; every read goes through a `fetch*ForUser(user)` and
 * every write through a `create/update/attach/...` function below.
 *
 * The `ForUser(user)` suffix is a naming remnant from when scoping happened
 * here against an in-memory array. It is kept because the shape of these
 * functions is the app's contract, but the `user` argument is now unused and
 * scope is decided server-side: every route derives the caller's tenants from
 * the session and refuses anything else. A client cannot grant itself access,
 * so this file deliberately contains no scope checks to keep in step with
 * `lib/permissions.ts`.
 * -------------------------------------------------------------------------
 */

export class DataError extends Error {
  readonly code: "fault" | "not_found";
  constructor(code: "fault" | "not_found", message: string) {
    super(message);
    this.name = "DataError";
    this.code = code;
  }
}

/* ---------------------------------------------------------------------- */
/* Hydrated read shapes                                                    */
/* ---------------------------------------------------------------------- */

export interface ApplicationRow {
  application: Application;
  pharmacy: Pharmacy;
  association: PharmacyAssociation;
  submitter: User;
  report: Report | null;
  totalRows: number;
  totalBytes: number;
}

export interface PharmacyRow {
  pharmacy: Pharmacy;
  association: PharmacyAssociation;
  applicationCount: number;
}

export interface AssociationRow {
  association: PharmacyAssociation;
  pharmacyCount: number;
  applicationCount: number;
}

export interface WeeklyPoint {
  week: string;
  submitted: number;
}

/* API response shapes                                                     */
/* ---------------------------------------------------------------------- */

/**
 * What the routes actually return.
 *
 * Declared separately from the `User`/`Pharmacy` client types because they are
 * not the same thing: the API sends `null` for "no tenant", while the client
 * type models absence as `undefined` (it predates the database). Mapping
 * between the two in one place keeps that asymmetry from leaking into `===`
 * comparisons scattered across components — `user.associationId === id` is
 * false for both `null` and `undefined`, but a null reaching a `<select>` value
 * is a warning and a null in a text field renders the word "null".
 */
interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: User["role"];
  status: User["status"];
  associationId: string | null;
  pharmacyId: string | null;
  createdAt: string;
}

interface ApiAssociation {
  id: string;
  name: string;
  region: string;
  gmpCertificateId: string;
  status: PharmacyAssociation["status"];
  createdAt: string;
  pharmacyCount: number;
  applicationCount: number;
}

interface ApiPharmacyRow {
  id: string;
  associationId: string;
  name: string;
  address: string;
  licenseNumber: string;
  status: Pharmacy["status"];
  createdAt: string;
  association: ApiAssociation;
  applicationCount: number;
}

function apiUserToUser(row: ApiUser): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    associationId: row.associationId ?? undefined,
    pharmacyId: row.pharmacyId ?? undefined,
    createdAt: row.createdAt,
  };
}

function apiAssociation(row: ApiAssociation): PharmacyAssociation {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    gmpCertificateId: row.gmpCertificateId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

function apiPharmacy(row: ApiPharmacyRow): Pharmacy {
  return {
    id: row.id,
    associationId: row.associationId,
    name: row.name,
    address: row.address,
    licenseNumber: row.licenseNumber,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export interface DashboardStats {
  total: number;
  pending: number;
  inReview: number;
  reported: number;
  rejected: number;
  avgTimeToReport: number | null; // minutes
  rejectionRate: number; // 0..1
  weekly: WeeklyPoint[];
  weeklyPending: WeeklyPoint[];
  weeklyRejected: WeeklyPoint[];
  scopeLabel: string;
}

/* ---------------------------------------------------------------------- */
/* Queries                                                                */
/* ---------------------------------------------------------------------- */

/**
 * The filing row as the routes return it.
 *
 * Identical to `ApplicationRow`, but the routes send `null` for "no tenant" on
 * the submitter while the client type models absence as `undefined`, and they
 * send `undefined` rather than omitting `reportId`. The two are mapped in one
 * place (`apiApplicationRow`) so that asymmetry cannot leak into component
 * comparisons.
 */
type ApiApplicationRow = Omit<ApplicationRow, "submitter"> & {
  submitter: ApiUser;
  application: ApplicationRow["application"] & { reportId?: string | null };
};

function apiApplicationRow(row: ApiApplicationRow): ApplicationRow {
  return {
    ...row,
    submitter: apiUserToUser(row.submitter),
    application: {
      ...row.application,
      // `null` (API) -> `undefined` (client): `reportId && …` must not treat a
      // JSON null as a present-but-empty id.
      reportId: row.application.reportId ?? undefined,
    },
  };
}

export async function fetchApplicationsForUser(_user: User): Promise<ApplicationRow[]> {
  const body = await apiFetch<{ ok: true; applications: ApiApplicationRow[] }>(
    "/api/applications",
  );
  return body.applications.map(apiApplicationRow);
}

export async function fetchApplicationForUser(
  _user: User,
  applicationId: string,
): Promise<ApplicationRow> {
  const body = await apiFetch<ApiApplicationRow>(`/api/applications/${applicationId}`);
  return apiApplicationRow(body);
}

/**
 * Reads are now real API calls.
 *
 * These three functions used to read the in-memory Zustand store and enforce
 * scope in the browser, which meant the *browser* was the thing deciding what a
 * user could see. The server re-derives scope from the session on every request
 * (`lib/scopes.ts`), so these now simply fetch and map — the `user` argument is
 * retained only so the 14 existing call sites keep their signatures. Client-side
 * filtering is not relied on for security; it would only ever narrow what the
 * server already allowed.
 */
export async function fetchPharmaciesForUser(_user: User): Promise<PharmacyRow[]> {
  const body = await apiFetch<{ ok: true; pharmacies: ApiPharmacyRow[] }>("/api/pharmacies");
  return body.pharmacies.map((row) => ({
    pharmacy: {
      id: row.id,
      associationId: row.associationId,
      name: row.name,
      address: row.address,
      licenseNumber: row.licenseNumber,
      status: row.status,
      createdAt: row.createdAt,
    },
    association: {
      id: row.association.id,
      name: row.association.name,
      region: row.association.region,
      gmpCertificateId: row.association.gmpCertificateId,
      status: row.association.status,
      createdAt: row.association.createdAt,
    },
    applicationCount: row.applicationCount,
  }));
}

export async function fetchAssociationsForUser(_user: User): Promise<AssociationRow[]> {
  const body = await apiFetch<{ ok: true; associations: ApiAssociation[] }>("/api/associations");
  return body.associations.map((row) => ({
    association: {
      id: row.id,
      name: row.name,
      region: row.region,
      gmpCertificateId: row.gmpCertificateId,
      status: row.status,
      createdAt: row.createdAt,
    },
    pharmacyCount: row.pharmacyCount,
    applicationCount: row.applicationCount,
  }));
}

export async function fetchUsersForUser(_user: User): Promise<User[]> {
  const body = await apiFetch<{ ok: true; users: ApiUser[] }>("/api/users");
  return body.users.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    // The API returns null for "no tenant"; the client type models absence as
    // `undefined`, so normalise rather than leaking nulls into `=== ` checks.
    associationId: row.associationId ?? undefined,
    pharmacyId: row.pharmacyId ?? undefined,
    createdAt: row.createdAt,
  }));
}

export async function fetchDashboardForUser(user: User): Promise<DashboardStats> {
  const rows = await fetchApplicationsForUser(user);
  const applications = rows.map((r) => r.application);

  const reported = applications.filter((a) => a.status === "reported");
  const avgMinutesAccum: { sum: number; count: number } = { sum: 0, count: 0 };
  for (const app of reported) {
    const first = app.history.find((e) => e.to === "pending");
    const last = [...app.history].reverse().find((e) => e.to === "reported");
    if (first && last) {
      avgMinutesAccum.count += 1;
      avgMinutesAccum.sum +=
        (new Date(last.changedAt).getTime() - new Date(first.changedAt).getTime()) / 60000;
    }
  }

  const weekly = weeklySeries(applications, 8);
  const weeklyPending = weeklySeries(applications.filter((a) => a.status === "pending"), 8);
  const weeklyRejected = weeklySeries(applications.filter((a) => a.status === "rejected"), 8);

  return {
    total: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    inReview: applications.filter((a) => a.status === "in_review").length,
    reported: reported.length,
    rejected: applications.filter((a) => a.status === "rejected").length,
    avgTimeToReport: avgMinutesAccum.count > 0 ? avgMinutesAccum.sum / avgMinutesAccum.count : null,
    rejectionRate: applications.length > 0 ? applications.filter((a) => a.status === "rejected").length / applications.length : 0,
    weekly,
    weeklyPending,
    weeklyRejected,
    scopeLabel: scopeLabelFor(user, rows),
  };
}

function weeklySeries(applications: Application[], weeks: number): WeeklyPoint[] {
  const today = new Date();
  const points: WeeklyPoint[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStart = startOfWeek(subWeeks(today, i), { weekStartsOn: 1 });
    const weekEnd = startOfWeek(subWeeks(today, i - 1), { weekStartsOn: 1 });
    const count = applications.filter((a) => {
      const t = new Date(a.submittedAt).getTime();
      return t >= weekStart.getTime() && t < weekEnd.getTime();
    }).length;
    points.push({ week: format(weekStart, "MM/dd"), submitted: count });
  }
  return points;
}

/**
 * Names the slice of the ledger this dashboard is showing.
 *
 * The tenant's name is read off the rows already fetched for the stats rather
 * than looked up separately: every filing carries its pharmacy and association,
 * so the dashboard needs no second request. The cost is a tenant with no filings
 * has no row to read a name from, and falls back to its role label — an empty
 * dashboard that says "Association" instead of the association's name is an
 * acceptable trade for not asking the server for something it would only
 * sometimes have.
 *
 * This previously read the mock store's fixture ids (`assoc-002`) and compared
 * them to real UUIDs, so the lookup never matched: every pharmacy worker was
 * told their scope was "Unassigned pharmacy" no matter which pharmacy they
 * belonged to.
 */
function scopeLabelFor(user: User, rows: ApplicationRow[]): string {
  switch (user.role) {
    case "super_admin":
      return "All associations";
    case "moderator":
      return "All associations · read-only";
    case "pharmacy_association_admin":
      return rows[0]?.association.name ?? "Association";
    case "pharmacy_worker":
      return rows[0]?.pharmacy.name ?? "Unassigned pharmacy";
  }
}

/* ---------------------------------------------------------------------- */
/* Mutations                                                               */
/* ---------------------------------------------------------------------- */

export interface CreateApplicationInput {
  title: string;
  pharmacyId: string;
  /**
   * The staged `File` handles, not a client-authored `ApplicationFile`.
   *
   * This is deliberately `File[]` and not a list of metadata records: the server
   * derives size, checksum, MIME and schema state from the stored object, so
   * nothing about a file is taken on trust from the browser. `File` is also the
   * only handle that can actually put bytes into storage from the client.
   */
  files: File[];
}

/** A slot that has bytes in storage and is waiting to be bound to a filing. */
interface PendingUpload {
  completeUrl: string;
  /** Only the local driver carries bytes to completion; presigned already has them. */
  dataBase64?: string;
}

/**
 * Raised when a filing exists but not all of its files made it, so the caller
 * can name the filing instead of showing a bare error.
 *
 * Without this the browser held a filing id it threw away: the user was told
 * "try again", resubmitting created a *second* filing, and the first one sat in
 * the queue with no files and nothing on screen pointing at it.
 */
export class PartialSubmissionError extends Error {
  readonly application: Application;

  constructor(message: string, application: Application) {
    super(message);
    this.name = "PartialSubmissionError";
    this.application = application;
  }
}

/**
 * Reserves a slot and puts the bytes in storage, without naming a filing yet.
 *
 * The slot is deliberately left unattached. `POST /api/uploads` takes an
 * optional `applicationId`, and `/api/uploads/[id]/complete` accepts one that
 * overrides the slot's, so the bytes can land before there is anything to attach
 * them to. Reserving against the filing up front would put the filing's
 * existence ahead of its evidence, and a storage failure would then leave a
 * pending filing that the queue can see but no one can explain.
 *
 * Both reserve modes are handled. `presigned` is the Neon driver: the browser
 * PUTs straight to object storage, so a 4 MB body never passes through this
 * Next.js process. `direct` is the local filesystem driver, which has nowhere
 * to presign to, so the bytes are held and travel in the completion call.
 */
async function stageFileForUpload(file: File): Promise<PendingUpload> {
  const reserved = await apiSend<{
    ok: true;
    uploadId: string;
    mode: "direct" | "presigned";
    url?: string;
    headers?: Record<string, string>;
    completeUrl: string;
  }>("/api/uploads", "POST", {
    fileName: file.name,
    declaredBytes: file.size,
    mimeType: file.type || undefined,
  });

  if (reserved.mode === "presigned") {
    if (!reserved.url) {
      throw new ApiError(
        "server_error",
        `${file.name} could not be uploaded. Please try again.`,
        0,
      );
    }
    const put = await fetch(reserved.url, {
      method: "PUT",
      headers: reserved.headers ?? {},
      body: file,
    });
    if (!put.ok) {
      throw new ApiError(
        "server_error",
        `${file.name} could not be uploaded to storage (${put.status}). Please try again.`,
        put.status,
      );
    }
    return { completeUrl: reserved.completeUrl };
  }

  return { completeUrl: reserved.completeUrl, dataBase64: await fileToBase64(file) };
}

/**
 * Binds a staged slot to its filing, letting the server verify the stored bytes.
 *
 * This is where `ApplicationFile` rows actually get written: the completion
 * handler reads the object back and derives size, checksum and schema state
 * from it, so nothing the browser claimed is stored.
 */
async function completeStagedUpload(
  pending: PendingUpload,
  applicationId: string,
): Promise<void> {
  await apiSend(pending.completeUrl, "POST", {
    applicationId,
    ...(pending.dataBase64 ? { dataBase64: pending.dataBase64 } : {}),
  });
}

/**
 * `File` → base64, for the local driver only.
 *
 * `btoa` takes a binary string, and the usual `String.fromCharCode(...bytes)`
 * spread blows the argument limit on a file of any real size, so the bytes are
 * concatenated in chunks.
 */
async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

/**
 * Creates a filing from bytes that are already in storage.
 *
 * The order is deliberate: stage every file first, then create the filing, then
 * bind the files to it. The filing is the commit point, and it is now the *last*
 * irreversible step rather than the first.
 *
 * Creating first and uploading after meant a storage failure left a pending
 * filing in the queue holding nothing, reported to no one, reachable only by a
 * id the browser had thrown away. Under this order a failed byte upload leaves
 * no filing at all, and the only residue is an unattached slot that
 * `npm run storage:reap` collects.
 *
 * Binding can still fail after the filing exists, so that case raises
 * `PartialSubmissionError` carrying the filing rather than an anonymous
 * failure — the caller can then tell the user which reference to expect.
 */
export async function createApplication(
  input: CreateApplicationInput,
  _user: User,
): Promise<Application> {
  const staged: PendingUpload[] = [];
  for (const file of input.files) {
    staged.push(await stageFileForUpload(file));
  }

  const created = await apiSend<ApiApplicationRow>(
    "/api/applications",
    "POST",
    { title: input.title, pharmacyId: input.pharmacyId },
  );
  const application = apiApplicationRow(created).application;

  try {
    for (const pending of staged) {
      await completeStagedUpload(pending, application.id);
    }
  } catch (reason) {
    throw new PartialSubmissionError(
      reason instanceof Error
        ? `${reason.message} Filing ${application.reference} was created, but not every file attached to it.`
        : `Filing ${application.reference} was created, but not every file attached to it.`,
      application,
    );
  }

  // Re-read rather than patching the local copy: the server is now the only
  // authority on what a filing contains, and a partially failed upload must not
  // leave the page showing files the server rejected.
  const refreshed = await apiFetch<ApiApplicationRow>(`/api/applications/${application.id}`);
  return apiApplicationRow(refreshed).application;
}

export interface AttachReportInput {
  /**
   * The report document as text. The server parses it, so `resultData` and
   * `rawData` are always derived from the same bytes rather than from whatever
   * a client-managed object claimed.
   */
  document: string;
  /**
   * Always `final`, and optional because the server defaults to it. A manually
   * entered report is delivered the moment it is attached, so the type does not
   * offer `draft`: advertising it would let a caller compile against a value the
   * route rejects with a 400.
   */
  status?: "final";
  note?: string;
}

/**
 * Attaches a report to a filing and advances it to `reported`.
 *
 * The server writes the `Report` row, the status change and the `StatusEvent`
 * in one transaction, so there is no state in which a filing is stamped
 * `reported` without an audit row, or carries a report the ledger never
 * announced.
 *
 * Returns the filing's refreshed row rather than just the `Report`, because the
 * caller's next act is to re-render the detail page and the status change is
 * part of what it needs to show.
 */
export async function attachReport(
  applicationId: string,
  _user: User,
  input: AttachReportInput,
): Promise<Application> {
  const body = await apiSend<ApiApplicationRow>(
    `/api/applications/${applicationId}/report`,
    "POST",
    { document: input.document, status: input.status, note: input.note },
  );
  return apiApplicationRow(body).application;
}

/**
 * Fetches a report's stored document. Called only when the panel's raw toggle
 * is opened, because the document is capped at 4 MB and is deliberately absent
 * from the application row.
 */
export async function fetchReportRaw(
  reportId: string,
  _user: User,
): Promise<{ applicationId: string; rawData: string }> {
  const body = await apiFetch<{ ok: true; applicationId: string; rawData: string }>(
    `/api/reports/${reportId}/raw`,
  );
  return { applicationId: body.applicationId, rawData: body.rawData };
}

/**
 * Moves a filing to a new status.
 *
 * The server writes the status change and its `StatusEvent` in one transaction,
 * so the audit trail cannot drift from the row. Two consequences for callers:
 *
 *   - it is async now, and the returned application is the server's version;
 *   - a same-status request is a no-op, not an error, so a retried or
 *     double-clicked transition cannot duplicate an audit row.
 *
 * The `user` argument is unused for the same reason as the other Phase 1 and 2
 * mutations: scope and permission are re-derived from the session server-side.
 */
export async function updateApplicationStatus(
  applicationId: string,
  to: ApplicationStatus,
  _user: User,
  note?: string,
): Promise<Application> {
  const body = await apiSend<ApiApplicationRow>(
    `/api/applications/${applicationId}/status`,
    "PATCH",
    { to, note },
  );
  return apiApplicationRow(body).application;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: User["role"];
  associationId: string;
  pharmacyId?: string;
  status?: User["status"];
}


export async function inviteUser(input: CreateUserInput, _user: User): Promise<User> {
  const body = await apiSend<{ ok: true; user: ApiUser }>("/api/users", "POST", {
    name: input.name,
    email: input.email,
    role: input.role,
    associationId: input.associationId,
    pharmacyId: input.pharmacyId,
  });
  return apiUserToUser(body.user);
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: User["role"];
  associationId?: string;
  pharmacyId?: string | null;
  status?: User["status"];
}

export async function updateUser(userId: string, patch: UpdateUserInput, _user: User): Promise<User> {
  const body = await apiSend<{ ok: true; user: ApiUser }>(`/api/users/${userId}`, "PATCH", {
    name: patch.name,
    email: patch.email,
    role: patch.role,
    associationId: patch.associationId,
    // `undefined` means "leave alone"; the API needs null to mean "clear".
    pharmacyId: patch.pharmacyId === undefined ? undefined : patch.pharmacyId,
    status: patch.status,
  });
  return apiUserToUser(body.user);
}

/**
 * Self-service profile edit.
 *
 * Deliberately NOT routed through `/api/users/[id]`: that route refuses any
 * self-targeted write (see `guardWritable`), because an admin acting on their
 * own row is how self-lockout and privilege escalation happen. `/api/users/me`
 * is the hardened path for "a person editing themselves" and whitelists name
 * and email only, so it cannot be used to change role, status, or tenant.
 */
export async function updateOwnProfile(patch: {
  name?: string;
  email?: string;
}): Promise<User> {
  const body = await apiSend<{ ok: true; user: ApiUser }>("/api/users/me", "PATCH", patch);
  return apiUserToUser(body.user);
}

export async function removeUser(userId: string, _user: User): Promise<void> {
  await apiSend(`/api/users/${userId}`, "DELETE");
}

export interface CreateAssociationInput {
  name: string;
  region: string;
  gmpCertificateId: string;
}

export async function createAssociation(
  input: CreateAssociationInput & { status?: PharmacyAssociation["status"] },
  _user: User,
): Promise<PharmacyAssociation> {
  const body = await apiSend<{ ok: true; association: ApiAssociation }>("/api/associations", "POST", {
    name: input.name,
    region: input.region,
    gmpCertificateId: input.gmpCertificateId,
  });
  return apiAssociation(body.association);
}

export async function updateAssociation(
  associationId: string,
  patch: Partial<CreateAssociationInput> & { status?: PharmacyAssociation["status"] },
  _user: User,
): Promise<PharmacyAssociation> {
  const body = await apiSend<{ ok: true; association: ApiAssociation }>(
    `/api/associations/${associationId}`,
    "PATCH",
    patch,
  );
  return apiAssociation(body.association);
}

export async function deleteAssociation(associationId: string, _user: User): Promise<void> {
  // A populated association answers 409: the delete would cascade into
  // pharmacies, filings, and users. The message is surfaced verbatim so the
  // admin sees the actual counts.
  await apiSend(`/api/associations/${associationId}`, "DELETE");
}

export interface CreatePharmacyInput {
  name: string;
  address: string;
  licenseNumber: string;
  associationId: string;
}

export async function createPharmacy(
  input: CreatePharmacyInput & { status?: Pharmacy["status"] },
  _user: User,
): Promise<Pharmacy> {
  const body = await apiSend<{ ok: true; pharmacy: ApiPharmacyRow }>("/api/pharmacies", "POST", {
    associationId: input.associationId,
    name: input.name,
    address: input.address,
    licenseNumber: input.licenseNumber,
  });
  return apiPharmacy(body.pharmacy);
}

export async function updatePharmacy(
  pharmacyId: string,
  patch: Partial<CreatePharmacyInput> & { status?: Pharmacy["status"] },
  _user: User,
): Promise<Pharmacy> {
  const body = await apiSend<{ ok: true; pharmacy: ApiPharmacyRow }>(
    `/api/pharmacies/${pharmacyId}`,
    "PATCH",
    patch,
  );
  return apiPharmacy(body.pharmacy);
}

export async function deletePharmacy(pharmacyId: string, _user: User): Promise<void> {
  await apiSend(`/api/pharmacies/${pharmacyId}`, "DELETE");
}


/* ---------------------------------------------------------------------- */
/* Shared helpers for components                                           */
/* ---------------------------------------------------------------------- */

export function permissionResourceFor(application: Application): PermissionResource {
  if (!application.associationId) return { pharmacyId: application.pharmacyId };
  return {
    pharmacyId: application.pharmacyId,
    pharmacyAssociationId: application.associationId,
  };
}

export { can };