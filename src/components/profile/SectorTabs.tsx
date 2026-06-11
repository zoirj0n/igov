"use client";

import { useTablistKeys } from "@/lib/hooks/useTablistKeys";
import { useI18n } from "@/lib/i18n/context";
import { useEffect, useRef, useState } from "react";

export type SectorKey =
  | "overview"
  | "energy"
  | "infrastructure"
  | "transport"
  | "sustainability"
  | "trade"
  | "cooperation";

/** A user-added, AI-researched sector tab. */
export interface CustomTab {
  id: string;
  label: string;
}

interface Props {
  active: string;
  onChange: (s: string) => void;
  customTabs?: CustomTab[];
  /** Submit handler for the "+" add-sector form. Omit to hide the button. */
  onAddSector?: (sector: string) => void;
}

const order: SectorKey[] = [
  "overview",
  "energy",
  "infrastructure",
  "transport",
  "sustainability",
  "trade",
  "cooperation",
];

export function SectorTabs({ active, onChange, customTabs = [], onAddSector }: Props) {
  const { t } = useI18n();
  const fullOrder = [...order, ...customTabs.map((c) => c.id)];
  const onKey = useTablistKeys(fullOrder, active, onChange);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const sector = draft.trim();
    if (sector.length < 2 || !onAddSector) return;
    onAddSector(sector);
    setDraft("");
    setAdding(false);
  }

  const tabClass = (isActive: boolean) =>
    isActive
      ? "rounded-md bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      : "rounded-md px-3.5 py-1.5 text-xs text-ink-500 transition hover:bg-ink-200 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <div className="sticky top-16 z-10 border-b border-ink-100 bg-ink-50/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6 py-2.5">
        <div
          role="tablist"
          aria-label="Sector"
          onKeyDown={onKey}
          className="flex items-center gap-1"
        >
          {order.map((s) => {
            const isActive = s === active;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                data-tab={s}
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                onClick={() => onChange(s)}
                className={tabClass(isActive)}
              >
                {t.profile[s]}
              </button>
            );
          })}
          {customTabs.map((c) => {
            const isActive = c.id === active;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                data-tab={c.id}
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                onClick={() => onChange(c.id)}
                className={`${tabClass(isActive)} inline-flex items-center gap-1.5`}
              >
                <span aria-hidden>✦</span>
                {c.label}
              </button>
            );
          })}
        </div>

        {onAddSector &&
          (adding ? (
            <form onSubmit={submit} className="ms-1 flex shrink-0 items-center gap-1.5">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAdding(false);
                    setDraft("");
                  }
                }}
                placeholder={t.profile.addSectorPlaceholder}
                aria-label={t.profile.addSectorHint}
                maxLength={60}
                className="w-52 rounded-md border border-accent/50 bg-ink-100 px-2.5 py-1 text-xs text-ink-800 shadow-card focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                disabled={draft.trim().length < 2}
                className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
              >
                {t.profile.research}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setDraft("");
                }}
                aria-label={t.common.cancel}
                className="rounded-md px-1.5 py-1 text-xs text-ink-500 hover:text-ink-800"
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              title={t.profile.addSectorHint}
              aria-label={t.profile.addSector}
              className="ms-1 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-dashed border-ink-300 text-sm text-ink-500 transition hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              +
            </button>
          ))}
      </div>
    </div>
  );
}
