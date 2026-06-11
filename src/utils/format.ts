import type { Locale } from "@/lib/i18n/messages";

/** BCP-47 tag for Intl formatting. Digits are pinned to Western (latn) in
 *  Arabic — UAE government convention — because engines disagree on the
 *  default numbering system for ar/ar-AE. */
export const localeTag = (locale: Locale): string =>
  locale === "ar" ? "ar-AE-u-nu-latn" : "en-US";

const tagFor = localeTag;

export function formatMetric(value: number, unit: string, locale: Locale = "en"): string {
  const tag = tagFor(locale);
  switch (unit) {
    case "USD":
      return formatCompactCurrency(value, locale);
    case "%":
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)}%`;
    case "people":
      return new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }).format(
        value,
      );
    case "rank":
      return `#${new Intl.NumberFormat(tag).format(value)}`;
    case "/5":
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)} / 5`;
    case "kbd":
      return `${new Intl.NumberFormat(tag).format(value)} kbd`;
    case "bcm":
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)} bcm`;
    case "TWh":
      return `${new Intl.NumberFormat(tag).format(value)} TWh`;
    case "t":
      return `${new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value)} t`;
    case "score":
      return new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(value);
    default:
      return `${new Intl.NumberFormat(tag).format(value)} ${unit}`;
  }
}

function formatCompactCurrency(value: number, locale: Locale): string {
  const tag = tagFor(locale);
  return new Intl.NumberFormat(tag, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
