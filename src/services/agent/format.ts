/**
 * Human-readable formatting for indicator values. Critical for local-model
 * quality: handing a 7B model "2185821648943.86" invites misreads ("$741
 * billion"); handing it "$2.19 trillion" does not. Facts are pre-formatted
 * before they reach any prompt.
 */
import type { IndicatorPoint } from "@/services/agent/state";

export function humanizeValue(value: number, unit: string): string {
  const abs = Math.abs(value);
  if (unit === "USD") {
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)} trillion`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)} billion`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)} million`;
    return `$${Math.round(value).toLocaleString()}`;
  }
  if (unit === "people") {
    if (abs >= 1e6) return `${(value / 1e6).toFixed(1)} million`;
    return Math.round(value).toLocaleString();
  }
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "kWh") return `${Math.round(value).toLocaleString()} kWh`;
  return `${Math.round(value * 100) / 100} ${unit}`;
}

export function factLine(i: IndicatorPoint): string {
  return `${i.label}: ${humanizeValue(i.value, i.unit)} (${i.year}, ${i.source})`;
}
