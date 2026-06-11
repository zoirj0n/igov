interface Props {
  label: string;
  value: string;
  pct: number;
  accent?: boolean;
}

export function BarRow({ label, value, pct, accent }: Props) {
  const width = Math.min(100, Math.max(0, pct));
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
      <div>
        <div className="mb-1 flex items-baseline justify-between text-[11px] text-ink-500">
          <span className="truncate">{label}</span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-xs bg-ink-100"
          role="progressbar"
          aria-valuenow={width}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={accent ? "h-full bg-accent" : "h-full bg-ink-600"}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
      <div className="tabular text-sm text-ink-800">{value}</div>
    </div>
  );
}
