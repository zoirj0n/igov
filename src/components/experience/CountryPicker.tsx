"use client";

import { ISO_COUNTRIES, type IsoCountry, flagForIso3 } from "@/lib/data/iso-countries";
import { REGIONS, REGION_LABELS, type Region, regionOf } from "@/lib/data/regions";
import { FEATURED_ISO3, FEATURED_STATS, arNameFor } from "@/lib/experience/featured";
import type { CountryChoice } from "@/lib/experience/machine";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useI18n } from "@/lib/i18n/context";
import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { PickerMap } from "./PickerMap";

export function CountryPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (c: CountryChoice) => void;
}) {
  const { locale, t } = useI18n();
  const x = t.experience;
  const lang: "en" | "ar" = locale === "ar" ? "ar" : "en";
  const ref = useRef<HTMLDialogElement>(null);
  useFocusTrap(ref, true, onClose);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState<Region | "all">("all");

  const { featured, rest } = useMemo(() => {
    const norm = q.trim().toLowerCase();
    const all = ISO_COUNTRIES.filter(
      (c) =>
        (region === "all" || regionOf(c.iso3) === region) &&
        (!norm || c.name.toLowerCase().includes(norm) || c.iso3.toLowerCase().includes(norm)),
    );
    return {
      featured: FEATURED_ISO3.map((i) => all.find((c) => c.iso3 === i)).filter(
        (c): c is IsoCountry => Boolean(c),
      ),
      rest: all
        .filter((c) => !FEATURED_ISO3.includes(c.iso3))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [q, region]);

  function pick(c: IsoCountry) {
    onSelect({ iso3: c.iso3, name: c.name, flag: flagForIso3(c.iso3) });
  }

  const chipCls = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium transition ${
      active
        ? "bg-accent text-ink-900"
        : "border border-ink-200 text-ink-600 hover:border-tamm-cyan/50 hover:text-ink-900"
    }`;

  function Card({ c }: { c: IsoCountry }) {
    const name = lang === "ar" ? (arNameFor(c.iso3) ?? c.name) : c.name;
    const sub = FEATURED_STATS[c.iso3] ?? REGION_LABELS[regionOf(c.iso3) ?? "apac"]?.[lang];
    return (
      <button
        type="button"
        onClick={() => pick(c)}
        className="flex flex-col items-center rounded-xl border border-ink-200 bg-ink-100/80 p-3 text-center transition hover:border-tamm-cyan/60 hover:bg-ink-150/80"
      >
        <span className="text-4xl leading-none" aria-hidden>
          {flagForIso3(c.iso3)}
        </span>
        <div className="mt-2 w-full truncate text-sm font-medium text-ink-900">{name}</div>
        <div className="w-full truncate text-2xs text-ink-400" aria-hidden="true">
          {sub}
        </div>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 overflow-y-auto bg-ink-50/95 backdrop-blur-sm"
    >
      <dialog
        ref={ref}
        open
        aria-label={x.selectCountry}
        className="mx-auto w-full max-w-5xl border-0 bg-transparent px-6 py-8 text-inherit"
      >
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={x.searchPlaceholder}
            className="flex-1 rounded-xl border border-ink-200 bg-ink-100/80 px-4 py-3 text-ink-900 outline-none placeholder:text-ink-400 focus:ring-2 focus:ring-accent/40"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-ink-200 px-4 py-3 text-sm text-ink-700 hover:text-ink-900"
          >
            {x.closePicker} ✕
          </button>
        </div>

        <div className="relative mt-4 overflow-hidden rounded-xl border border-ink-200 bg-ink-100/70">
          <PickerMap activeRegion={region} />
          <div className="flex flex-wrap justify-center gap-2 px-4 pb-4">
            <button
              type="button"
              onClick={() => setRegion("all")}
              className={chipCls(region === "all")}
            >
              {x.all}
            </button>
            {REGIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRegion(r)}
                className={chipCls(region === r)}
              >
                {REGION_LABELS[r][lang]}
              </button>
            ))}
          </div>
        </div>

        {featured.length > 0 && (
          <>
            <h2 className="mt-6 text-2xs font-semibold uppercase tracking-wide text-ink-400">
              {x.featured}
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {featured.map((c) => (
                <Card key={c.iso3} c={c} />
              ))}
            </div>
          </>
        )}

        {rest.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
            {rest.map((c) => (
              <Card key={c.iso3} c={c} />
            ))}
          </div>
        )}

        {featured.length === 0 && rest.length === 0 && (
          <p className="mt-10 text-center text-sm text-ink-400">{x.noMatches}</p>
        )}
      </dialog>
    </motion.div>
  );
}
