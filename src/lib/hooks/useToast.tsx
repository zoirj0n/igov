"use client";

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ToastKind = "info" | "success" | "warn" | "error";

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastContext {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastContext | null>(null);

const AUTO_DISMISS_MS: Record<ToastKind, number> = {
  info: 4500,
  success: 3500,
  warn: 6500,
  error: 0, // sticky — user must dismiss
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Per-toast timer ids. Survives re-renders so existing toasts keep their own countdown.
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((all) => all.filter((t) => t.id !== id));
    const tid = timersRef.current.get(id);
    if (tid !== undefined) {
      window.clearTimeout(tid);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id =
        globalThis.crypto?.randomUUID?.() ??
        `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((all) => [...all, { ...t, id }]);
      const ttl = AUTO_DISMISS_MS[t.kind];
      if (ttl > 0) {
        const tid = window.setTimeout(() => {
          dismiss(id);
        }, ttl);
        timersRef.current.set(id, tid);
      }
    },
    [dismiss],
  );

  // Clear all timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const tid of timers.values()) window.clearTimeout(tid);
      timers.clear();
    };
  }, []);

  return (
    <Ctx.Provider value={{ toasts, push, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} timersRef={timersRef} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}

function ToastViewport({
  toasts,
  dismiss,
  timersRef,
}: {
  toasts: Toast[];
  dismiss: (id: string) => void;
  timersRef: React.MutableRefObject<Map<string, number>>;
}) {
  function pause(id: string): void {
    const tid = timersRef.current.get(id);
    if (tid !== undefined) {
      window.clearTimeout(tid);
      timersRef.current.delete(id);
    }
  }
  return (
    <div
      className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-[360px] flex-col gap-2"
      role="region"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onMouseEnter={() => pause(t.id)}
          onFocus={() => pause(t.id)}
          className={`pointer-events-auto overflow-hidden rounded-sm border bg-ink-100 shadow-md transition-all duration-200 ${
            t.kind === "error"
              ? "border-signal-risk/40"
              : t.kind === "warn"
                ? "border-signal-warn/40"
                : t.kind === "success"
                  ? "border-signal-ok/40"
                  : "border-ink-200"
          }`}
        >
          <div className="flex items-start gap-3 p-3">
            <div
              className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                t.kind === "error"
                  ? "bg-signal-risk"
                  : t.kind === "warn"
                    ? "bg-signal-warn"
                    : t.kind === "success"
                      ? "bg-signal-ok"
                      : "bg-accent"
              }`}
              aria-hidden
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-ink-800">{t.title}</div>
              {t.detail && <div className="mt-0.5 text-xs text-ink-500">{t.detail}</div>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-ink-400 hover:text-ink-800"
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
