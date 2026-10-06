CREATE TYPE "ExtractionRunStatus" AS ENUM ('queued','running','succeeded','failed');
CREATE TYPE "ExtractionSource" AS ENUM ('upload','url');
CREATE TYPE "ExtractionErrorCode" AS ENUM (
  'NONE',
  'NO_TABLE_FOUND',
  'INPUT_UNREADABLE',
  'UPSTREAM_QUOTA',
  'UPSTREAM_UNAVAILABLE',
  'UPSTREAM_REFUSED',
  'BLOCKED_BY_SAFETY',
  'OUTPUT_TRUNCATED',
  'TOO_LARGE'
);

CREATE TABLE "extraction_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "status" "ExtractionRunStatus" NOT NULL DEFAULT 'queued',
  "source" "ExtractionSource" NOT NULL,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT,
  "source_mime" TEXT NOT NULL,
  "source_bytes" INTEGER NOT NULL,
  "source_checksum" TEXT,
  "upload_id" UUID,
  "key_slot" INTEGER,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "model" TEXT NOT NULL,
  "finish_reason" TEXT,
  "table_count" INTEGER NOT NULL DEFAULT 0,
  "tables" JSONB NOT NULL DEFAULT '[]',
  "csv_bytes" INTEGER,
  "csv_truncated" BOOLEAN NOT NULL DEFAULT false,
  "output_key" TEXT,
  "output_name" TEXT,
  "error_code" "ExtractionErrorCode" NOT NULL DEFAULT 'NONE',
  "error_message" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "completed_at" TIMESTAMPTZ(6),
  "requested_by_id" UUID NOT NULL,
  CONSTRAINT "extraction_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "extraction_runs_status_idx" ON "extraction_runs"("status");
CREATE INDEX "extraction_runs_requested_by_id_started_at_idx" ON "extraction_runs"("requested_by_id", "started_at");
CREATE INDEX "extraction_runs_upload_id_idx" ON "extraction_runs"("upload_id");

ALTER TABLE "extraction_runs" ADD CONSTRAINT "extraction_runs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
