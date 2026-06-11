"use client";

import { type Role, hasRole, useAuthedUser } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n/context";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavKey =
  | "dashboard"
  | "agent"
  | "compare"
  | "insights"
  | "cooperation"
  | "briefings"
  | "chat"
  | "video"
  | "sources"
  | "activity"
  | "admin"
  | "settings";

interface NavItem {
  href: string;
  key: NavKey;
  minRole: Role;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    title: "Intelligence",
    items: [
      { href: "/dashboard", key: "dashboard", minRole: "viewer" },
      { href: "/agent", key: "agent", minRole: "viewer" },
      { href: "/compare", key: "compare", minRole: "viewer" },
      { href: "/insights", key: "insights", minRole: "analyst" },
      { href: "/cooperation", key: "cooperation", minRole: "analyst" },
    ],
  },
  {
    title: "Production",
    items: [
      { href: "/briefings", key: "briefings", minRole: "analyst" },
      { href: "/chat", key: "chat", minRole: "analyst" },
      { href: "/video", key: "video", minRole: "lead" },
      { href: "/sources", key: "sources", minRole: "analyst" },
    ],
  },
  {
    title: "Operate",
    items: [
      { href: "/activity", key: "activity", minRole: "viewer" },
      { href: "/admin", key: "admin", minRole: "admin" },
      { href: "/settings", key: "settings", minRole: "viewer" },
    ],
  },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen = false, onMobileClose }: Props) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();
  const { user } = useAuthedUser();
  const isActive = (href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onMobileClose}
          className="fixed inset-0 z-30 bg-black/70 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 z-40 flex-col border-e border-ink-100 bg-ink-100 transition-[width,transform] duration-200 ease-out md:flex ${
          collapsed ? "md:w-[64px]" : "md:w-[228px]"
        } ${mobileOpen ? "flex w-[260px] translate-x-0" : "hidden md:flex md:translate-x-0 -translate-x-full"}`}
        aria-label="Primary navigation"
      >
        <div className="flex h-16 items-center gap-3 border-b border-ink-100 px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent to-accent-strong text-sm font-bold text-white shadow-card">
              CI
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold tracking-tight text-ink-800">
                  {t.appName}
                </div>
                <div className="text-2xs font-medium uppercase text-ink-400">UAE Gov</div>
              </div>
            )}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((sec) => {
            const visibleItems = sec.items.filter((item) => hasRole(user, item.minRole));
            if (visibleItems.length === 0) return null;
            return (
              <div key={sec.title} className="mb-4 last:mb-0">
                {!collapsed && (
                  <div className="px-3 pb-1.5 text-2xs font-medium uppercase text-ink-400">
                    {sec.title}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={
                            active
                              ? "flex items-center gap-3 rounded-md bg-ink-100 px-3 py-2 text-sm font-medium text-ink-800"
                              : "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-150 hover:text-ink-800"
                          }
                          title={collapsed ? t.nav[item.key] : undefined}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-accent" : "bg-ink-300"}`}
                            aria-hidden
                          />
                          {!collapsed && <span className="truncate">{t.nav[item.key]}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {!collapsed && user && (
          <div className="border-t border-ink-100 px-3 py-2.5">
            <div className="text-2xs font-medium uppercase text-ink-400">Signed in as</div>
            <div className="truncate text-xs font-medium text-ink-700">{user.name}</div>
            <div className="text-2xs text-ink-500">
              {user.role} · {user.clearance}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onToggle}
          className="hidden border-t border-ink-100 px-3 py-3 text-2xs font-medium uppercase text-ink-500 transition hover:bg-ink-150 hover:text-ink-800 md:block"
          aria-label={collapsed ? t.shell.expandSidebar : t.shell.collapseSidebar}
        >
          {collapsed ? "→" : `← ${t.shell.collapseSidebar}`}
        </button>
      </aside>
    </>
  );
}
