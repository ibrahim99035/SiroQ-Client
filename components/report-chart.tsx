"use client";

/**
 * Report charts, forecasting summaries and notes.
 *
 * Hand-rolled SVG, in the same register as `Sparkline`: tabular, no gradients,
 * no fills behind text. No charting dependency — the shapes here are a bar
 * column, a stepped line with a shaded band, and a severity rule, which is less
 * code than the configuration a library would need, and it keeps rendering
 * server-side friendly and themeable through `currentColor`.
 *
 * Values arrive pre-formatted as strings from the service (`"1,204,318.00"`),
 * which is what the panel shows, so the geometry parses the same strings the
 * reader sees. A bar's label and its printed value can therefore never disagree.
 */

/** Strip grouping separators and any currency symbol to get a drawable number. */
function toNumber(text: string | number | undefined | null): number | null {
  if (typeof text === "number") return Number.isFinite(text) ? text : null;
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Shorten a number to fit an axis: 12.3k, 1.2M. Keeps the axis from dominating. */
function compact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  if (abs >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

/**
 * Horizontal bars.
 *
 * Bars are sorted largest-first because that is the order a reader scans them in
 * and the service's `bars()` already normalises widths against the maximum, so
 * the order is a display choice rather than a data one.
 */
export function ReportBarChart({
  bars,
  total,
  unit,
}: {
  bars: { Label: string; Value: string; Share: string }[];
  total?: string;
  unit?: string;
}) {
  if (bars.length === 0) return null;

  // `Share` is a percentage of the largest bar (that is what the service's
  // `bars()` computes). Fall back to the numeric value when it is absent so a
  // hand-built chart still draws.
  const shares = bars.map((bar) => {
    const pct = toNumber(bar.Share);
    if (pct !== null) return Math.max(0, Math.min(100, pct));
    const value = toNumber(bar.Value);
    const values = bars.map((b) => toNumber(b.Value) ?? 0);
    const max = Math.max(...values, 1);
    return value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  });
  const peak = Math.max(...shares, 1);

  return (
    <figure className="m-0 px-5 pb-3 pt-1">
      {total ? (
        <figcaption className="pb-2 font-mono text-[11px] text-muted">
          Total {total}
          {unit ? ` ${unit}` : ""}
        </figcaption>
      ) : null}
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {bars.map((bar, index) => (
          <li key={bar.Label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2">
            <span
              className="truncate text-[12px] text-muted"
              title={`${bar.Label}: ${bar.Value}`}
            >
              {bar.Label}
            </span>
            {/* The track gives the column something to sit against so a very
                small bar still reads as a measured quantity rather than a
                rendering failure. */}
            <span className="flex h-2.5 items-center">
              <span
                className="block h-2.5 rounded-[2px] bg-accent"
                style={{ width: `${Math.max(2, (shares[index]! / peak) * 100)}%` }}
              />
            </span>
            <span className="font-mono text-[11px] tabular-nums text-ink">{bar.Value}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** A real grid, for the data that does not reduce to one dimension. */
export function ReportTableChart({ columns, rows }: { columns: string[]; rows: string[][] }) {
  if (columns.length === 0 || rows.length === 0) return null;
  return (
    <div className="overflow-x-auto px-5 pb-3 pt-1">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-hairline pb-1.5 pr-4 text-left font-medium text-muted"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`border-b border-hairline/60 py-1.5 pr-4 ${
                    cellIndex === 0 ? "text-ink" : "text-right font-mono tabular-nums text-muted"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * History plus projection, with the prediction interval shaded.
 *
 * The interval is the point of the chart. A bare forward line reads as a
 * commitment; the band is what makes "here is the plausible range" legible, so it
 * is drawn whenever the service supplied bounds. History and projection are
 * distinguished by stroke weight rather than colour, because colour alone would
 * leave the projected half indistinguishable in a monochrome print.
 */
export function ReportForecastChart({
  history,
  projected,
  series,
  method,
}: {
  history: { Period: string; Value: string }[];
  projected: { Period: string; Value: string; Low?: string; High?: string }[];
  series: string;
  method: string;
}) {
  if (history.length === 0 && projected.length === 0) return null;

  // One shape for both halves, so the geometry below never has to know which
  // side a point came from. A point whose value cannot be read is dropped rather
  // than plotted at zero — a zero would draw a fabricated dip.
  const points = (source: { Period: string; Value: string; Low?: string; High?: string }[]) =>
    source
      .map((point) => ({
        period: point.Period,
        value: toNumber(point.Value),
        low: point.Low === undefined ? null : toNumber(point.Low),
        high: point.High === undefined ? null : toNumber(point.High),
      }))
      .filter((p): p is { period: string; value: number; low: number | null; high: number | null } =>
        p.value !== null,
      );

  const observed = points(history);
  const future = points(projected);

  // The last observation is the join between the two halves, so the projected
  // line starts from a real point rather than floating one step after it.
  const all = [...observed, ...future];
  if (all.length < 2) return null;

  const lows = all.flatMap((p) => [p.low, p.high].filter((v): v is number => v !== null));
  const values = all.map((p) => p.value);
  const max = Math.max(...values, ...lows);
  const min = Math.min(...values, ...lows, 0);
  const span = max - min || 1;

  const width = 640;
  const height = 132;
  const padY = 10;
  const x = (index: number) => (index / (all.length - 1)) * width;
  const y = (value: number) =>
    height - padY - ((value - min) / span) * (height - padY * 2);

  // `future[i]` sits at `observed.length + i` — the index *after* the last
  // observation. The anchor is unshifted onto that same last index so the two
  // strokes meet; placing future[0] there instead would double up the slot,
  // compress the projection by one period, and leave the band (which uses the
  // same convention) a full step out of line with the stroke.
  const historyLine = observed.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const projectedLine = future.map((p, i) =>
    `${x(observed.length + i).toFixed(1)},${y(p.value).toFixed(1)}`,
  );
  const lastObserved = observed[observed.length - 1];
  if (lastObserved) {
    projectedLine.unshift(`${x(observed.length - 1).toFixed(1)},${y(lastObserved.value).toFixed(1)}`);
  }

  // Band only where both bounds arrived, so a partially-bounded projection
  // draws the line it can rather than a band that implies precision it lacks.
  // Indices stay in `future` coordinates, so a gap in the bounds does not shift
  // the shading relative to the line above it.
  const banded = future
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.low !== null && p.high !== null);
  const bandPath = banded.length
    ? [
        ...banded.map((p) => `${x(observed.length + p.index).toFixed(1)},${y(p.high as number).toFixed(1)}`),
        ...banded
          .slice()
          .reverse()
          .map((p) => `${x(observed.length + p.index).toFixed(1)},${y(p.low as number).toFixed(1)}`),
      ]
        .join(" ")
    : "";

  const axisLabels = [max, min + span / 2, min].map(compact);
  // Label the first, middle and last period only: a date per point is unreadable
  // at this width and the intermediate ones are implied by the axis.
  const tickIndexes = [0, Math.floor(all.length / 2), all.length - 1];

  return (
    <div className="px-5 pb-3 pt-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pb-1.5">
        <p className="text-[12px] text-ink">{series}</p>
        <p className="font-mono text-[11px] text-muted">{method}</p>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-[132px] w-full"
          role="img"
          aria-label={`${series}: ${observed.length} observed and ${future.length} projected periods`}
        >
          {bandPath ? <polygon points={bandPath} className="fill-accent-muted" /> : null}
          {historyLine.length > 1 ? (
            <polyline
              points={historyLine.join(" ")}
              fill="none"
              className="stroke-accent"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {projectedLine.length > 1 ? (
            <polyline
              points={projectedLine.join(" ")}
              fill="none"
              className="stroke-accent"
              strokeWidth="1.25"
              strokeDasharray="3 3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {/* Mark the hand-over explicitly. A dashed line that starts one step
              after the solid one ends reads as a gap in the data. */}
          {lastObserved ? (
            <circle
              cx={x(observed.length - 1)}
              cy={y(lastObserved.value)}
              r="2.5"
              className="fill-accent"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <ul className="pointer-events-none absolute inset-y-0 left-0 flex w-full flex-col justify-between py-2.5">
          {axisLabels.map((label) => (
            <li key={label} className="-translate-y-1/2 font-mono text-[10px] tabular-nums text-muted">
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-between pt-1">
        {tickIndexes.map((index) => (
          <span key={index} className="font-mono text-[10px] text-muted">
            {all[index]?.period.slice(5) ?? ""}
          </span>
        ))}
      </div>
      <p className="pt-2 text-[11px] text-muted">
        <span className="font-mono">—</span> observed
        <span className="px-1.5 font-mono">--</span>
        projected
        {bandPath ? (
          <>
            <span className="px-1.5">shaded band is the prediction interval</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

const SEVERITY_STYLES: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "border-status-rejected text-status-rejected" },
  bad: { label: "Critical", className: "border-status-rejected text-status-rejected" },
  warn: { label: "Warning", className: "border-status-pending text-[var(--warning-text)]" },
  warning: { label: "Warning", className: "border-status-pending text-[var(--warning-text)]" },
  good: { label: "Favourable", className: "border-status-reported text-status-reported" },
  info: { label: "Note", className: "border-hairline text-muted" },
  muted: { label: "Note", className: "border-hairline text-muted" },
};

/**
 * Caveats, skipped rules and evidence gaps.
 *
 * These are the sentences that bound how much the rest of the report can be
 * trusted, so they get a severity marker rather than being rendered as another
 * row of values. An unknown severity falls back to `info` — a new severity from
 * the service should read as a plain note, not as an unstyled block.
 */
export function ReportNotes({ notes }: { notes: { Severity: string; Subject: string; Detail: string }[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {notes.map((note, index) => {
        const style = SEVERITY_STYLES[note.Severity.toLowerCase()] ?? SEVERITY_STYLES.info!;
        return (
          <li
            key={`${note.Subject}-${index}`}
            className="border-l-2 pl-2.5"
            style={{ borderColor: "currentColor" }}
          >
            <p className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
              <span className={`font-medium ${style.className.split(" ")[1]}`}>{style.label}</span>
              <span className="text-ink">{note.Subject}</span>
            </p>
            <p className="text-[12px] leading-relaxed text-muted">{note.Detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
