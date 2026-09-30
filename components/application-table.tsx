"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { StatusBadge } from "@/components/status-badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDateTime } from "@/lib/utils";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/types";
import type { ApplicationRow } from "@/lib/data";

type SortKey = "submittedAt" | "title" | "status";
type SortDir = "asc" | "desc";
const STATUSES: (ApplicationStatus | "all")[] = [
  "all",
  "pending",
  "in_review",
  "reported",
  "rejected",
];

function sortRows(rows: ApplicationRow[], key: SortKey, dir: SortDir): ApplicationRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "submittedAt") {
      return (
        (new Date(a.application.submittedAt).getTime() - new Date(b.application.submittedAt).getTime()) * factor
      );
    }
    if (key === "status") {
      return a.application.status.localeCompare(b.application.status) * factor;
    }
    return a.application.title.localeCompare(b.application.title) * factor;
  });
}

/**
 * Defined at module scope rather than inside `ApplicationTable`: a component
 * created during render is a fresh type on every render, which remounts its
 * subtree and defeats memoisation.
 */
function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onToggle,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className="inline-flex items-center gap-1 font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        {label}
        <Icon className={cnIcon(active)} aria-hidden="true" />
      </button>
    </th>
  );
}

export function ApplicationTable({
  rows,
  scopeLabel,
}: {
  rows: ApplicationRow[];
  scopeLabel?: string;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<ApplicationStatus | "all">("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("submittedAt");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (status !== "all") out = out.filter((r) => r.application.status === status);
    if (q) {
      out = out.filter(
        (r) =>
          r.application.reference.toLowerCase().includes(q) ||
          r.application.title.toLowerCase().includes(q) ||
          r.pharmacy.name.toLowerCase().includes(q) ||
          r.submitter.name.toLowerCase().includes(q) ||
          r.application.files.some((f) => f.filename.toLowerCase().includes(q)),
      );
    }
    return sortRows(out, sortKey, sortDir);
  }, [rows, query, status, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "title" || key === "status" ? "asc" : "desc");
    }
  };

  const sortHeaderProps = { sortKey, sortDir, onToggle: toggleSort };

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search filing ID, title, pharmacy, file"
            className="pl-8"
            aria-label="Search filings"
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            {scopeLabel ?? "Filings"}
          </p>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ApplicationStatus | "all")}
          >
            <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "All statuses" : STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-hairline/70 bg-paper-raised shadow-soft">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-sm text-muted">
            {rows.length === 0
              ? "There are no filings in this scope yet."
              : "No filings match the current search or status filter."}
          </div>
        ) : (
          <table className="ruled-table">
            <thead>
              <tr>
                <SortHeader label="Filing ID" k="submittedAt" {...sortHeaderProps} />
                <SortHeader label="Title" k="title" {...sortHeaderProps} />
                <th>Pharmacy</th>
                <th>Submitted</th>
                <SortHeader label="Status" k="status" {...sortHeaderProps} />
                <th className="text-right">Records</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.application.id}>
                  <td>
                    <Link
                      href={`/applications/${row.application.id}`}
                      className="font-mono text-[12px] text-accent underline-offset-2 hover:underline"
                    >
                      {row.application.reference}
                    </Link>
                  </td>
                  <td className="max-w-[260px]">
                    <Link
                      href={`/applications/${row.application.id}`}
                      className="block truncate text-[13px] text-ink underline-offset-2 hover:underline"
                      title={row.application.title}
                    >
                      {row.application.title}
                    </Link>
                  </td>
                  <td>{row.pharmacy.name}</td>
                  <td>
                    <span className="font-mono text-[11px] text-muted">
                      {fmtDateTime(row.application.submittedAt)}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={row.application.status} />
                  </td>
                  <td className="text-right font-mono text-[12px] text-ink">
                    {row.totalRows.toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        {filtered.length} of {rows.length} filing{rows.length === 1 ? "" : "s"} shown
      </p>
    </div>
  );
}

function cnIcon(active: boolean): string {
  return active ? "h-3.5 w-3.5 text-accent" : "h-3.5 w-3.5 opacity-40";
}