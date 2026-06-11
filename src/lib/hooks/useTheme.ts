"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try {
    window.localStorage.setItem("theme", t);
  } catch {
    /* storage unavailable — theme still applies for this page */
  }
}

/**
 * App theme (dark default — the cinematic MOEI brand; light = warm cream).
 * The pre-paint script in the root layout applies the stored value before
 * hydration; this hook just mirrors and mutates it.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggle: () => void } {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((curr) => {
      const next: Theme = curr === "light" ? "dark" : "light";
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggle };
}
