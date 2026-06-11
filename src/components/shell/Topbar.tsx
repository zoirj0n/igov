"use client";

import { LocaleToggle } from "@/components/dashboard/LocaleToggle";
import type { AuthUser } from "@/lib/auth/types";
import { useI18n } from "@/lib/i18n/context";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface Props {
  onOpenPalette: () => void;
  onOpenMobileNav?: () => void;
}

interface Notification {
  id: string;
  title: string;
  detail: string;
  ts: string;
  kind: "ok" | "info" | "warn" | "risk";
}

interface AuditEvent {
  ts: string;
  actor?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  meta?: Record<string, unknown>;
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Math.max(0, Date.now() - t);
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function auditToNotification(e: AuditEvent): Notification | null {
  // Filter to user-meaningful events.
  const a = e.action;
  if (a === "cost.budget.exceeded" || a === "cost.budget.blocked") {
    const scope = (e.meta?.scope as string | undefined) ?? "?";
    return {
      id: `${a}-${e.ts}`,
      title: a === "cost.budget.blocked" ? "Budget cap blocked call" : "Budget cap crossed",
      detail: `${scope} scope`,
      ts: relTime(e.ts),
      kind: a === "cost.budget.blocked" ? "risk" : "warn",
    };
  }
  if (a === "briefing.generate.ok") {
    return {
      id: `${a}-${e.ts}`,
      title: "Briefing generated",
      detail: e.resourceId ? `${e.resourceId} · ${e.actor ?? ""}` : (e.actor ?? ""),
      ts: relTime(e.ts),
      kind: "info",
    };
  }
  if (a === "ai.chat.output.elevated") {
    return {
      id: `${a}-${e.ts}`,
      title: "Clearance ceiling hit",
      detail: `Chat tried to emit ${e.meta?.classification ?? "?"} for ${e.meta?.userClearance ?? "?"}`,
      ts: relTime(e.ts),
      kind: "warn",
    };
  }
  if (a === "ingest.ok" || a === "import.ok") {
    return {
      id: `${a}-${e.ts}`,
      title: "Ingest succeeded",
      detail: e.resourceId ?? "",
      ts: relTime(e.ts),
      kind: "ok",
    };
  }
  if (a.endsWith(".error") || a.endsWith(".failed")) {
    return {
      id: `${a}-${e.ts}`,
      title: a.replace(/\./g, " "),
      detail: (e.meta?.error as string | undefined) ?? "",
      ts: relTime(e.ts),
      kind: "risk",
    };
  }
  return null;
}

export function Topbar({ onOpenPalette, onOpenMobileNav }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [offline, setOffline] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    function check(): void {
      fetch("/api/admin/llm", { cache: "no-store" })
        .then(async (r) => (r.ok ? r.json() : null))
        .then((d: { current?: { offline?: boolean } } | null) => {
          if (!cancelled && d?.current) setOffline(d.current.offline === true);
        })
        .catch(() => {});
    }
    check();
    const id = window.setInterval(check, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);
  const unread = notifications.length;
  const bellRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: AuthUser | null }) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  // Pull recent audit events for admins. Non-admin = empty notification list.
  useEffect(() => {
    if (user?.role !== "admin") {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    function refresh(): void {
      fetch("/api/admin/audit", { cache: "no-store" })
        .then(async (r) => (r.ok ? r.json() : { events: [] }))
        .then((d: { events?: AuditEvent[] }) => {
          if (cancelled) return;
          const items: Notification[] = [];
          for (const e of d.events ?? []) {
            const n = auditToNotification(e);
            if (n) items.push(n);
            if (items.length >= 8) break;
          }
          setNotifications(items);
        })
        .catch(() => {});
    }
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user?.role]);

  useEffect(() => {
    if (!bell && !menu) return;
    function onPointer(e: PointerEvent): void {
      const target = e.target as Node | null;
      if (bell && bellRef.current && target && !bellRef.current.contains(target)) setBell(false);
      if (menu && menuRef.current && target && !menuRef.current.contains(target)) setMenu(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setBell(false);
        setMenu(false);
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [bell, menu]);

  async function signOut(): Promise<void> {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    router.replace("/login");
  }

  const initials = user
    ? user.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0] ?? "")
        .join("")
        .toUpperCase()
    : "··";

  return (
    <header className="sticky top-0 z-20 border-b border-ink-100 bg-ink-50/80 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
        {onOpenMobileNav && (
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-ink-150 bg-ink-100 text-ink-700 shadow-card transition hover:border-ink-300 hover:text-ink-800 md:hidden"
          >
            <span aria-hidden className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex w-full max-w-xl items-center gap-3 rounded-md border border-ink-150 bg-ink-100 px-3.5 py-2 text-start text-sm text-ink-400 shadow-card transition hover:border-ink-200 hover:shadow-pop"
          aria-label={t.shell.commandPalette}
        >
          <span className="text-base text-ink-400 transition group-hover:text-accent" aria-hidden>
            ⌕
          </span>
          <span className="flex-1 truncate">{t.shell.commandPalette}</span>
          <kbd className="rounded-xs border border-ink-150 bg-ink-50 px-1.5 py-0.5 font-mono text-2xs font-medium text-ink-500">
            {t.shell.shortcutHint}
          </kbd>
        </button>

        <div className="ms-auto flex items-center gap-2">
          {offline ? (
            <div
              className="flex items-center gap-1.5 rounded-md bg-signal-risk px-2.5 py-1 text-2xs font-bold uppercase tracking-wider text-white shadow-card"
              title="Offline mode active — cloud LLM calls are blocked. Admin: /admin#llm"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-100 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-100" />
              </span>
              ● Offline
            </div>
          ) : (
            <div className="hidden items-center gap-1.5 rounded-md bg-signal-ok/10 px-2.5 py-1 text-2xs font-medium text-signal-ok md:flex">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-ok opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-signal-ok" />
              </span>
              {t.shell.live}
            </div>
          )}

          <LocaleToggle />

          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => setBell((v) => !v)}
              className="relative grid h-9 w-9 place-items-center rounded-md border border-ink-150 bg-ink-100 text-ink-600 shadow-card transition hover:border-ink-200 hover:text-ink-800"
              aria-label={t.shell.notifications}
              aria-expanded={bell}
            >
              <span aria-hidden className="text-base">
                ◔
              </span>
              {unread > 0 && (
                <span className="absolute -top-1 -end-1 grid h-4 w-4 place-items-center rounded-full bg-signal-risk text-[9px] font-bold text-white ring-2 ring-ink-50">
                  {unread}
                </span>
              )}
            </button>
            {bell && (
              <div className="animate-in absolute end-0 mt-2 w-80 overflow-hidden rounded-md border border-ink-150 bg-ink-100 shadow-pop">
                <header className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
                  <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                    {t.shell.notifications}
                  </span>
                  {user?.role === "admin" && (
                    <a href="/activity" className="text-2xs text-accent hover:text-accent-strong">
                      view all →
                    </a>
                  )}
                </header>
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-2xs text-ink-400">
                    {user?.role === "admin"
                      ? "No recent events."
                      : "Notifications visible to admins."}
                  </div>
                ) : (
                  <ul className="max-h-80 divide-y divide-ink-100 overflow-y-auto">
                    {notifications.map((n) => (
                      <li key={n.id} className="px-4 py-3 transition hover:bg-ink-150">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              n.kind === "ok"
                                ? "bg-signal-ok"
                                : n.kind === "warn"
                                  ? "bg-signal-warn"
                                  : n.kind === "risk"
                                    ? "bg-signal-risk"
                                    : "bg-accent"
                            }`}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-ink-800">{n.title}</div>
                            <div className="truncate text-xs text-ink-500" title={n.detail}>
                              {n.detail}
                            </div>
                          </div>
                          <div className="shrink-0 font-mono text-2xs text-ink-400">{n.ts}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-ink-700 to-ink-900 text-xs font-semibold text-white shadow-card transition hover:shadow-pop"
              aria-label={t.shell.profile}
              aria-expanded={menu}
            >
              {initials}
            </button>
            {menu && (
              <div className="animate-in absolute end-0 mt-2 w-60 overflow-hidden rounded-md border border-ink-150 bg-ink-100 shadow-pop">
                <div className="border-b border-ink-100 px-4 py-3">
                  <div className="text-sm font-medium text-ink-800">{user?.name ?? "Guest"}</div>
                  <div className="mt-0.5 text-xs text-ink-500">
                    {user ? `${user.role} · ${user.clearance}` : "not signed in"}
                  </div>
                  {user && (
                    <div className="mt-1 truncate font-mono text-2xs text-ink-400">
                      {user.email}
                    </div>
                  )}
                </div>
                <ul className="py-1 text-sm">
                  <li>
                    <a
                      href="/settings"
                      className="block px-4 py-2 text-ink-700 transition hover:bg-ink-150"
                    >
                      {t.nav.settings}
                    </a>
                  </li>
                  {user?.role === "admin" && (
                    <li>
                      <a
                        href="/admin"
                        className="block px-4 py-2 text-ink-700 transition hover:bg-ink-150"
                      >
                        {t.nav.admin}
                      </a>
                    </li>
                  )}
                  <li className="border-t border-ink-100">
                    <button
                      type="button"
                      onClick={signOut}
                      className="block w-full px-4 py-2 text-start text-signal-risk transition hover:bg-signal-risk/5"
                    >
                      {t.shell.signOut}
                    </button>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
