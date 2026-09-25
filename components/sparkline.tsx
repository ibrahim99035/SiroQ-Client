/** Thin inline trend line. Tabular and quiet — no fill, no gradient. */
export function Sparkline({
  points,
  className,
}: {
  points: number[];
  className?: string;
}) {
  if (points.length < 2 || points.every((p) => p === 0)) return null;
  const max = Math.max(...points, 1);
  const w = 96;
  const h = 26;
  const step = w / (points.length - 1);
  const coords = points
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 3) - 1.5).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const dir = last - first;
  return (
    <span className="inline-flex items-center gap-2" title={`${dir >= 0 ? "Up" : "Down"} ${Math.abs(dir)} from start of window`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className={className}
        aria-hidden="true"
        focusable="false"
        style={{ width: w, height: h }}
      >
        <polyline
          points={coords}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}