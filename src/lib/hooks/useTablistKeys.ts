"use client";

import type { KeyboardEvent } from "react";

/**
 * WAI-ARIA Authoring Practices tablist keyboard handler.
 * Returns an onKeyDown handler that cycles tabs with arrows, jumps with Home/End,
 * and refocuses the newly-selected tab.
 *
 * Usage:
 *   <div role="tablist" onKeyDown={useTablistKeys(items, current, setCurrent)}>
 *     {items.map(k => <button data-tab={k} role="tab" tabIndex={k===current?0:-1} ...>)}
 *   </div>
 *
 * @param items   Ordered list of valid tab keys.
 * @param current Currently active tab.
 * @param onChange Setter invoked with the next tab.
 */
export function useTablistKeys<T extends string>(
  items: readonly T[],
  current: T,
  onChange: (next: T) => void,
): (e: KeyboardEvent<HTMLElement>) => void {
  return (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    const idx = items.indexOf(current);
    if (idx < 0) return;
    let n = idx;
    if (e.key === "ArrowLeft") n = (idx - 1 + items.length) % items.length;
    else if (e.key === "ArrowRight") n = (idx + 1) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    const next = items[n];
    if (next === undefined) return;
    onChange(next);
    // Focus the newly-selected tab so keyboard users see focus move.
    const container = e.currentTarget;
    requestAnimationFrame(() => {
      const el = container.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`);
      el?.focus();
    });
  };
}
