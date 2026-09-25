export type Role =
  | "super_admin"
  | "moderator"
  | "pharmacy_association_admin"
  | "pharmacy_worker";

export type UserStatus = "active" | "invited" | "disabled";
export type EntityStatus = "active" | "suspended";
export type ApplicationStatus = "pending" | "in_review" | "reported" | "rejected";
export type FileKind = "xlsx" | "csv";
export type FileValidationState = "valid" | "warning" | "invalid";

export interface PharmacyAssociation {
  id: string;
  name: string;
  region: string;
  gmpCertificateId: string;
  status: EntityStatus;
  createdAt: string;
}

export interface Pharmacy {
  id: string;
  associationId: string;
  name: string;
  address: string;
  licenseNumber: string;
  status: EntityStatus;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  associationId?: string;
  pharmacyId?: string;
  status: UserStatus;
  createdAt: string;
}

export interface ApplicationFile {
  id: string;
  filename: string;
  sizeBytes: number;
  kind: FileKind;
  rowCount: number;
  columnCount: number;
  detectedColumns: string[];
  validationState: FileValidationState;
  validationReason: string;
  uploadedAt: string;
}

export interface StatusEvent {
  to: ApplicationStatus;
  changedById: string;
  changedAt: string;
  note?: string;
}

export interface Report {
  id: string;
  applicationId: string;
  resultData: Record<string, string>;
  generatedBy: string;
  generatedAt: string;
  rawData: string;
}

export interface Application {
  id: string;
  title: string;
  pharmacyId: string;
  associationId: string;
  submittedBy: string;
  files: ApplicationFile[];
  status: ApplicationStatus;
  submittedAt: string;
  updatedAt: string;
  history: StatusEvent[];
  reportId?: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super admin",
  moderator: "Moderator",
  pharmacy_association_admin: "Association admin",
  pharmacy_worker: "Pharmacy worker",
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Pending",
  in_review: "In review",
  reported: "Reported",
  rejected: "Rejected",
};