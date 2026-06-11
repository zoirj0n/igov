"use client";

import { type ReactNode, useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg";
}

export function Modal({ open, onClose, title, children, footer, width = "md" }: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;
    // Defer to next tick so modal DOM is mounted.
    const id = window.setTimeout(() => closeBtnRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        // Focus trap: cycle within dialog.
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
      lastFocusedRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widthClass = width === "lg" ? "max-w-3xl" : width === "sm" ? "max-w-sm" : "max-w-xl";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[90] grid place-items-center"
    >
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 transition-opacity"
        tabIndex={-1}
      />
      <div
        ref={dialogRef}
        className={`relative w-[92vw] ${widthClass} animate-in rounded-sm border border-ink-200 bg-ink-100 shadow-xl`}
      >
        <header className="flex items-center justify-between border-b border-ink-200 px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-ink-800">{title}</h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="close"
          >
            ×
          </button>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-ink-200 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
