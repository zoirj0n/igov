"use client";

import { useAuthedUser } from "@/lib/auth/client";
import { useTheme } from "@/lib/hooks/useTheme";
import { useI18n } from "@/lib/i18n/context";
import Link from "next/link";
import { useState } from "react";

export function ExperienceHeader() {
  const { locale, setLocale, t } = useI18n();
  const { user } = useAuthedUser();
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const item = "block rounded px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-150 hover:text-ink-900";

  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-[#b68a35] to-tamm-cyan font-bold text-[#06121a]">
          ◈
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink-900">{t.appName}</div>
          {user && <div className="text-2xs text-ink-400">{user.name}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <span className="rounded-full border border-tamm-olive/40 bg-tamm-olive/10 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-tamm-oliveDark">
            {user.clearance}
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={t.experience.themeToggle}
          title={t.experience.themeToggle}
          className="rounded-full border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition hover:text-ink-900"
        >
          {theme === "light" ? "☾" : "☀"}
        </button>
        <div className="inline-flex overflow-hidden rounded-full border border-ink-200 text-xs">
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={
              locale !== "ar" ? "bg-ink-200/70 px-3 py-1 text-ink-900" : "px-3 py-1 text-ink-500"
            }
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocale("ar")}
            className={
              locale === "ar" ? "bg-ink-200/70 px-3 py-1 text-ink-900" : "px-3 py-1 text-ink-500"
            }
          >
            عربي
          </button>
        </div>
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More pages"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-full border border-ink-200 px-3 py-1 text-xs text-ink-600 hover:text-ink-900"
          >
            ☰
          </button>
          {menuOpen && (
            <nav
              aria-label="Legacy pages"
              className="absolute end-0 top-9 z-30 w-44 rounded-md border border-ink-200 bg-ink-100 p-1 shadow-pop"
            >
              <Link href="/dashboard" className={item}>
                {t.nav.dashboard}
              </Link>
              <Link href="/briefings" className={item}>
                {t.nav.briefings}
              </Link>
              <Link href="/sources" className={item}>
                {t.nav.sources}
              </Link>
              <Link href="/admin" className={item}>
                {t.nav.admin}
              </Link>
              <Link href="/settings" className={item}>
                {t.nav.settings}
              </Link>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
