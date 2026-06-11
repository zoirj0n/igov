"use client";

import { arNameFor } from "@/lib/experience/featured";
import type { CountryChoice } from "@/lib/experience/machine";
import { ROLE_KEYS, ROLE_LABELS, type RoleSelection } from "@/lib/experience/roles";
import { useI18n } from "@/lib/i18n/context";
import { motion } from "motion/react";

export function SentenceComposer({
  country,
  role,
  busy,
  onOpenPicker,
  onRole,
  onBegin,
}: {
  country: CountryChoice | null;
  role: RoleSelection;
  busy: boolean;
  onOpenPicker: () => void;
  onRole: (r: RoleSelection) => void;
  onBegin: () => void;
}) {
  const { locale, t } = useI18n();
  const x = t.experience;
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
  const displayName = country
    ? lang === "ar"
      ? (arNameFor(country.iso3) ?? country.name)
      : country.name
    : null;

  const slot =
    "rounded-xl border border-dashed border-accent/70 bg-accent/10 px-4 py-2 text-tamm-cyan transition hover:border-tamm-cyan hover:bg-accent/15";

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6 text-center">
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-4 font-display text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
        <span>{x.lead}</span>
        <span className="inline-flex items-center">
          <motion.button
            layoutId="country-slot"
            type="button"
            onClick={onOpenPicker}
            className={slot}
          >
            {country ? `${country.flag} ${displayName}` : x.selectCountry}
          </motion.button>
          <span className="ms-0.5">{x.connector}</span>
        </span>
        <span className="inline-flex flex-col items-center gap-2 align-middle sm:flex-row">
          <select
            aria-label={x.roleLabel}
            value={role.key}
            onChange={(e) =>
              onRole({ key: e.target.value as RoleSelection["key"], customName: role.customName })
            }
            className="rounded-xl border border-dashed border-accent/70 bg-accent/10 px-3 py-2 text-2xl text-tamm-cyan outline-none sm:text-3xl"
          >
            {ROLE_KEYS.map((k) => (
              <option key={k} value={k} className="bg-ink-100 text-base text-ink-800">
                {ROLE_LABELS[k][lang]}
              </option>
            ))}
          </select>
          {role.key === "custom" && (
            <input
              value={role.customName ?? ""}
              onChange={(e) => onRole({ key: "custom", customName: e.target.value })}
              placeholder={x.customRolePlaceholder}
              className="rounded-xl border border-ink-200 bg-ink-100/80 px-3 py-2 text-base text-ink-900 outline-none placeholder:text-ink-400"
            />
          )}
        </span>
      </p>
      <button
        type="button"
        onClick={onBegin}
        disabled={!country || busy}
        className="rounded-xl bg-gradient-to-r from-[#b68a35] to-tamm-cyan px-7 py-3 text-lg font-semibold text-[#06121a] shadow-[0_0_30px_-8px_rgba(215, 188, 109,0.8)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {x.begin} ▸
      </button>
      <p className="text-xs text-ink-400">{x.hint}</p>
    </div>
  );
}
