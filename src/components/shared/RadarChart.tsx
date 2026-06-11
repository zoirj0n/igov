"use client";

interface Series {
  label: string;
  color: string;
  values: number[];
}

interface Props {
  axes: string[];
  series: Series[];
  size?: number;
}

export function RadarChart({ axes, series, size = 280 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 28;
  const n = axes.length;
  if (n < 3) return null;

  const point = (i: number, value: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const radius = r * Math.max(0, Math.min(1, value));
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };

  const axisPoint = (i: number): [number, number] => point(i, 1);
  const labelPoint = (i: number): [number, number] => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const radius = r + 14;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  };

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        style={{ width: size, height: size }}
        role="img"
        aria-label="Radar comparison"
      >
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={Array.from({ length: n }, (_, i) => {
              const [x, y] = point(i, ring);
              return `${x},${y}`;
            }).join(" ")}
            fill="none"
            stroke="#ecebe6"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const [x2, y2] = axisPoint(i);
          return (
            <line
              key={`ax-${i}`}
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke="#ecebe6"
              strokeWidth={1}
            />
          );
        })}
        {series.map((s) => (
          <g key={s.label}>
            <polygon
              points={s.values
                .map((v, i) => {
                  const [x, y] = point(i, v);
                  return `${x},${y}`;
                })
                .join(" ")}
              fill={s.color}
              fillOpacity={0.18}
              stroke={s.color}
              strokeWidth={1.5}
            />
            {s.values.map((v, i) => {
              const [x, y] = point(i, v);
              return <circle key={`${s.label}-${i}`} cx={x} cy={y} r={3} fill={s.color} />;
            })}
          </g>
        ))}
        {axes.map((a, i) => {
          const [x, y] = labelPoint(i);
          return (
            <text
              key={a}
              x={x}
              y={y}
              fontSize={10}
              fill="#615e54"
              textAnchor={x < cx - 4 ? "end" : x > cx + 4 ? "start" : "middle"}
              dominantBaseline="middle"
            >
              {a}
            </text>
          );
        })}
      </svg>
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-600">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
