-- Append-only custody log for changes to a filing's evidence.
--
-- Deliberately excludes two other statements that `prisma migrate diff` reports
-- against this database, because they are pre-existing drift and not part of
-- this change:
--   * ALTER TYPE "FileKind" ADD VALUE 'xls';
--   * ALTER TABLE "applications" ALTER COLUMN "reference" SET DEFAULT (...);
-- Neither is touched here.

-- CreateEnum
CREATE TYPE "FileEventKind" AS ENUM ('uploaded', 'replaced', 'deleted');

-- CreateTable
CREATE TABLE "application_file_events" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "kind" "FileEventKind" NOT NULL,
    "actor_id" UUID NOT NULL,
    "file_id" UUID,
    "filename" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "checksum_sha256" TEXT,
    "previous_filename" TEXT,
    "previous_size_bytes" BIGINT,
    "previous_checksum_sha256" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_file_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "application_file_events_application_id_created_at_idx" ON "application_file_events"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "application_file_events_file_id_idx" ON "application_file_events"("file_id");

-- AddForeignKey
ALTER TABLE "application_file_events" ADD CONSTRAINT "application_file_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_file_events" ADD CONSTRAINT "application_file_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;