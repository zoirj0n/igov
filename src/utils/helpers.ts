import { localeTag } from "./format";
import type { Locale } from "./validators";

export function formatNumber(value: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

export function formatCurrency(value: number, currency = "USD", locale: Locale = "en"): string {
  return new Intl.NumberFormat(localeTag(locale), { style: "currency", currency }).format(value);
}

export function formatPercent(value: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
