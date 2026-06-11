"use client";

/**
 * Replace one (or more) query-string keys on the current URL without pushing
 * to history. Use for filter/tab state that should survive refresh + back/forward
 * but shouldn't pollute browser history with one entry per keystroke.
 *
 * Pass `undefined` (or empty string, or the literal "all") as a value to remove
 * the key. Defaults drop from the URL so shareable links stay clean.
 */
export function syncSearchParam(updates: Record<string, string | undefined>): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(updates)) {
    if (v === undefined || v === "" || v === "all") {
      url.searchParams.delete(k);
    } else {
      url.searchParams.set(k, v);
    }
  }
  window.history.replaceState(null, "", url.toString());
}
