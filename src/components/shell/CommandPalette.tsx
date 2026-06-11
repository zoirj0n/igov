"use client";

import { BRIEFINGS } from "@/lib/data/briefings";
import { COUNTRIES } from "@/lib/data/countries";
import { useI18n } from "@/lib/i18n/context";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

interface CmdItem {
  id: string;
  group: "Pages" | "Countries" | "Briefings" | "Actions";
  label: string;
  hint?: string;
  href?: string;
  action?: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [selected, setSelected] = useState(0);

  const pages: CmdItem[] = useMemo(
    () => [
      {
        id: "p-dashboard",
        group: "Pages",
        label: t.nav.dashboard,
        href: "/dashboard",
        hint: "G D",
      },
      { id: "p-compare", group: "Pages", label: t.nav.compare, href: "/compare", hint: "G C" },
      {
        id: "p-briefings",
        group: "Pages",
        label: t.nav.briefings,
        href: "/briefings",
        hint: "G B",
      },
      { id: "p-chat", group: "Pages", label: t.nav.chat, href: "/chat" },
      { id: "p-video", group: "Pages", label: t.nav.video, href: "/video" },
      { id: "p-insights", group: "Pages", label: t.nav.insights, href: "/insights" },
      { id: "p-cooperation", group: "Pages", label: t.nav.cooperation, href: "/cooperation" },
      { id: "p-activity", group: "Pages", label: t.nav.activity, href: "/activity" },
      { id: "p-admin", group: "Pages", label: t.nav.admin, href: "/admin" },
      { id: "p-settings", group: "Pages", label: t.nav.settings, href: "/settings" },
    ],
    [t],
  );

  const items: CmdItem[] = useMemo(
    () => [
      ...pages,
      ...COUNTRIES.map(
        (c): CmdItem => ({
          id: `c-${c.iso3}`,
          group: "Countries",
          label: `${c.flagEmoji} ${locale === "ar" ? c.nameAr : c.nameEn}`,
          hint: c.iso3,
          href: `/country/${c.iso3}`,
        }),
      ),
      ...BRIEFINGS.map(
        (b): CmdItem => ({
          id: `b-${b.id}`,
          group: "Briefings",
          label: b.title,
          hint: b.countryIso3,
          href: `/briefings/${b.id}`,
        }),
      ),
      { id: "a-new-briefing", group: "Actions", label: "+ New briefing", href: "/briefings/new" },
      { id: "a-new-chat", group: "Actions", label: "New chat", href: "/chat" },
    ],
    [pages, locale],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 14);
    return items
      .filter(
        (i) =>
          i.label.toLowerCase().includes(needle) || (i.hint ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 30);
  }, [q, items]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [q, open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-cmd-row="${selected}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === "Enter") {
        const item = filtered[selected];
        if (!item) return;
        e.preventDefault();
        run(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function run(item: CmdItem): void {
    onClose();
    if (item.href) router.push(item.href);
    else item.action?.();
  }

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-[95] grid place-items-start pt-24"
    >
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div className="relative mx-auto w-[92vw] max-w-xl overflow-hidden rounded-sm border border-ink-200 bg-ink-100 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-ink-200 px-4 py-3">
          <span className="text-ink-400" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.shell.commandPalette}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
          />
          <kbd className="rounded-xs border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
            esc
          </kbd>
        </div>
        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-400">{t.shell.noResults}</li>
          )}
          {filtered.map((item, i) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <li key={item.id} data-cmd-row={i}>
                {showGroup && (
                  <div className="px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-ink-400">
                    {item.group}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => run(item)}
                  className={
                    selected === i
                      ? "flex w-full items-center justify-between gap-3 bg-accent-subtle/60 px-4 py-2 text-start text-sm text-ink-800"
                      : "flex w-full items-center justify-between gap-3 px-4 py-2 text-start text-sm text-ink-700 hover:bg-ink-150"
                  }
                >
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="shrink-0 font-mono text-[11px] text-ink-400">{item.hint}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="flex items-center justify-between border-t border-ink-200 bg-ink-50 px-4 py-2 text-[11px] text-ink-500">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span>{filtered.length} results</span>
        </footer>
      </div>
    </div>
  );
}
