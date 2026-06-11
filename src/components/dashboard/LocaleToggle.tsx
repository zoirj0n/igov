"use client";

import { useI18n } from "@/lib/i18n/context";

export function LocaleToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <div className="flex items-center rounded-sm border border-ink-200 bg-ink-100 text-xs">
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={
          locale === "en"
            ? "rounded-sm bg-accent px-2.5 py-1 text-white"
            : "px-2.5 py-1 text-ink-500"
        }
        aria-pressed={locale === "en"}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("ar")}
        className={
          locale === "ar"
            ? "rounded-sm bg-accent px-2.5 py-1 text-white"
            : "px-2.5 py-1 text-ink-500"
        }
        aria-pressed={locale === "ar"}
      >
        AR
      </button>
    </div>
  );
}
