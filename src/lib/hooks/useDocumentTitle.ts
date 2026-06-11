"use client";

import { useEffect } from "react";

const BASE = "Country Intelligence";

/**
 * Set the browser tab title to "{section} — Country Intelligence" while
 * the component is mounted. Restores prior title on unmount so back-nav
 * doesn't keep a stale title for a frame.
 */
export function useDocumentTitle(section: string | undefined | null): void {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.title;
    document.title = section ? `${section} — ${BASE}` : BASE;
    return () => {
      document.title = prev;
    };
  }, [section]);
}
