"use client";

import { format, startOfWeek, subWeeks } from "date-fns";
import { markMutated, useAppStore } from "./store";
import {
  PermissionError,
  requirePermission,
  can,
  type PermissionResource,
} from "./permissions";
import type {
  Application,
  ApplicationFile,
  ApplicationStatus,
  Pharmacy,
  PharmacyAssociation,
  Report,
  ReportResultData,
  User,
} from "./types";

/**
 * -------------------------------------------------------------------------
 * Requis mock data layer.
 *
 * Single source of truth for both SCOPING and MUTATION. Components never
 * filter mock arrays inline; every read goes through `fetch*ForUser(user)`
 * and every write through the `create/update/attach/...` functions below,
 * which enforce `can(user, action, resource)` first.
 *
 * Queries are async with a simulated latency so every view exercises the
 * required loading skeleton. Set "simulate system fault" on to exercise the
 * required error states.
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

const LATENCY = 260;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY + Math.floor(Math.random() * 90)));
}

/** Throws when the "simulate system fault" switch is on, to exercise error UIs. */
function faultGuard(): void {
  if (useAppStore.getState().simulateFault) {
    throw new DataError(
      "fault",
      "The reference service is not responding. Submitted filings are safe and will reconcile when the service recovers.",
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashStr(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextIdWithPrefix(prefix: string, list: { id: string }[]): string {
  let max = 0;
  for (const item of list) {
    const match = /-?(\d+)$/.exec(item.id);
    if (match?.[1]) max = Math.max(max, parseInt(match[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
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
/* Scope enforcement                                                       */
/* ---------------------------------------------------------------------- */

function enforceApplicationScope(user: User, application: Application): void {
  if (user.role === "super_admin" || user.role === "moderator") return;
  if (user.role === "pharmacy_association_admin") {
    if (application.associationId !== user.associationId) {
      throw new PermissionError(
        `This filing belongs to another association. ${user.name} can only review filings within their association.`,
        user,
        "viewAssociationData",
      );
    }
    return;
  }
  if (user.role === "pharmacy_worker") {
    if (application.pharmacyId !== user.pharmacyId) {
      throw new PermissionError(
        `This filing belongs to another pharmacy. ${user.name} can only view filings for their own pharmacy.`,
        user,
        "viewPharmacyData",
      );
    }
  }
}

function getApplication(id: string): Application {
  const application = useAppStore.getState().applications.find((a) => a.id === id);
  if (!application) {
    throw new DataError("not_found", `No filing with ID "${id}" exists in the current dataset.`);
  }
  return application;
}

function hydrate(application: Application): ApplicationRow {
  const state = useAppStore.getState();
  const pharmacy = state.pharmacies.find((p) => p.id === application.pharmacyId);
  const association = state.associations.find((a) => a.id === application.associationId);
  const submitter = state.users.find((u) => u.id === application.submittedBy);
  const report = application.reportId
    ? (state.reports.find((r) => r.id === application.reportId) ?? null)
    : null;
  return {
    application,
    pharmacy: pharmacy ?? (fallbackPharmacy(application.pharmacyId) as Pharmacy),
    association: association ?? (fallbackAssociation(application.associationId) as PharmacyAssociation),
    submitter: submitter ?? (fallbackUser(application.submittedBy) as User),
    report,
    totalRows: application.files.reduce((sum, f) => sum + f.rowCount, 0),
    totalBytes: application.files.reduce((sum, f) => sum + f.sizeBytes, 0),
  };
}

function fallbackPharmacy(id: string): Pharmacy {
  return { id, associationId: "", name: "Removed pharmacy", address: "—", licenseNumber: "—", status: "suspended", createdAt: nowIso() };
}
function fallbackAssociation(id: string): PharmacyAssociation {
  return { id, name: "Removed association", region: "—", gmpCertificateId: "—", status: "suspended", createdAt: nowIso() };
}
function fallbackUser(id: string): User {
  return { id, email: "—", name: "Removed user", role: "moderator", status: "disabled", createdAt: nowIso() };
}

/** Applications visible to `user`, newest first, in application scope only. */
export function scopedApplications(user: User): Application[] {
  const all = useAppStore.getState().applications;
  let visible: Application[];
  switch (user.role) {
    case "super_admin":
    case "moderator":
      visible = all;
      break;
    case "pharmacy_association_admin":
      visible = all.filter((a) => a.associationId === user.associationId);
      break;
    case "pharmacy_worker":
      visible = all.filter((a) => a.pharmacyId === user.pharmacyId);
      break;
  }
  return [...visible].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  );
}

/* ---------------------------------------------------------------------- */
/* Queries                                                                */
/* ---------------------------------------------------------------------- */

export async function fetchApplicationsForUser(user: User): Promise<ApplicationRow[]> {
  faultGuard();
  await delay();
  faultGuard();
  return scopedApplications(user).map(hydrate);
}

export async function fetchApplicationForUser(
  user: User,
  applicationId: string,
): Promise<ApplicationRow> {
  faultGuard();
  await delay();
  faultGuard();
  const application = getApplication(applicationId);
  enforceApplicationScope(user, application);
  return hydrate(application);
}

export async function fetchPharmaciesForUser(user: User): Promise<PharmacyRow[]> {
  faultGuard();
  await delay();
  faultGuard();
  const state = useAppStore.getState();
  const appCount = (pharmacyId: string, scopeIds: string[]) =>
    state.applications.filter(
      (a) => a.pharmacyId === pharmacyId && scopeIds.includes(a.pharmacyId),
    ).length;

  let ids: string[];
  switch (user.role) {
    case "super_admin":
    case "moderator":
      ids = state.pharmacies.map((p) => p.id);
      break;
    case "pharmacy_association_admin":
      ids = state.pharmacies
        .filter((p) => p.associationId === user.associationId)
        .map((p) => p.id);
      break;
    case "pharmacy_worker":
      ids = user.pharmacyId ? [user.pharmacyId] : [];
      break;
  }
  return state.pharmacies
    .filter((p) => ids.includes(p.id))
    .map((p) => ({
      pharmacy: p,
      association: state.associations.find((a) => a.id === p.associationId) ?? fallbackAssociation(p.associationId),
      applicationCount: appCount(p.id, ids),
    }));
}

export async function fetchAssociationsForUser(user: User): Promise<AssociationRow[]> {
  faultGuard();
  await delay();
  faultGuard();
  const state = useAppStore.getState();
  const scope = user.role === "pharmacy_association_admin" ? user.associationId : undefined;
  const associations = state.associations.filter((a) => !scope || a.id === scope);
  return associations.map((association) => {
    const pharmacies = state.pharmacies.filter((p) => p.associationId === association.id);
    const applicationCount = state.applications.filter(
      (a) => a.associationId === association.id,
    ).length;
    return { association, pharmacyCount: pharmacies.length, applicationCount };
  });
}

export async function fetchUsersForUser(user: User): Promise<User[]> {
  faultGuard();
  await delay();
  faultGuard();
  if (!can(user, "manageUsers")) return [];
  const state = useAppStore.getState();
  const visible =
    user.role === "super_admin"
      ? state.users
      : state.users.filter((u) => u.associationId === user.associationId);
  return [...visible].sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchReportForApplication(
  user: User,
  applicationId: string,
): Promise<Report | null> {
  faultGuard();
  await delay();
  faultGuard();
  const application = getApplication(applicationId);
  enforceApplicationScope(user, application);
  if (!application.reportId) return null;
  return useAppStore.getState().reports.find((r) => r.id === application.reportId) ?? null;
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
    scopeLabel: scopeLabelFor(user),
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

function scopeLabelFor(user: User): string {
  switch (user.role) {
    case "super_admin":
      return "All associations";
    case "moderator":
      return "All associations · read-only";
    case "pharmacy_association_admin": {
      const association = useAppStore.getState().associations.find((a) => a.id === user.associationId);
      return association ? association.name : "Association";
    }
    case "pharmacy_worker": {
      const pharmacy = useAppStore.getState().pharmacies.find((p) => p.id === user.pharmacyId);
      return pharmacy ? pharmacy.name : "Unassigned pharmacy";
    }
  }
}

/* ---------------------------------------------------------------------- */
/* Mutations                                                               */
/* ---------------------------------------------------------------------- */

function assertUserIsCurrent(user: User): void {
  if (useAppStore.getState().currentUserId !== user.id) {
    throw new PermissionError("The acting identity has changed; please retry.", user, "viewAllData");
  }
}

export interface CreateApplicationInput {
  title: string;
  pharmacyId: string;
  files: ApplicationFile[];
}

export function createApplication(input: CreateApplicationInput, user: User): Application {
  assertUserIsCurrent(user);
  requirePermission(user, "createApplication", { pharmacyId: input.pharmacyId });
  const state = useAppStore.getState();
  const pharmacy = state.pharmacies.find((p) => p.id === input.pharmacyId);
  if (!pharmacy) {
    throw new DataError("not_found", `Pharmacy "${input.pharmacyId}" does not exist in the dataset.`);
  }
  if (
    user.role === "pharmacy_association_admin" &&
    pharmacy.associationId !== user.associationId
  ) {
    throw new PermissionError(
      `${user.name} can only submit filings for pharmacies in their own association.`,
      user,
      "createApplication",
    );
  }
  if (user.role === "pharmacy_worker" && pharmacy.id !== user.pharmacyId) {
    throw new PermissionError(
      `${user.name} can only submit filings for their own pharmacy.`,
      user,
      "createApplication",
    );
  }
  const id = nextIdWithPrefix("AP-2026-", state.applications);
  const stamped = nowIso();
  const application: Application = {
    id,
    title: input.title,
    pharmacyId: pharmacy.id,
    associationId: pharmacy.associationId,
    submittedBy: user.id,
    files: input.files,
    status: "pending",
    submittedAt: stamped,
    updatedAt: stamped,
    history: [
      {
        to: "pending",
        changedById: user.id,
        changedAt: stamped,
        note: `Received ${input.files.length} file(s) through the intake form (${input.files.length} ledger row(s)).`,
      },
    ],
  };
  useAppStore.setState({ applications: [application, ...state.applications] });
  markMutated();
  return application;
}

export interface AttachReportInput {
  affirmIssues?: string;
}

export function attachReport(applicationId: string, user: User, input?: AttachReportInput): Report {
  assertUserIsCurrent(user);
  requirePermission(user, "attachReport");
  const state = useAppStore.getState();
  const application = getApplication(applicationId);
  enforceApplicationScope(user, application);

  const report = synthesizeReport(application, user);
  const stamped = nowIso();
  const historyEntry = {
    to: "reported" as ApplicationStatus,
    changedById: user.id,
    changedAt: stamped,
    note:
      input?.affirmIssues?.trim() ||
      "Report generated from review findings and attached to the filing.",
  };

  const applications = state.applications.map((a) =>
    a.id === applicationId
      ? {
          ...a,
          status: "reported" as ApplicationStatus,
          updatedAt: stamped,
          reportId: report.id,
          history: [...a.history.filter((e) => e.to !== "reported"), historyEntry],
        }
      : a,
  );
  const reports = [
    ...state.reports.filter((r) => r.id !== report.id),
    report,
  ];
  useAppStore.setState({ applications, reports });
  markMutated();
  return report;
}

export function updateApplicationStatus(
  applicationId: string,
  to: ApplicationStatus,
  user: User,
  note?: string,
): Application {
  assertUserIsCurrent(user);
  requirePermission(user, "updateApplicationStatus");
  const state = useAppStore.getState();
  const application = getApplication(applicationId);
  enforceApplicationScope(user, application);
  if (application.status === to) return application;

  const stamped = nowIso();
  const noteText =
    note?.trim() ||
    (to === "in_review"
      ? "Passed initial triage; assigned for review."
      : to === "rejected"
        ? "Reviewed and rejected against the filing manifest."
        : "Status advanced.");

  const updated: Application = {
    ...application,
    status: to,
    updatedAt: stamped,
    history: [
      ...application.history,
      { to, changedById: user.id, changedAt: stamped, note: noteText },
    ],
  };
  useAppStore.setState({
    applications: state.applications.map((a) => (a.id === applicationId ? updated : a)),
  });
  markMutated();
  return updated;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: User["role"];
  associationId: string;
  pharmacyId?: string;
  status?: User["status"];
}

function validateUserScope(user: User, target: CreateUserInput): void {
  requirePermission(user, "manageUsers", { associationId: target.associationId });
  if (user.role === "pharmacy_association_admin") {
    if (target.associationId !== user.associationId) {
      throw new PermissionError(
        `${user.name} can only invite users into their own association.`,
        user,
        "manageUsers",
      );
    }
    if (target.role === "super_admin" || target.role === "moderator") {
      throw new PermissionError(
        "Association admins cannot grant elevated roles.",
        user,
        "manageUsers",
      );
    }
  }
  if (target.pharmacyId) {
    const pharmacy = useAppStore.getState().pharmacies.find((p) => p.id === target.pharmacyId);
    if (!pharmacy || pharmacy.associationId !== target.associationId) {
      throw new PermissionError(
        "The pharmacy must belong to the selected association.",
        user,
        "manageUsers",
      );
    }
  }
}

export function inviteUser(input: CreateUserInput, user: User): User {
  assertUserIsCurrent(user);
  validateUserScope(user, input);
  const state = useAppStore.getState();
  if (state.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    throw new DataError("not_found", `A user with email ${input.email} already exists.`);
  }
  const id = nextIdWithPrefix("u-", state.users);
  const created: User = {
    id,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: input.role,
    associationId: input.associationId,
    pharmacyId: input.pharmacyId,
    status: input.status ?? "invited",
    createdAt: nowIso(),
  };
  useAppStore.setState({ users: [...state.users, created] });
  markMutated();
  return created;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: User["role"];
  associationId?: string;
  pharmacyId?: string | null;
  status?: User["status"];
}

export function updateUser(userId: string, patch: UpdateUserInput, user: User): User {
  assertUserIsCurrent(user);
  const state = useAppStore.getState();
  const target = state.users.find((u) => u.id === userId);
  if (!target) throw new DataError("not_found", `User "${userId}" does not exist.`);
  if (target.role === "super_admin" && user.role !== "super_admin") {
    throw new PermissionError("Only super admins can modify super admins.", user, "manageUsers");
  }
  const effectiveAssociation = patch.associationId ?? target.associationId ?? "";
  validateUserScope(user, {
    name: target.name,
    email: target.email,
    role: patch.role ?? target.role,
    associationId: effectiveAssociation,
    pharmacyId: patch.pharmacyId === null ? undefined : (patch.pharmacyId ?? target.pharmacyId),
    status: target.status,
  });

  const seenEmail = state.users.some(
    (u) => u.id !== userId && u.email.toLowerCase() === (patch.email ?? target.email).toLowerCase(),
  );
  if (seenEmail) throw new DataError("not_found", "A different user already uses that email.");

  const updated: User = {
    ...target,
    name: patch.name ?? target.name,
    email: (patch.email ?? target.email).toLowerCase(),
    role: patch.role ?? target.role,
    associationId: effectiveAssociation || undefined,
    pharmacyId: patch.pharmacyId === null ? undefined : (patch.pharmacyId ?? target.pharmacyId),
    status: patch.status ?? target.status,
  };
  useAppStore.setState({
    users: state.users.map((u) => (u.id === userId ? updated : u)),
  });
  markMutated();
  return updated;
}

export function removeUser(userId: string, user: User): void {
  assertUserIsCurrent(user);
  if (userId === user.id) {
    throw new DataError("not_found", "You cannot remove the identity you are acting as.");
  }
  const state = useAppStore.getState();
  const target = state.users.find((u) => u.id === userId);
  if (!target) throw new DataError("not_found", `User "${userId}" does not exist.`);
  requirePermission(user, "manageUsers", { associationId: target.associationId });
  useAppStore.setState({ users: state.users.filter((u) => u.id !== userId) });
  markMutated();
}

/** Public/marketing signup: creates a scoped worker account and returns it. */
export function createAccount(input: { name: string; email: string }): User {
  const state = useAppStore.getState();
  if (state.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
    throw new DataError("not_found", "An account with that email already exists.");
  }
  const id = nextIdWithPrefix("u-", state.users);
  const created: User = {
    id,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: "pharmacy_worker",
    status: "active",
    createdAt: nowIso(),
  };
  useAppStore.setState({ users: [...state.users, created] });
  markMutated();
  return created;
}

export function findUserByEmail(email: string): User | null {
  const match = useAppStore
    .getState()
    .users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
  return match ?? null;
}

export interface CreateAssociationInput {
  name: string;
  region: string;
  gmpCertificateId: string;
}

export function createAssociation(input: CreateAssociationInput & { status?: PharmacyAssociation["status"] }, user: User): PharmacyAssociation {
  assertUserIsCurrent(user);
  requirePermission(user, "manageAssociations");
  const state = useAppStore.getState();
  const id = nextIdWithPrefix("assoc-", state.associations);
  const created: PharmacyAssociation = {
    id,
    name: input.name.trim(),
    region: input.region.trim(),
    gmpCertificateId: input.gmpCertificateId.trim(),
    status: input.status ?? "active",
    createdAt: nowIso(),
  };
  useAppStore.setState({ associations: [...state.associations, created] });
  markMutated();
  return created;
}

export function updateAssociation(
  associationId: string,
  patch: Partial<CreateAssociationInput> & { status?: PharmacyAssociation["status"] },
  user: User,
): PharmacyAssociation {
  assertUserIsCurrent(user);
  requirePermission(user, "manageAssociations");
  const state = useAppStore.getState();
  const target = state.associations.find((a) => a.id === associationId);
  if (!target) throw new DataError("not_found", `Association "${associationId}" does not exist.`);
  const updated = { ...target, ...patch, name: patch.name?.trim() ?? target.name };
  useAppStore.setState({
    associations: state.associations.map((a) => (a.id === associationId ? updated : a)),
  });
  markMutated();
  return updated;
}

export function deleteAssociation(associationId: string, user: User): void {
  assertUserIsCurrent(user);
  requirePermission(user, "manageAssociations");
  const state = useAppStore.getState();
  const target = state.associations.find((a) => a.id === associationId);
  if (!target) throw new DataError("not_found", `Association "${associationId}" does not exist.`);

  const pharmacyIds = state.pharmacies.filter((p) => p.associationId === associationId).map((p) => p.id);
  const applicationIds = state.applications
    .filter((a) => pharmacyIds.includes(a.pharmacyId))
    .map((a) => a.id);

  useAppStore.setState({
    associations: state.associations.filter((a) => a.id !== associationId),
    pharmacies: state.pharmacies.filter((p) => p.associationId !== associationId),
    applications: state.applications.filter((a) => !applicationIds.includes(a.id)),
    reports: state.reports.filter((r) => !applicationIds.includes(r.applicationId)),
    users: state.users.map((u) =>
      u.associationId === associationId ? { ...u, status: "disabled" as const } : u,
    ),
  });
  markMutated();
}

export interface CreatePharmacyInput {
  name: string;
  address: string;
  licenseNumber: string;
  associationId: string;
}

export function createPharmacy(input: CreatePharmacyInput & { status?: Pharmacy["status"] }, user: User): Pharmacy {
  assertUserIsCurrent(user);
  requirePermission(user, "managePharmacies");
  const state = useAppStore.getState();
  if (!state.associations.some((a) => a.id === input.associationId)) {
    throw new DataError("not_found", "The selected association does not exist.");
  }
  if (state.pharmacies.some((p) => p.licenseNumber.toLowerCase() === input.licenseNumber.toLowerCase())) {
    throw new DataError("not_found", `A pharmacy with license ${input.licenseNumber} already exists.`);
  }
  const id = nextIdWithPrefix("ph-", state.pharmacies);
  const created: Pharmacy = {
    id,
    name: input.name.trim(),
    address: input.address.trim(),
    licenseNumber: input.licenseNumber.trim(),
    associationId: input.associationId,
    status: input.status ?? "active",
    createdAt: nowIso(),
  };
  useAppStore.setState({ pharmacies: [...state.pharmacies, created] });
  markMutated();
  return created;
}

export function updatePharmacy(
  pharmacyId: string,
  patch: Partial<CreatePharmacyInput> & { status?: Pharmacy["status"] },
  user: User,
): Pharmacy {
  assertUserIsCurrent(user);
  requirePermission(user, "managePharmacies");
  const state = useAppStore.getState();
  const target = state.pharmacies.find((p) => p.id === pharmacyId);
  if (!target) throw new DataError("not_found", `Pharmacy "${pharmacyId}" does not exist.`);
  if (patch.associationId && !state.associations.some((a) => a.id === patch.associationId)) {
    throw new DataError("not_found", "The selected association does not exist.");
  }
  const updated: Pharmacy = { ...target, ...patch, name: patch.name?.trim() ?? target.name };
  useAppStore.setState({
    pharmacies: state.pharmacies.map((p) => (p.id === pharmacyId ? updated : p)),
  });
  markMutated();
  return updated;
}

export function deletePharmacy(pharmacyId: string, user: User): void {
  assertUserIsCurrent(user);
  requirePermission(user, "managePharmacies");
  const state = useAppStore.getState();
  if (!state.pharmacies.some((p) => p.id === pharmacyId)) {
    throw new DataError("not_found", `Pharmacy "${pharmacyId}" does not exist.`);
  }
  const applicationIds = state.applications
    .filter((a) => a.pharmacyId === pharmacyId)
    .map((a) => a.id);
  useAppStore.setState({
    pharmacies: state.pharmacies.filter((p) => p.id !== pharmacyId),
    applications: state.applications.filter((a) => a.pharmacyId !== pharmacyId),
    reports: state.reports.filter((r) => !applicationIds.includes(r.applicationId)),
    users: state.users.map((u) => (u.pharmacyId === pharmacyId ? { ...u, pharmacyId: undefined } : u)),
  });
  markMutated();
}

/* ---------------------------------------------------------------------- */
/* Report synthesis (the mock "review engine")                             */
/* ---------------------------------------------------------------------- */

function synthesizeReport(application: Application, user: User): Report {
  const records = application.files.reduce((sum, f) => sum + f.rowCount, 0);
  const invalidFiles = application.files.filter((f) => f.validationState === "invalid");
  const warnFiles = application.files.filter((f) => f.validationState === "warning");
  const hash = hashStr(application.id);

  const base = 97 - warnFiles.length * 2.4 - invalidFiles.length * 13;
  const quality = Math.min(99.5, Math.max(68, base - (records % 7) * 0.3));
  const batchCoverage = Math.min(100, Math.max(95, 99.7 - warnFiles.length * 0.5 - (hash % 10) * 0.06));
  const lateFlags = (hash % 9) + (invalidFiles.length > 0 ? 3 : 0);
  const critical = invalidFiles.length + (warnFiles.length > 0 ? (hash % 2 === 0 ? 1 : 0) : 0);
  const grade =
    invalidFiles.length > 0 ? "Non-compliant" : warnFiles.length > 0 ? "Compliant — with caveats" : "Compliant";

  const resultData: ReportResultData = {
    "Layout grade": grade,
    "Records examined": records,
    "Data quality score": `${quality.toFixed(1)}%`,
    "Critical deviations": critical,
    "Late-dispense flags": lateFlags,
    "Batch coverage": `${batchCoverage.toFixed(1)}%`,
    "Schema version": "RxFill 2.5",
  };

  return {
    id: `RPT-${application.id}`,
    applicationId: application.id,
    status: "final",
    resultData,
    generatedBy: user.id,
    generatedAt: nowIso(),
    rawData: JSON.stringify(
      {
        schema: "RxFill",
        version: "2.5",
        examined: records,
        files: application.files.map((f) => ({
          file: f.filename,
          rows: f.rowCount,
          validation: f.validationState,
        })),
        critical,
        lateFlags,
        batchCoverage: Number(batchCoverage.toFixed(1)),
        generatedBy: user.id,
        generatedAt: nowIso(),
      },
      null,
      2,
    ),
  };
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