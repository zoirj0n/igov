"use client";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Minimal SVG donut — slices as stroked circle segments, legend below. */
export function DonutChart({
  slices,
  size = 150,
  thickness = 24,
  centerLabel,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={slices.map((s) => `${s.label} ${s.value}`).join(", ")}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {slices.map((s) => {
            const frac = s.value / total;
            const seg = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${frac * c} ${c}`}
                strokeDashoffset={-acc * c}
              />
            );
            acc += frac;
            return seg;
          })}
        </g>
        {centerLabel && (
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            className="fill-ink-700 text-xs font-semibold"
          >
            {centerLabel}
          </text>
        )}
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5 text-2xs text-ink-500">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label} · {s.value}%
          </li>
        ))}
      </ul>
    </div>
  );
}
