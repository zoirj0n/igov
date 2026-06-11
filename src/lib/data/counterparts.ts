import type { CounterpartProfile } from "@/services/agent/state";
import seeds from "../../../data/seed/counterparts.json";

const SEEDS = seeds as Record<string, Omit<CounterpartProfile, "photoUrl">>;

/** Curated offline dossiers — only officeholders stable enough to assert. */
export function getSeedCounterpart(iso3: string, roleKey: string): CounterpartProfile | null {
  const hit = SEEDS[`${iso3}:${roleKey}`];
  return hit ? { ...hit } : null;
}
