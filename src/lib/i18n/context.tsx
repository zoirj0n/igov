"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { type Locale, type Messages, messages } from "./messages";

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Messages;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function persistLocale(l: Locale) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `locale=${l}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

// NOTE: Arabic-first is enforced by the root layout, which always passes the
// cookie-derived locale (default "ar") explicitly. The bare default here only
// applies to provider mounts without a prop — i.e. component tests, which
// assert against English copy.
export function I18nProvider({
  initialLocale = "en",
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    persistLocale(l);
  }, []);

  // Migrate pre-cookie preference stored in localStorage; cookie is the
  // server-readable source of truth from now on. Storage access can throw
  // (privacy modes) or be absent (minimal test environments) — skip silently.
  useEffect(() => {
    if (document.cookie.includes("locale=")) return;
    let saved: string | null = null;
    try {
      saved = window.localStorage?.getItem("locale") ?? null;
    } catch {
      return;
    }
    if (saved === "en" || saved === "ar") {
      setLocaleState(saved);
      persistLocale(saved);
    }
  }, []);

  const value: I18nValue = {
    locale,
    dir: locale === "ar" ? "rtl" : "ltr",
    t: messages[locale],
    setLocale,
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
