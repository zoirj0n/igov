"use client";

import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/shared/Skeleton";
import { hasRole, useAuthedUser } from "@/lib/auth/client";
import { COUNTRIES } from "@/lib/data/countries";
import { syncSearchParam } from "@/lib/hooks/syncSearchParam";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useI18n } from "@/lib/i18n/context";
import type { Briefing } from "@/types";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const badgeClass: Record<string, string> = {
  public: "chip chip-muted",
  internal: "chip chip-info",
  confidential: "chip chip-warn",
  secret: "chip chip-risk",
};

type SortKey = "createdAt" | "title" | "country" | "classification";
type ClassFilter = "all" | "public" | "internal" | "confidential" | "secret";

const CLASS_VALUES: ClassFilter[] = ["all", "public", "internal", "confidential", "secret"];

export function BriefingsList() {
  useDocumentTitle("Briefings");
  const { t, locale } = useI18n();
  const { user } = useAuthedUser();
  const canCreate = hasRole(user, "analyst");
  const sp = useSearchParams();
  const initialFilter = (sp?.get("filter") === "mine" ? "mine" : "all") as "all" | "mine";
  const initialClass = (() => {
    const v = sp?.get("class");
    return (CLASS_VALUES as string[]).includes(v ?? "") ? (v as ClassFilter) : "all";
  })();
  const initialQuery = sp?.get("q") ?? "";
  const [filter, setFilterState] = useState<"all" | "mine">(initialFilter);
  const [classFilter, setClassFilterState] = useState<ClassFilter>(initialClass);
  const [query, setQueryState] = useState(initialQuery);
  function setFilter(v: "all" | "mine"): void {
    setFilterState(v);
    syncSearchParam({ filter: v });
  }
  function setClassFilter(v: ClassFilter): void {
    setClassFilterState(v);
    syncSearchParam({ class: v });
  }
  function setQuery(v: string): void {
    setQueryState(v);
    syncSearchParam({ q: v });
  }
  const [data, setData] = useState<Briefing[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"db" | "memory" | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "createdAt",
    dir: "desc",
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: { email: string } | null }) => {
        if (!cancelled && d.user) setMe(d.user.email);
      })
      .catch(() => {
        // ignore
      });
    fetch("/api/briefings")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${r.status}`);
        return d as { briefings: Briefing[]; source: "db" | "memory" };
      })
      .then((d) => {
        if (!cancelled) {
          setData(d.briefings);
          setSource(d.source);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (data === null) return null;
    const q = query.trim().toLowerCase();
    const rows = data.filter((b) => {
      if (filter === "mine" && me && b.createdBy !== me) return false;
      if (classFilter !== "all" && b.classification !== classFilter) return false;
      if (q) {
        const hay = `${b.title} ${b.audience} ${b.countryIso3} ${b.createdBy}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...rows].sort((a, b) => {
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.key) {
        case "title":
          return a.title.localeCompare(b.title) * dir;
        case "country":
          return a.countryIso3.localeCompare(b.countryIso3) * dir;
        case "classification":
          return a.classification.localeCompare(b.classification) * dir;
        default:
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      }
    });
    return sorted;
  }, [data, filter, classFilter, query, me, sort]);

  const classCounts = useMemo(() => {
    const c = { all: 0, public: 0, internal: 0, confidential: 0, secret: 0 } as Record<
      ClassFilter,
      number
    >;
    if (!data) return c;
    for (const b of data) {
      if (filter === "mine" && me && b.createdBy !== me) continue;
      c.all += 1;
      c[b.classification as ClassFilter] += 1;
    }
    return c;
  }, [data, filter, me]);

  function toggleSort(key: SortKey): void {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  function arrow(key: SortKey): string {
    if (sort.key !== key) return "";
    return sort.dir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-semibold tracking-tighter text-ink-800">
              {t.briefings.title}
            </h1>
            {source && <span className="chip chip-muted">{source}</span>}
          </div>
          <p className="mt-1.5 text-sm text-ink-500">Clearance-filtered. Sortable columns.</p>
        </div>
        {canCreate && (
          <a href="/briefings/new" className="btn-primary inline-flex items-center gap-1.5">
            <span aria-hidden>+</span> {t.briefings.newBriefing.replace("+ ", "")}
          </a>
        )}
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-ink-150 bg-ink-100 p-0.5 shadow-card">
          <button
            onClick={() => setFilter("all")}
            className={
              filter === "all"
                ? "rounded-sm bg-accent px-3.5 py-1.5 text-xs font-medium text-white"
                : "rounded-sm px-3.5 py-1.5 text-xs text-ink-600 transition hover:text-ink-800"
            }
            type="button"
          >
            {t.briefings.filterAll}
          </button>
          <button
            onClick={() => setFilter("mine")}
            className={
              filter === "mine"
                ? "rounded-sm bg-accent px-3.5 py-1.5 text-xs font-medium text-white"
                : "rounded-sm px-3.5 py-1.5 text-xs text-ink-600 transition hover:text-ink-800"
            }
            type="button"
          >
            {t.briefings.filterMine}
          </button>
        </div>
        <div className="inline-flex flex-wrap gap-1.5">
          {(["all", "public", "internal", "confidential", "secret"] as ClassFilter[]).map((c) => {
            const n = classCounts[c];
            const isActive = classFilter === c;
            const base =
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-2xs transition";
            const tone = isActive
              ? "border-ink-800 bg-accent text-white"
              : "border-ink-150 bg-ink-100 text-ink-600 hover:border-ink-300 hover:text-ink-800";
            return (
              <button
                key={c}
                type="button"
                onClick={() => setClassFilter(c)}
                className={`${base} ${tone}`}
                aria-pressed={isActive}
              >
                <span className="capitalize">{c === "all" ? "All classifications" : c}</span>
                <span className="rounded-xs bg-ink-100/40 px-1 font-mono text-2xs">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, audience, country…"
            className="w-64 rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-xs shadow-card transition focus:border-accent focus:outline-none"
            aria-label="Search briefings"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-2xs text-ink-500 transition hover:text-ink-800"
              aria-label="Clear search"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-md border border-signal-risk/30 bg-signal-risk/5 px-3 py-2 text-xs text-signal-risk"
        >
          {error}
        </div>
      )}

      {data === null && !error && (
        <div className="card space-y-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <EmptyState
          title={t.shell.empty}
          detail={
            query
              ? `No briefings match "${query}".`
              : classFilter !== "all"
                ? `No ${classFilter} briefings.`
                : filter === "mine"
                  ? "You have no briefings yet."
                  : "No briefings visible at your clearance."
          }
          action={
            query || classFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setClassFilter("all");
                }}
                className="btn-ghost"
              >
                Clear filters
              </button>
            ) : (
              <a href="/briefings/new" className="btn-primary">
                {t.briefings.newBriefing}
              </a>
            )
          }
        />
      )}

      {filtered && filtered.length > 0 && (
        <div className="card overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 border-b border-ink-100 bg-ink-50/95 backdrop-blur">
              <tr>
                <th
                  className="cursor-pointer select-none px-5 py-3 text-start text-2xs font-medium uppercase tracking-wide text-ink-500 transition hover:text-ink-800"
                  onClick={() => toggleSort("title")}
                >
                  {t.briefings.title}
                  {arrow("title")}
                </th>
                <th
                  className="cursor-pointer select-none px-5 py-3 text-start text-2xs font-medium uppercase tracking-wide text-ink-500 transition hover:text-ink-800"
                  onClick={() => toggleSort("country")}
                >
                  {t.briefings.country}
                  {arrow("country")}
                </th>
                <th className="px-5 py-3 text-start text-2xs font-medium uppercase tracking-wide text-ink-500">
                  {t.briefings.audience}
                </th>
                <th
                  className="cursor-pointer select-none px-5 py-3 text-start text-2xs font-medium uppercase tracking-wide text-ink-500 transition hover:text-ink-800"
                  onClick={() => toggleSort("createdAt")}
                >
                  {t.briefings.created}
                  {arrow("createdAt")}
                </th>
                <th className="px-5 py-3 text-end text-2xs font-medium uppercase tracking-wide text-ink-500">
                  {t.briefings.open}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const country = COUNTRIES.find((c) => c.iso3 === b.countryIso3);
                const countryName = country
                  ? locale === "ar"
                    ? country.nameAr
                    : country.nameEn
                  : b.countryIso3;
                const href = `/briefings/${b.id}`;
                function navigate(e: React.MouseEvent | React.KeyboardEvent): void {
                  if (typeof window === "undefined") return;
                  if ("metaKey" in e && (e.metaKey || e.ctrlKey)) {
                    window.open(href, "_blank");
                  } else {
                    window.location.href = href;
                  }
                }
                return (
                  <tr
                    key={b.id}
                    onClick={navigate}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") navigate(e);
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Open briefing: ${b.title}`}
                    className="cursor-pointer border-b border-ink-100 last:border-0 transition hover:bg-ink-150/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="font-medium text-ink-800">{b.title}</span>
                        <span className={badgeClass[b.classification]}>
                          {t.common.classification[b.classification]}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-ink-700">
                      <span className="me-1.5">{country?.flagEmoji}</span>
                      {countryName}
                    </td>
                    <td className="px-5 py-3.5 text-ink-600">{b.audience}</td>
                    <td className="px-5 py-3.5 font-mono text-2xs text-ink-500">
                      {new Date(b.createdAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-5 py-3.5 text-end">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                        {t.briefings.open}
                        <span aria-hidden>→</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
