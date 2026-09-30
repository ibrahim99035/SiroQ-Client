/**
 * Deletes upload slots that were reserved but never bound to a filing.
 *
 * Intake stages every file's bytes *before* the filing is created, so an
 * abandoned submission leaves an unattached `Upload` row and the object it
 * reserved. Both outlive their usefulness: the slot is only ever read again by
 * the completion handler (which 410s it), and nothing in the app removes it.
 * Without this script, moving the filing to the end of the flow would have
 * traded a visible empty filing for an invisible pile of orphaned storage.
 *
 * The row is only deleted after its object is gone, and each object is
 * attempted independently, so one storage failure cannot strand the database
 * rows that record what is still leaked.
 *
 * Run it from cron. It is idempotent and safe to run at any time.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { deleteObject } from "../lib/storage";

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

function newClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: env("DATABASE_URL") }),
  });
}

export interface ReapResult {
  expiredSlots: number;
  deletedObjects: number;
  objectFailures: number;
  deletedSlots: number;
}

/**
 * Reaps expired slots and returns what it did, without exiting the process, so
 * `verify-applications` can assert on it.
 */
export async function reapExpiredUploads(now = new Date()): Promise<ReapResult> {
  const prisma = newClient();
  const result: ReapResult = {
    expiredSlots: 0,
    deletedObjects: 0,
    objectFailures: 0,
    deletedSlots: 0,
  };

  try {
    // `pending` is the state of a slot whose bytes are in storage but which was
    // never completed. `failed`/`expired` slots may hold no object at all, and
    // `ready` slots belong to a filing and must never be touched.
    const expired = await prisma.upload.findMany({
      where: { expiresAt: { lte: now }, state: { in: ["pending", "failed", "expired"] } },
      select: { id: true, storageKey: true },
    });

    for (const slot of expired) {
      result.expiredSlots += 1;
      try {
        await deleteObject(slot.storageKey);
        result.deletedObjects += 1;
      } catch (error) {
        // Keep the row so the next run retries the object; a leaked object is
        // recoverable, a row pointing at a deleted key is not.
        result.objectFailures += 1;
        console.error(
          `  ! ${slot.id}: object ${slot.storageKey} could not be deleted, keeping the row for a retry`,
          error instanceof Error ? error.message : error,
        );
        continue;
      }
      await prisma.upload.delete({ where: { id: slot.id } });
      result.deletedSlots += 1;
    }
  } finally {
    await prisma.$disconnect();
  }

  return result;
}

async function main(): Promise<void> {
  const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  const result = await reapExpiredUploads();
  console.log(`storage driver: ${driver}`);
  console.log(`expired slots found: ${result.expiredSlots}`);
  console.log(`objects deleted:     ${result.deletedObjects}`);
  console.log(`rows deleted:        ${result.deletedSlots}`);
  if (result.objectFailures > 0) {
    console.log(`object failures:     ${result.objectFailures} (left in place for the next run)`);
  }
  console.log("reap complete");
}

// argv rather than `require.main`/`import.meta.url`, because the verify suite
// imports `reapExpiredUploads` from this file and must not trigger a run.
if (process.argv[1]?.endsWith("reap-expired-uploads.ts")) {
  main().catch((error: unknown) => {
    console.error("reap failed:", error);
    process.exit(1);
  });
}
