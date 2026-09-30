import * as React from "react";
import { StatusBadge } from "@/components/status-badge";
import { fmtDateTime } from "@/lib/utils";
import type { ApplicationRow } from "@/lib/data";

/**
 * Requisition-style filing header — a chain-of-custody slip: mono filing ID,
 * a ruled label/value grid, and a stamped status. No stacked cards.
 */
export function RequisitionHeader({ row }: { row: ApplicationRow }) {
  const { application, pharmacy, association, submitter } = row;

  return (
    <section aria-label="Filing record" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-ink px-5 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-paper-raised/60">
            Filing record
          </p>
          {/* The filing reference, not the row's UUID. `id` is database
              identity; the reference is what the pharmacy quotes, and the mock
              layer used the reference as the key so this slot used to read
              "AP-2026-2601" without appearing to change. */}
          <p className="truncate font-mono text-sm text-paper-raised">
            {application.reference}
          </p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 md:grid-cols-4">
        <div>
          <dt className="req-field-label">Title</dt>
          <dd className="mt-1 text-sm text-ink">{application.title}</dd>
        </div>
        <div>
          <dt className="req-field-label">Pharmacy</dt>
          <dd className="mt-1 text-sm text-ink">{pharmacy.name}</dd>
          <dd className="font-mono text-[11px] text-muted">{pharmacy.licenseNumber}</dd>
        </div>
        <div>
          <dt className="req-field-label">Association</dt>
          <dd className="mt-1 text-sm text-ink">{association.name}</dd>
          <dd className="font-mono text-[11px] text-muted">{association.gmpCertificateId}</dd>
        </div>
        <div>
          <dt className="req-field-label">Submitted by</dt>
          <dd className="mt-1 text-sm text-ink">{submitter.name}</dd>
          <dd className="truncate font-mono text-[11px] text-muted">{submitter.email}</dd>
        </div>
        <div>
          <dt className="req-field-label">Submitted</dt>
          <dd className="mt-1 font-mono text-[12px] text-ink">{fmtDateTime(application.submittedAt)}</dd>
        </div>
        <div>
          <dt className="req-field-label">Last updated</dt>
          <dd className="mt-1 font-mono text-[12px] text-ink">{fmtDateTime(application.updatedAt)}</dd>
        </div>
        <div>
          <dt className="req-field-label">Files in ledger</dt>
          <dd className="mt-1 font-mono text-[12px] text-ink">{application.files.length}</dd>
        </div>
        <div>
          <dt className="req-field-label">Records examined</dt>
          <dd className="mt-1 font-mono text-[12px] text-ink">
            {row.totalRows.toLocaleString("en-US")}
          </dd>
        </div>
      </dl>
    </section>
  );
}