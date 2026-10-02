import type {
  ApplicationStatus,
  FileKind,
  FileValidationState,
  PharmacyAssociation,
  Pharmacy,
  Report,
  StatusEvent,
  User,
} from "./types";

const iso = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export const seedUsers: User[] = [
  {
    id: "u-sa-1",
    name: "Dana Whitfield",
    email: "dana.whitfield@requis.dev",
    role: "super_admin",
    status: "active",
    createdAt: iso(2025, 11, 2),
  },
  {
    id: "u-sa-2",
    name: "Marcus Bell",
    email: "marcus.bell@requis.dev",
    role: "super_admin",
    status: "active",
    createdAt: iso(2025, 12, 9),
  },
  {
    id: "u-mo-1",
    name: "Priya Raman",
    email: "priya.raman@requis.dev",
    role: "moderator",
    status: "active",
    createdAt: iso(2026, 1, 14),
  },
  {
    id: "u-mo-2",
    name: "Tom Okonkwo",
    email: "tom.okonkwo@requis.dev",
    role: "moderator",
    status: "active",
    createdAt: iso(2026, 2, 1),
  },
  {
    id: "u-aa-1",
    name: "Elena Vasquez",
    email: "elena.vasquez@twinharbors.org",
    role: "pharmacy_association_admin",
    associationId: "assoc-001",
    status: "active",
    createdAt: iso(2025, 10, 19),
  },
  {
    id: "u-aa-2",
    name: "Gregory Hahn",
    email: "gregory.hahn@meridiancare.org",
    role: "pharmacy_association_admin",
    associationId: "assoc-002",
    status: "active",
    createdAt: iso(2026, 2, 27),
  },
  {
    id: "u-w-1",
    name: "Sara Lindqvist",
    email: "sara.lindqvist@alderst.com",
    role: "pharmacy_worker",
    associationId: "assoc-001",
    pharmacyId: "ph-101",
    status: "active",
    createdAt: iso(2026, 4, 8),
  },
  {
    id: "u-w-2",
    name: "James Kim",
    email: "james.kim@willamettecomp.com",
    role: "pharmacy_worker",
    associationId: "assoc-001",
    pharmacyId: "ph-102",
    status: "active",
    createdAt: iso(2026, 5, 21),
  },
  {
    id: "u-w-3",
    name: "David Osei",
    email: "david.osei@cascadcc.org",
    role: "pharmacy_worker",
    associationId: "assoc-001",
    pharmacyId: "ph-103",
    status: "active",
    createdAt: iso(2026, 6, 11),
  },
  {
    id: "u-w-4",
    name: "Nadia Haddad",
    email: "nadia.haddad@harborviewrx.com",
    role: "pharmacy_worker",
    associationId: "assoc-002",
    pharmacyId: "ph-201",
    status: "active",
    createdAt: iso(2026, 3, 3),
  },
  {
    id: "u-w-5",
    name: "Angela Rowe",
    email: "angela.rowe@northpointrx.com",
    role: "pharmacy_worker",
    associationId: "assoc-002",
    pharmacyId: "ph-202",
    status: "active",
    createdAt: iso(2026, 8, 30),
  },
];

/* ------------------------------------------------------------------ */
/* Associations                                                        */
/* ------------------------------------------------------------------ */

export const seedAssociations: PharmacyAssociation[] = [
  {
    id: "assoc-001",
    name: "Twin Harbors Pharmacy Group",
    region: "Pacific Northwest",
    gmpCertificateId: "GMP-TH-1140",
    status: "active",
    createdAt: iso(2025, 9, 4),
  },
  {
    id: "assoc-002",
    name: "Meridian Care Alliance",
    region: "Mid-Atlantic",
    gmpCertificateId: "GMP-MC-2291",
    status: "active",
    createdAt: iso(2025, 12, 18),
  },
];

/* ------------------------------------------------------------------ */
/* Pharmacies                                                          */
/* ------------------------------------------------------------------ */

export const seedPharmacies: Pharmacy[] = [
  {
    id: "ph-101",
    associationId: "assoc-001",
    name: "Alder Street Pharmacy",
    address: "401 Alder St, Portland, OR",
    licenseNumber: "PH-OR-44231",
    status: "active",
    createdAt: iso(2025, 9, 22),
  },
  {
    id: "ph-102",
    associationId: "assoc-001",
    name: "Willamette Compounding",
    address: "1120 SE Commercial St, Salem, OR",
    licenseNumber: "PH-OR-55612",
    status: "active",
    createdAt: iso(2026, 1, 30),
  },
  {
    id: "ph-103",
    associationId: "assoc-001",
    name: "Cascade Community Care",
    address: "882 NE Revere Ave, Bend, OR",
    licenseNumber: "PH-OR-61048",
    status: "active",
    createdAt: iso(2026, 4, 14),
  },
  {
    id: "ph-201",
    associationId: "assoc-002",
    name: "Harborview Pharmacy",
    address: "214 Light St, Baltimore, MD",
    licenseNumber: "PH-MD-70221",
    status: "active",
    createdAt: iso(2026, 1, 7),
  },
  {
    id: "ph-202",
    associationId: "assoc-002",
    name: "North Point Rx",
    address: "88 Main St, Annapolis, MD",
    licenseNumber: "PH-MD-71509",
    status: "active",
    createdAt: iso(2026, 8, 11),
  },
];

/* ------------------------------------------------------------------ */
/* Application files                                                   */
/* ------------------------------------------------------------------ */

interface FileSpec {
  name: string;
  kind: FileKind;
  size: number;
  rows: number;
  cols: number;
  columns: string[];
  state: FileValidationState;
  reason: string;
  at: string;
}

const file = (
  name: string,
  kind: FileKind,
  size: number,
  rows: number,
  cols: number,
  columns: string[],
  state: FileValidationState,
  reason: string,
  at: string,
): FileSpec => ({ name, kind, size, rows, cols, columns, state, reason, at });

const COL_DISPENSE = [
  "NDC code",
  "Batch number",
  "Quantity dispensed",
  "Dispense date",
  "Rx number",
];
const COL_WITH_PATIENT = [
  "NDC code",
  "Batch number",
  "Quantity dispensed",
  "Dispense date",
  "Rx number",
  "Patient ID",
  "Days supply",
];
const COL_COMPOUND = [
  "NDC code",
  "Batch number",
  "Quantity dispensed",
  "Dispense date",
  "Dosage form",
  "Prescriber DEA",
  "Refills remaining",
];
const COL_INVENTORY = [
  "NDC code",
  "Batch number",
  "Quantity dispensed",
  "Dispense date",
  "Rx number",
  "Invoice line",
];

const OK = "All rows passed schema checks against the registered filing manifest.";
const WARN_LOT = "614 rows carry a missing Batch number value; schema-level completeness at risk.";
const WARN_DATE = "Date format inconsistent at row 218; normalized on intake.";
const BAD_DATE = "Dispense date out of range (year 2023) at row 441; outside reporting window.";

const FILE_SPECS: FileSpec[] = [
  // Twin Harbors · Alder Street
  file("dispensing_2026_wk34_alderst.csv", "csv", 842_000, 1248, 5, COL_DISPENSE, "valid", OK, iso(2026, 8, 20, 10)),
  file("ndc_batch_controlled_0819.xlsx", "xlsx", 2_124_000, 3984, 7, COL_WITH_PATIENT, "valid", OK, iso(2026, 8, 20, 10)),
  file("dispensing_2026_wk35_alderst.csv", "csv", 910_000, 1402, 5, COL_DISPENSE, "valid", OK, iso(2026, 8, 27, 9)),
  file("opioid_dispense_review_0902.xlsx", "xlsx", 1_876_000, 3011, 6, COL_WITH_PATIENT, "warning", WARN_LOT, iso(2026, 9, 2, 14)),
  file("ndc_schedule2_0908.xlsx", "xlsx", 2_688_000, 4540, 6, COL_WITH_PATIENT, "warning", WARN_DATE, iso(2026, 9, 8, 16)),
  // Twin Harbors · Willamette Compounding
  file("dispensing_2026_q3_willem.csv", "csv", 611_000, 877, 5, COL_DISPENSE, "valid", OK, iso(2026, 8, 19, 11)),
  file("compounding_master_batch.xlsx", "xlsx", 1_543_000, 2166, 7, COL_COMPOUND, "valid", OK, iso(2026, 8, 19, 11)),
  file("dispensing_2026_sep_week1.csv", "csv", 730_000, 1129, 5, COL_DISPENSE, "valid", OK, iso(2026, 9, 4, 15)),
  // Twin Harbors · Cascade
  file("cascade_q3_dispense_log.csv", "csv", 422_000, 640, 5, COL_DISPENSE, "valid", OK, iso(2026, 9, 15, 8)),
  file("cascade_inventory_0904.xlsx", "xlsx", 1_320_000, 1745, 6, COL_INVENTORY, "valid", OK, iso(2026, 9, 15, 8)),
  // Meridian · Harborview
  file("harborview_weekly_0616.csv", "csv", 990_000, 1476, 5, COL_DISPENSE, "valid", OK, iso(2026, 6, 16, 9)),
  file("harborview_weekly_0623.csv", "csv", 940_000, 1390, 5, COL_DISPENSE, "valid", OK, iso(2026, 6, 23, 9)),
  file("harborview_weekly_0707.xlsx", "xlsx", 1_500_000, 2004, 6, COL_WITH_PATIENT, "valid", OK, iso(2026, 7, 7, 10)),
  file("harborview_weekly_0714.csv", "csv", 889_000, 1330, 5, COL_DISPENSE, "valid", OK, iso(2026, 7, 14, 9)),
  file("harborview_weekly_0721.csv", "csv", 861_000, 1280, 5, COL_DISPENSE, "warning", WARN_LOT, iso(2026, 7, 21, 9)),
  file("harborview_weekly_0804.xlsx", "xlsx", 1_710_000, 2410, 6, COL_WITH_PATIENT, "valid", OK, iso(2026, 8, 4, 10)),
  file("harborview_weekly_0811.csv", "csv", 900_000, 1355, 5, COL_DISPENSE, "valid", OK, iso(2026, 8, 11, 9)),
  file("harborview_weekly_0818.csv", "csv", 918_000, 1400, 5, COL_DISPENSE, "valid", OK, iso(2026, 8, 18, 9)),
  file("harborview_weekly_0825.csv", "csv", 872_000, 1311, 5, COL_DISPENSE, "invalid", BAD_DATE, iso(2026, 8, 25, 9)),
  file("harborview_weekly_0908.csv", "csv", 851_000, 1290, 5, COL_DISPENSE, "valid", OK, iso(2026, 9, 8, 9)),
  file("harborview_weekly_0915.csv", "csv", 903_000, 1388, 5, COL_DISPENSE, "valid", OK, iso(2026, 9, 15, 9)),
  // Meridian Care · North Point Rx
  file("northpoint_weekly_0728.csv", "csv", 780_000, 1210, 5, COL_DISPENSE, "valid", OK, iso(2026, 7, 29, 8, 30)),
  file("semaglutide_dispensing_0826.xlsx", "xlsx", 1_640_000, 2240, 6, COL_WITH_PATIENT, "warning", WARN_LOT, iso(2026, 8, 26, 10, 45)),
  file("northpoint_weekly_0908.csv", "csv", 812_000, 1265, 5, COL_DISPENSE, "valid", OK, iso(2026, 9, 9, 8, 15)),
];

/** Build an ApplicationFile row from a FileSpec. */
function buildFiles(specs: FileSpec[], applicationId: string): import("./types").ApplicationFile[] {
  return specs.map((s, i) => ({
    id: `${s.name}-${i}`,
    filename: s.name,
    // Same shape the real serializer emits. These rows are demo fixtures whose
    // ids are not uuids and which hold no stored bytes, so `downloadable` is
    // false and the ledger shows "No file stored" rather than a link that
    // answers 404 — exactly as the route would.
    downloadable: false,
    downloadUrl: `/api/applications/${applicationId}/files/${s.name}-${i}/content`,
    sizeBytes: s.size,
    kind: s.kind,
    rowCount: s.rows,
    columnCount: s.cols,
    detectedColumns: s.columns,
    validationState: s.state,
    validationReason: s.reason,
    uploadedAt: s.at,
  }));
}

/* ------------------------------------------------------------------ */
/* Application seeds                                                   */
/* ------------------------------------------------------------------ */

interface AppSeed {
  id: string;
  title: string;
  pharmacyId: string;
  submittedBy: string;
  submittedAt: string;
  fileRefs: number[];
  status: "pending" | "in_review" | "reported" | "rejected";
  reviewedBy?: string;
  reviewedAt?: string;
  reportedBy?: string;
  reportedAt?: string;
  reportData?: Record<string, string>;
  rawData?: string;
  note?: string;
}

const APPS: AppSeed[] = [
  /* ---- Twin Harbors · Alder Street (ph-101) ---- */
  {
    id: "AP-2026-2601",
    title: "Controlled substance fill log · week of Aug 17",
    pharmacyId: "ph-101",
    submittedBy: "u-w-1",
    submittedAt: iso(2026, 8, 20, 10),
    fileRefs: [0, 1],
    status: "in_review",
    reviewedAt: iso(2026, 8, 21, 13),
    reviewedBy: "u-mo-1",
  },
  {
    id: "AP-2026-2602",
    title: "Dispensing record · week of Aug 24",
    pharmacyId: "ph-101",
    submittedBy: "u-w-1",
    submittedAt: iso(2026, 8, 27, 9),
    fileRefs: [2],
    status: "reported",
    reportedAt: iso(2026, 8, 29, 11),
    reportedBy: "u-sa-1",
    reportData: {
      "Layout grade": "Compliant",
      "Records examined": "1,402",
      "Data quality score": "97.1%",
      "Critical deviations": "0",
      "Late-dispense flags": "1",
      "Batch coverage": "100.0%",
      "Schema version": "RxFill 2.4",
    },
    rawData: JSON.stringify({ schema: "RxFill", version: "2.4", examined: 1402, critical: 0, lateFlags: 1 }),
  },
  {
    id: "AP-2026-2603",
    title: "Opioid dispense review · September intake",
    pharmacyId: "ph-101",
    submittedBy: "u-w-1",
    submittedAt: iso(2026, 9, 2, 14),
    fileRefs: [3],
    status: "reported",
    reportedAt: iso(2026, 9, 5, 9),
    reportedBy: "u-sa-1",
    reportData: {
      "Layout grade": "Compliant — with caveats",
      "Records examined": "3,011",
      "Data quality score": "92.0%",
      "Critical deviations": "1",
      "Late-dispense flags": "7",
      "Batch coverage": "99.4%",
      "Schema version": "RxFill 2.4",
    },
    rawData: JSON.stringify({ schema: "RxFill", version: "2.4", examined: 3011, critical: 1, lateFlags: 7, batchCoverage: 99.4 }),
  },
  {
    id: "AP-2026-2604",
    title: "Week of Sep 7 · batch closure",
    pharmacyId: "ph-101",
    submittedBy: "u-w-1",
    submittedAt: iso(2026, 9, 8, 16),
    fileRefs: [4],
    status: "reported",
    reportedAt: iso(2026, 9, 11, 10),
    reportedBy: "u-sa-1",
    reportData: {
      "Layout grade": "Compliant",
      "Records examined": "4,540",
      "Data quality score": "95.5%",
      "Critical deviations": "0",
      "Late-dispense flags": "2",
      "Batch coverage": "100.0%",
      "Schema version": "RxFill 2.5",
    },
    rawData: JSON.stringify({ schema: "RxFill", version: "2.5", examined: 4540, critical: 0, lateFlags: 2 }),
  },
  /* ---- Twin Harbors · Willamette Compounding (ph-102) ---- */
  {
    id: "AP-2026-2605",
    title: "Q3 dispensing aggregate",
    pharmacyId: "ph-102",
    submittedBy: "u-w-2",
    submittedAt: iso(2026, 8, 19, 11),
    fileRefs: [5, 6],
    status: "in_review",
    reviewedAt: iso(2026, 8, 25, 15),
    reviewedBy: "u-mo-2",
  },
  {
    id: "AP-2026-2606",
    title: "Dispensing · week of Sep 1",
    pharmacyId: "ph-102",
    submittedBy: "u-w-2",
    submittedAt: iso(2026, 9, 4, 15),
    fileRefs: [7],
    status: "reported",
    reportedAt: iso(2026, 9, 8, 14),
    reportedBy: "u-sa-2",
    reportData: {
      "Layout grade": "Compliant",
      "Records examined": "1,129",
      "Data quality score": "96.3%",
      "Critical deviations": "0",
      "Late-dispense flags": "0",
      "Batch coverage": "100.0%",
      "Schema version": "RxFill 2.4",
    },
    rawData: JSON.stringify({ schema: "RxFill", version: "2.4", examined: 1129, critical: 0, lateFlags: 0 }),
  },
  {
    id: "AP-2026-2607",
    title: "Schedule II controls · duplicate filing",
    pharmacyId: "ph-102",
    submittedBy: "u-w-2",
    submittedAt: iso(2026, 9, 6, 10),
    fileRefs: [7],
    status: "rejected",
    reviewedAt: iso(2026, 9, 6, 17),
    reviewedBy: "u-mo-2",
    note: "Duplicate of AP-2026-2606; archived as rejected without review.",
  },
  /* ---- Twin Harbors · Cascade Community Care (ph-103) ---- */
  {
    id: "AP-2026-2608",
    title: "Q3 dispense log · opening filing",
    pharmacyId: "ph-103",
    submittedBy: "u-w-3",
    submittedAt: iso(2026, 9, 15, 8),
    fileRefs: [8],
    status: "pending",
  },
  {
    id: "AP-2026-2609",
    title: "Inventory reconciliation · September",
    pharmacyId: "ph-103",
    submittedBy: "u-w-3",
    submittedAt: iso(2026, 9, 16, 12),
    fileRefs: [9],
    status: "reported",
    reportedAt: iso(2026, 9, 18, 9),
    reportedBy: "u-sa-1",
    reportData: {
      "Layout grade": "Compliant",
      "Records examined": "1,745",
      "Data quality score": "94.8%",
      "Critical deviations": "0",
      "Late-dispense flags": "0",
      "Batch coverage": "99.9%",
      "Schema version": "RxFill 2.5",
    },
    rawData: JSON.stringify({ schema: "RxFill", version: "2.5", examined: 1745, critical: 0, lateFlags: 0 }),
  },
  /* ---- Meridian · Harborview (ph-201) ---- */
  {
    id: "AP-2026-2610",
    title: "Weekly dispensing · Jun 16 window",
    pharmacyId: "ph-201",
    submittedBy: "u-w-4",
    submittedAt: iso(2026, 6, 16, 9),
    fileRefs: [10],
    status: "reported",
    reportedAt: iso(2026, 6, 19, 13),
    reportedBy: "u-sa-2",
    reportData: {
      "Layout grade": "Compliant",
      "Records examined": "1,476",
      "Data quality score": "96.0%",
      "Critical deviations": "0",
      "Late-dispense flags": "0",
      "Batch coverage": "99.8%",
      "Schema version": "RxFill 2.3",
    },
    rawData: JSON.stringify({ schema: "RxFill", version: "2.3", examined: 1476, critical: 0, lateFlags: 0 }),
  },
  {
    id: "AP-2026-2611",
    title: "Weekly dispensing · Jun 23 window",
    pharmacyId: "ph-201",
    submittedBy: "u-w-4",
    submittedAt: iso(2026, 6, 23, 9),
    fileRefs: [11],
    status: "pending",
  },
  {
    id: "AP-2026-2612",
    title: "July intake · consolidated weeks 29–30",
    pharmacyId: "ph-201",
    submittedBy: "u-w-4",
    submittedAt: iso(2026, 7, 14, 9),
    fileRefs: [13, 14],
    status: "in_review",
    reviewedAt: iso(2026, 7, 16, 16),
    reviewedBy: "u-mo-1",
  },
  {
    id: "AP-2026-2613",
    title: "Weekly dispensing · Aug 4 window",
    pharmacyId: "ph-201",
    submittedBy: "u-w-4",
    submittedAt: iso(2026, 8, 4, 10),
    fileRefs: [15],
    status: "reported",
    reportedAt: iso(2026, 8, 6, 11),
    reportedBy: "u-sa-1",
    reportData: {
      "Layout grade": "Compliant — with caveats",
      "Records examined": "2,410",
      "Data quality score": "91.4%",
      "Critical deviations": "0",
      "Late-dispense flags": "5",
      "Batch coverage": "98.6%",
      "Schema version": "RxFill 2.4",
    },
    rawData: JSON.stringify({ schema: "RxFill", version: "2.4", examined: 2410, critical: 0, lateFlags: 5 }),
  },
  {
    id: "AP-2026-2614",
    title: "Weekly dispensing · Aug 18 window",
    pharmacyId: "ph-201",
    submittedBy: "u-w-4",
    submittedAt: iso(2026, 8, 18, 9),
    fileRefs: [17],
    status: "pending",
  },
  {
    id: "AP-2026-2615",
    title: "Weekly dispensing · Sep 8 window",
    pharmacyId: "ph-201",
    submittedBy: "u-w-4",
    submittedAt: iso(2026, 9, 8, 9),
    fileRefs: [19],
    status: "reported",
    reportedAt: iso(2026, 9, 10, 12),
    reportedBy: "u-sa-1",
    reportData: {
      "Layout grade": "Compliant",
      "Records examined": "1,290",
      "Data quality score": "95.9%",
      "Critical deviations": "0",
      "Late-dispense flags": "1",
      "Batch coverage": "100.0%",
      "Schema version": "RxFill 2.5",
    },
    rawData:
      '{"schema":"RxFill","version":"2.5","examined":1290,"critical":0,"lateFlags":1,"note":"TRUNCATED',
  },
  {
    id: "AP-2026-2616",
    title: "Weekly dispensing · Aug 25 window",
    pharmacyId: "ph-201",
    submittedBy: "u-w-4",
    submittedAt: iso(2026, 8, 25, 9),
    fileRefs: [18],
    status: "pending",
  },

  /* ---- Meridian Care · North Point Rx (ph-202) ----
     North Point Rx is the pharmacy that owns the only pharmacy-worker account
     in the fixture set (Angela Rowe, `u-w-5`), and it had no filings at all.
     Logging in as her produced an empty applications list, so the one persona
     the intake flow was built for had nothing to exercise it against. These
     three give her a plausible history: one already delivered, one in review,
     and one just submitted that a reviewer has not looked at yet. */
  {
    id: "AP-2026-2617",
    title: "Weekly dispensing · Jul 28 window",
    pharmacyId: "ph-202",
    submittedBy: "u-w-5",
    submittedAt: iso(2026, 7, 29, 8, 30),
    fileRefs: [21],
    status: "reported",
    reviewedAt: iso(2026, 7, 30, 11),
    reviewedBy: "u-mo-1",
    reportedAt: iso(2026, 7, 31, 9, 15),
    reportedBy: "u-sa-1",
    reportData: {
      "Layout grade": "Compliant",
      "Records examined": "612",
      "Data quality score": "98.4%",
      "Critical deviations": "0",
      "Late-dispense flags": "0",
      "Batch coverage": "100.0%",
      "Schema version": "RxFill 2.4",
    },
  },
  {
    id: "AP-2026-2618",
    title: "Semaglutide dispensing log · August",
    pharmacyId: "ph-202",
    submittedBy: "u-w-5",
    submittedAt: iso(2026, 8, 26, 10, 45),
    fileRefs: [22],
    status: "in_review",
    reviewedAt: iso(2026, 8, 27, 9, 30),
    reviewedBy: "u-mo-1",
  },
  {
    id: "AP-2026-2619",
    title: "Weekly dispensing · Sep 8 window",
    pharmacyId: "ph-202",
    submittedBy: "u-w-5",
    submittedAt: iso(2026, 9, 9, 8, 15),
    fileRefs: [23],
    status: "pending",
  },
];

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

export const seedReports: Report[] = APPS.filter((a) => a.status === "reported").map((a) => ({
  id: `RPT-${a.id}`,
  applicationId: a.id,
  status: "final",
  // `manual` throughout: these are super-admin-attached documents, which is the
  // only source the application can produce today.
  source: "manual",
  resultData: a.reportData ?? {},
  generatedBy: a.reportedBy ?? "u-sa-1",
  generatedAt: a.reportedAt ?? a.submittedAt,
  rawData: a.rawData ?? "{}",
}));

/* ------------------------------------------------------------------ */
/* Applications                                                        */
/* ------------------------------------------------------------------ */

export const seedApplications = APPS.map((a) => {
  const files = buildFiles(
    a.fileRefs.map((i) => FILE_SPECS[i]!),
    a.id,
  );
  const history: StatusEvent[] = [
    {
      to: "pending",
      changedById: a.submittedBy,
      changedAt: a.submittedAt,
      note: "Files submitted through the SiroQ intake form.",
    },
  ];
  if (a.status === "in_review" || a.status === "rejected") {
    history.push({
      to: a.status,
      changedById: a.reviewedBy ?? "u-mo-1",
      changedAt: a.reviewedAt ?? a.submittedAt,
      note:
        a.status === "rejected"
          ? (a.note ?? "Rejected before review.")
          : "Passed initial triage; assigned for review.",
    });
  }
  if (a.status === "reported") {
    history.push({
      to: "in_review",
      changedById: a.reviewedBy ?? "u-mo-1",
      changedAt:
        a.reviewedAt ??
        new Date(new Date(a.submittedAt).getTime() + 1000 * 60 * 60 * 5).toISOString(),
      note: "Passed initial triage; assigned for review.",
    });
    history.push({
      to: "reported",
      changedById: a.reportedBy ?? "u-sa-1",
      changedAt: a.reportedAt ?? a.submittedAt,
      note: "Report generated from review findings and attached to the application.",
    });
  }
  return {
    id: a.id,
    // The mock predates the split between a row's identity and its filing
    // reference: it used the human-readable "AP-2026-####" string as the primary
    // key. The database keeps a UUID in `id` and allocates `reference` from
    // `application_reference_seq`, so the two are mirrored here to keep the
    // in-memory seed shaped like the real rows. This mock is removed in Phase 4.
    reference: a.id,
    title: a.title,
    pharmacyId: a.pharmacyId,
    associationId:
      seedPharmacies.find((p) => p.id === a.pharmacyId)?.associationId ?? "",
    submittedBy: a.submittedBy,
    files,
    status: a.status as ApplicationStatus,
    submittedAt: a.submittedAt,
    updatedAt: a.reportedAt ?? a.reviewedAt ?? a.submittedAt,
    history,
    reportId: a.status === "reported" ? `RPT-${a.id}` : undefined,
  };
});