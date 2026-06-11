"use client";

interface Point {
  x: number;
  y: number;
}

interface Series {
  label: string;
  color: string;
  points: Point[];
}

interface Props {
  series: Series[];
  width?: number;
  height?: number;
  xLabel?: (x: number) => string;
  yLabel?: (y: number) => string;
}

export function LineChart({ series, width = 480, height = 220, xLabel, yLabel }: Props) {
  if (series.length === 0) return null;
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) return null;

  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = Math.min(...allPoints.map((p) => p.y));
  const maxY = Math.max(...allPoints.map((p) => p.y));
  const padX = 36;
  const padY = 18;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const sx = (x: number): number => padX + ((x - minX) / Math.max(1e-9, maxX - minX)) * innerW;
  const sy = (y: number): number =>
    padY + innerH - ((y - minY) / Math.max(1e-9, maxY - minY)) * innerH;

  const yTicks = 4;
  const xTickCount = Math.min(6, Math.max(...series.map((s) => s.points.length)));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      role="img"
      aria-label="Line chart"
    >
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const y = padY + (innerH / yTicks) * i;
        const v = maxY - ((maxY - minY) / yTicks) * i;
        return (
          <g key={`yt-${i}`}>
            <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="#ecebe6" strokeWidth={1} />
            <text x={padX - 6} y={y + 3} fontSize={9} fill="#8a8779" textAnchor="end">
              {yLabel ? yLabel(v) : v.toFixed(1)}
            </text>
          </g>
        );
      })}
      {Array.from({ length: xTickCount }, (_, i) => {
        const x = padX + (innerW / Math.max(1, xTickCount - 1)) * i;
        const v = minX + ((maxX - minX) / Math.max(1, xTickCount - 1)) * i;
        return (
          <text
            key={`xt-${i}`}
            x={x}
            y={height - padY + 12}
            fontSize={9}
            fill="#8a8779"
            textAnchor="middle"
          >
            {xLabel ? xLabel(v) : v.toFixed(0)}
          </text>
        );
      })}
      {series.map((s) => {
        const d = s.points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
          .join(" ");
        return (
          <g key={s.label}>
            <path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.points.map((p, i) => (
              <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.5} fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

interface SparkProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  values,
  width = 80,
  height = 24,
  color = "oklch(0.58 0.07 250)",
}: SparkProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-9, max - min);
  const stepX = width / (values.length - 1);
  const d = values
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(1)} ${(height - ((v - min) / range) * height).toFixed(1)}`,
    )
    .join(" ");
  const last = values[values.length - 1];
  const lastY = last === undefined ? 0 : height - ((last - min) / range) * height;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={width} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
