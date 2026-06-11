import type { Locale } from "@/lib/i18n/messages";

export const ROLE_KEYS = [
  "energy",
  "infrastructure",
  "foreign",
  "headOfState",
  "trade",
  "custom",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export interface RoleSelection {
  key: RoleKey;
  /** Only meaningful when key === "custom" — a free-typed name or title. */
  customName?: string;
}

export const ROLE_LABELS: Record<RoleKey, Record<Locale, string>> = {
  energy: { en: "Energy Minister", ar: "وزير الطاقة" },
  infrastructure: { en: "Infrastructure Minister", ar: "وزير البنية التحتية" },
  foreign: { en: "Foreign Minister", ar: "وزير الخارجية" },
  headOfState: { en: "Head of State", ar: "رئيس الدولة" },
  trade: { en: "Trade Minister", ar: "وزير التجارة" },
  custom: { en: "Custom…", ar: "مخصص…" },
};

export function roleSelectionFrom(key?: string, customName?: string): RoleSelection {
  return (ROLE_KEYS as readonly string[]).includes(key ?? "")
    ? { key: key as RoleKey, customName }
    : { key: "energy" };
}

/**
 * Natural-language command for the existing agent router. Shapes mirror the
 * proven examples ("Prepare me for Brazil's Energy Minister") so the router's
 * country + sector extraction keeps working unchanged.
 */
export function commandFor(countryName: string, role: RoleSelection): string {
  switch (role.key) {
    case "energy":
      return `Prepare me for ${countryName}'s Energy Minister`;
    case "infrastructure":
      return `Prepare me for ${countryName} — infrastructure cooperation`;
    case "foreign":
      return `Prepare me for ${countryName}'s Foreign Minister`;
    case "headOfState":
      return `Prepare me for a meeting with ${countryName}'s Head of State`;
    case "trade":
      return `Prepare me for ${countryName} — trade & investment`;
    case "custom":
      return `Prepare me for a meeting with ${role.customName?.trim() || "the counterpart"} of ${countryName}`;
  }
}

/** Web-search query used by the counterpart agent to find the current officeholder. */
export function searchQueryFor(countryName: string, role: RoleSelection): string {
  switch (role.key) {
    case "energy":
      return `current ${countryName} minister of energy 2026`;
    case "infrastructure":
      return `current ${countryName} minister of infrastructure 2026`;
    case "foreign":
      return `current ${countryName} minister of foreign affairs 2026`;
    case "headOfState":
      return `current ${countryName} head of state president 2026`;
    case "trade":
      return `current ${countryName} minister of trade commerce 2026`;
    case "custom":
      return `${role.customName?.trim() || "the counterpart"} ${countryName}`;
  }
}
