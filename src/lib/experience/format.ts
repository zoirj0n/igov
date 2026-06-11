export function fmtUsd(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * Compact display formatting for indicator values: live World Bank/IMF rows
 * arrive with full precision (e.g. 2169654393219.43, 3.847293%) — tiles need
 * "$2.2T" and "3.8%", never thirteen digits. Unit-aware: USD variants become
 * currency, percentages round to one decimal, counts compact to M/B, generic
 * units scale and keep their suffix.
 */
export function fmtCompact(value: number, unit?: string): string {
  const u = (unit ?? "").trim();
  if (u === "$" || /^us?\$$/i.test(u) || /^usd$/i.test(u)) return fmtUsd(value);
  if (u === "%") return `${(Math.round(value * 10) / 10).toString()}%`;

  const abs = Math.abs(value);
  const scaled =
    abs >= 1e12
      ? `${(value / 1e12).toFixed(1)}T`
      : abs >= 1e9
        ? `${(value / 1e9).toFixed(1)}B`
        : abs >= 1e6
          ? `${(value / 1e6).toFixed(1)}M`
          : abs >= 1e4
            ? Math.round(value).toLocaleString()
            : `${Math.round(value * 100) / 100}`;

  if (u === "" || u.toLowerCase() === "people") return scaled;
  return `${scaled} ${u}`;
}
