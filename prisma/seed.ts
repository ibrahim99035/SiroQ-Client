/**
 * Seeds the SiroQ Client database from the in-memory fixtures in `lib/seed.ts`.
 *
 * The fixtures use readable ids ("AP-2026-2601", "u-sa-1", "ph-101"); the
 * database uses UUID primary keys. This script keeps an explicit fixture→UUID
 * map and writes each fixture's readable id into `Application.reference`, so the
 * UI keeps showing a filing number instead of a UUID.
 *
 * Every seeded user shares one development password (override with
 * `SEED_PASSWORD`) so each role can be exercised immediately after seeding.
 *
 * Seeded `ApplicationFile` rows carry metadata but no stored bytes: their
 * `storage_driver` is `seed` and `storage_key` is a `seed://` sentinel. The
 * download route answers 404 for sentinel keys instead of pretending a file
 * exists. Uploaded files in normal use have real keys and real bytes.
 */
import { ParseState } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "../lib/db";
import {
  seedApplications,
  seedAssociations,
  seedPharmacies,
  seedReports,
  seedUsers,
} from "../lib/seed";
import type { ApplicationStatus, FileKind } from "../lib/types";

const DEV_PASSWORD = process.env.SEED_PASSWORD ?? "siroq-dev-password";
const SALT_ROUNDS = 12;

/** Deterministic placeholder digest for seeded metadata (no bytes are stored). */
function fixtureChecksum(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i += 1) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i), 2654435761) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`.repeat(4).slice(0, 64);
}

function mimeFor(kind: FileKind): string {
  return kind === "csv"
    ? "text/csv"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

async function main(): Promise<void> {
  console.log("Seeding SiroQ Client…");

  // Wipe in dependency order. Truncate is faster and resets nothing else.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "analysis_runs", "reports", "application_status_events", ' +
      '"uploads", "application_files", "applications", "sessions", ' +
      '"password_reset_tokens", "users", "pharmacies", "pharmacy_associations" ' +
      "RESTART IDENTITY CASCADE",
  );

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  // ------------------------------------------------------------ associations
  const associationByFixtureId = new Map<string, string>();
  for (const association of seedAssociations) {
    const created = await prisma.pharmacyAssociation.create({
      data: {
        name: association.name,
        region: association.region,
        gmpCertificateId: association.gmpCertificateId,
        status: association.status,
        createdAt: new Date(association.createdAt),
      },
      select: { id: true },
    });
    associationByFixtureId.set(association.id, created.id);
  }
  console.log(`  associations: ${associationByFixtureId.size}`);

  // -------------------------------------------------------------- pharmacies
  const pharmacyByFixtureId = new Map<string, string>();
  for (const pharmacy of seedPharmacies) {
    const associationId = associationByFixtureId.get(pharmacy.associationId);
    if (!associationId) throw new Error(`Unknown association ${pharmacy.associationId}`);
    const created = await prisma.pharmacy.create({
      data: {
        associationId,
        name: pharmacy.name,
        address: pharmacy.address,
        licenseNumber: pharmacy.licenseNumber,
        status: pharmacy.status,
        createdAt: new Date(pharmacy.createdAt),
      },
      select: { id: true },
    });
    pharmacyByFixtureId.set(pharmacy.id, created.id);
  }
  console.log(`  pharmacies: ${pharmacyByFixtureId.size}`);

  // ------------------------------------------------------------------- users
  const userByFixtureId = new Map<string, string>();
  for (const user of seedUsers) {
    const created = await prisma.user.create({
      data: {
        email: user.email.toLowerCase(),
        name: user.name,
        passwordHash,
        role: user.role,
        status: user.status,
        associationId: user.associationId
          ? (associationByFixtureId.get(user.associationId) ?? null)
          : null,
        pharmacyId: user.pharmacyId ? (pharmacyByFixtureId.get(user.pharmacyId) ?? null) : null,
        createdAt: new Date(user.createdAt),
      },
      select: { id: true },
    });
    userByFixtureId.set(user.id, created.id);
  }
  console.log(`  users: ${userByFixtureId.size}`);

  // ------------------------------------------------------------ applications
  const applicationByFixtureId = new Map<string, string>();
  let fileCount = 0;
  let eventCount = 0;

  for (const application of seedApplications) {
    const pharmacyId = pharmacyByFixtureId.get(application.pharmacyId);
    const associationId = associationByFixtureId.get(application.associationId);
    const submittedById = userByFixtureId.get(application.submittedBy);
    if (!pharmacyId || !associationId || !submittedById) {
      throw new Error(`Unresolved relations for application ${application.id}`);
    }

    const created = await prisma.application.create({
      data: {
        reference: application.id,
        title: application.title,
        pharmacyId,
        associationId,
        submittedById,
        status: application.status,
        submittedAt: new Date(application.submittedAt),
        updatedAt: new Date(application.updatedAt),
        files: {
          create: application.files.map((file) => ({
            originalName: file.filename,
            kind: file.kind,
            mimeType: mimeFor(file.kind),
            sizeBytes: BigInt(file.sizeBytes),
            checksumSha256: fixtureChecksum(
              `${application.id}/${file.filename}/${file.sizeBytes}`,
            ),
            storageKey: `seed://${application.id}/${file.filename}`,
            storageDriver: "seed",
            parseState: ParseState.parsed,
            rowCount: file.rowCount,
            columnCount: file.columnCount,
            detectedColumns: file.detectedColumns,
            sheetNames: [],
            validationState: file.validationState,
            validationReason: file.validationReason,
            uploadedById: submittedById,
            uploadedAt: new Date(file.uploadedAt),
          })),
        },
      },
      select: { id: true },
    });

    fileCount += application.files.length;
    applicationByFixtureId.set(application.id, created.id);

    // Audit trail: derive each event's `from` from the preceding `to`.
    let previous: ApplicationStatus | null = null;
    for (const event of application.history) {
      await prisma.statusEvent.create({
        data: {
          applicationId: created.id,
          to: event.to,
          fromStatus: previous,
          changedById: userByFixtureId.get(event.changedById) ?? submittedById,
          note: event.note ?? null,
          changedAt: new Date(event.changedAt),
        },
      });
      previous = event.to;
      eventCount += 1;
    }
  }

  console.log(
    `  applications: ${applicationByFixtureId.size} (${fileCount} files, ${eventCount} status events)`,
  );

  // ----------------------------------------------------------------- reports
  let reportCount = 0;
  for (const report of seedReports) {
    const applicationId = applicationByFixtureId.get(report.applicationId);
    const generatedById = userByFixtureId.get(report.generatedBy);
    if (!applicationId || !generatedById) continue;

    await prisma.report.create({
      data: {
        applicationId,
        status: report.status,
        source: "manual",
        resultData: report.resultData,
        rawData: report.rawData,
        generatedById,
        generatedAt: new Date(report.generatedAt),
        engineVersion: null,
      },
    });
    reportCount += 1;
  }
  console.log(`  reports: ${reportCount}`);

  // The seeded filings write `reference` explicitly, which bypasses the
  // database default and therefore never advances `application_reference_seq`.
  // The truncate above only restarts *table* identities; the sequence is a
  // standalone object and survives. So after a re-seed the sequence still held
  // whatever value the previous database happened to reach, and the first real
  // filing could be allocated a reference that already exists — or
  // `AP-2026-0001`, if the sequence had never been called at all.
  //
  // Advance it past the highest seeded reference so the next allocated filing
  // continues the fixture series instead of colliding with it.
  const [{ suffix }] = await prisma.$queryRawUnsafe<[{ suffix: number | null }]>(
    `SELECT MAX(NULLIF(regexp_replace(reference, '^AP-2026-', ''), '')::bigint) AS suffix
       FROM "applications"`,
  );
  if (suffix !== null) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('application_reference_seq', ${suffix}::bigint, true)`,
    );
    console.log(`  reference sequence advanced to AP-2026-${String(suffix).padStart(4, "0")}`);
  }

  console.log(`\nDone. Every seeded user shares the password: ${DEV_PASSWORD}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
