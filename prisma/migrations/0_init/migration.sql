-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('super_admin', 'moderator', 'pharmacy_association_admin', 'pharmacy_worker');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'invited', 'disabled');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('pending', 'in_review', 'reported', 'rejected');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('xlsx', 'csv');

-- CreateEnum
CREATE TYPE "FileValidationState" AS ENUM ('valid', 'warning', 'invalid');

-- CreateEnum
CREATE TYPE "ParseState" AS ENUM ('pending', 'parsing', 'parsed', 'failed');

-- CreateEnum
CREATE TYPE "UploadState" AS ENUM ('pending', 'ready', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'final');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('manual', 'service');

-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "pharmacy_associations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "gmp_certificate_id" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pharmacy_associations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacies" (
    "id" UUID NOT NULL,
    "association_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "license_number" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pharmacies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'invited',
    "association_id" UUID,
    "pharmacy_id" UUID,
    "invite_token_hash" TEXT,
    "invite_expires_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "invited_by_id" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "pharmacy_id" UUID NOT NULL,
    "association_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "analysis_application_id" TEXT,
    "analysis_name" TEXT,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_files" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "storage_driver" TEXT NOT NULL,
    "parse_state" "ParseState" NOT NULL DEFAULT 'pending',
    "parse_error" TEXT,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "column_count" INTEGER NOT NULL DEFAULT 0,
    "detected_columns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sheet_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validation_state" "FileValidationState" NOT NULL,
    "validation_reason" TEXT NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "state" "UploadState" NOT NULL DEFAULT 'pending',
    "original_name" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "declared_bytes" BIGINT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "storage_driver" TEXT NOT NULL,
    "actual_bytes" BIGINT,
    "checksum_sha256" TEXT,
    "failure_reason" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "application_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_events" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "to" "ApplicationStatus" NOT NULL,
    "from_status" "ApplicationStatus",
    "changed_by_id" UUID NOT NULL,
    "note" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'final',
    "source" "ReportSource" NOT NULL DEFAULT 'manual',
    "result_data" JSONB NOT NULL DEFAULT '{}',
    "raw_data" TEXT NOT NULL DEFAULT '{}',
    "generated_by_id" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engine_version" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "status" "AnalysisRunStatus" NOT NULL DEFAULT 'queued',
    "analysis_application_id" TEXT,
    "analysis_id" TEXT,
    "engine_version" TEXT,
    "request_payload" JSONB,
    "response_summary" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "requested_by_id" UUID NOT NULL,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pharmacy_associations_status_idx" ON "pharmacy_associations"("status");

-- CreateIndex
CREATE INDEX "pharmacies_association_id_idx" ON "pharmacies"("association_id");

-- CreateIndex
CREATE INDEX "pharmacies_status_idx" ON "pharmacies"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_invite_token_hash_key" ON "users"("invite_token_hash");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_association_id_idx" ON "users"("association_id");

-- CreateIndex
CREATE INDEX "users_pharmacy_id_idx" ON "users"("pharmacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_reference_key" ON "applications"("reference");

-- CreateIndex
CREATE INDEX "applications_pharmacy_id_idx" ON "applications"("pharmacy_id");

-- CreateIndex
CREATE INDEX "applications_association_id_idx" ON "applications"("association_id");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_submitted_at_idx" ON "applications"("submitted_at");

-- CreateIndex
CREATE INDEX "application_files_application_id_idx" ON "application_files"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_storage_key_key" ON "uploads"("storage_key");

-- CreateIndex
CREATE INDEX "uploads_state_idx" ON "uploads"("state");

-- CreateIndex
CREATE INDEX "uploads_uploaded_by_id_idx" ON "uploads"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "uploads_expires_at_idx" ON "uploads"("expires_at");

-- CreateIndex
CREATE INDEX "application_status_events_application_id_changed_at_idx" ON "application_status_events"("application_id", "changed_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_application_id_key" ON "reports"("application_id");

-- CreateIndex
CREATE INDEX "analysis_runs_application_id_started_at_idx" ON "analysis_runs"("application_id", "started_at");

-- CreateIndex
CREATE INDEX "analysis_runs_status_idx" ON "analysis_runs"("status");

-- AddForeignKey
ALTER TABLE "pharmacies" ADD CONSTRAINT "pharmacies_association_id_fkey" FOREIGN KEY ("association_id") REFERENCES "pharmacy_associations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_association_id_fkey" FOREIGN KEY ("association_id") REFERENCES "pharmacy_associations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_pharmacy_id_fkey" FOREIGN KEY ("pharmacy_id") REFERENCES "pharmacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_association_id_fkey" FOREIGN KEY ("association_id") REFERENCES "pharmacy_associations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_files" ADD CONSTRAINT "application_files_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_files" ADD CONSTRAINT "application_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_events" ADD CONSTRAINT "application_status_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_events" ADD CONSTRAINT "application_status_events_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
