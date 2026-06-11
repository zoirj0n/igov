"use client";

import { ChatDock, type SharedHistory } from "@/components/experience/ChatDock";
import { VoiceCallOverlay } from "@/components/shell/VoiceCallOverlay";
import { useAuthedUser } from "@/lib/auth/client";
import { useI18n } from "@/lib/i18n/context";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Floating AI-assistant launcher for executives. Pressing the button opens a
 *  two-option speed-dial: chat (typed/dictated panel) or a full-screen
 *  hands-free voice call. */
export function AssistantFab() {
  const { t } = useI18n();
  const { user } = useAuthedUser();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [inCall, setInCall] = useState(false);
  // One conversation across both modes: a voice turn and a typed turn land in
  // the same history under the same session id (server chat log included).
  const historyRef = useRef<SharedHistory>([]);
  const sessionIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `assistant-${crypto.randomUUID()}`
      : `assistant-${Math.random().toString(36).slice(2)}`,
  );

  // Esc closes the menu or the chat panel (the call handles its own Esc).
  useEffect(() => {
    if ((!menuOpen && !chatOpen) || inCall) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setChatOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, chatOpen, inCall]);

  if (user?.role !== "executive") return null;

  const anyOpen = menuOpen || chatOpen;

  return (
    <>
      {inCall && (
        <VoiceCallOverlay
          onClose={() => setInCall(false)}
          sessionId={sessionIdRef.current}
          sharedHistory={historyRef.current}
        />
      )}

      {chatOpen && !inCall && (
        <div
          role="dialog"
          aria-label={t.shell.assistant}
          className="fixed bottom-24 end-6 z-50 flex max-h-[70vh] w-[min(26rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-ink-50 shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-ink-150 bg-ink-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-ae-gold to-ae-goldDark text-sm text-white"
                aria-hidden
              >
                ◈
              </span>
              <span className="text-sm font-semibold text-ink-800">{t.shell.assistant}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setChatOpen(false);
                  setInCall(true);
                }}
                className="grid h-8 w-8 place-items-center rounded-md text-base text-ae-gold transition hover:bg-ae-gold/10"
                aria-label={t.shell.assistantCall}
                title={t.shell.assistantCall}
              >
                <span aria-hidden>📞</span>
              </button>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="rounded-md px-2 py-1 text-ink-500 transition hover:bg-ink-150 hover:text-ink-800"
                aria-label={t.shell.assistantClose}
              >
                ✕
              </button>
            </div>
          </div>
          <div className="overflow-y-auto px-4 pb-4 [&>div]:mt-3 [&>div]:max-w-none">
            <ChatDock
              onPrepare={(iso3) => router.push(`/agent?q=Prepare me for ${iso3}`)}
              sessionId={sessionIdRef.current}
              sharedHistory={historyRef.current}
            />
          </div>
        </div>
      )}

      {/* Speed-dial options */}
      {menuOpen && !chatOpen && !inCall && (
        <div
          role="menu"
          aria-label={t.shell.assistant}
          className="fixed bottom-24 end-6 z-50 flex flex-col items-end gap-3"
        >
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-ink-100 px-2.5 py-1 text-xs text-ink-700 shadow-card">
              {t.shell.assistantChat}
            </span>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setChatOpen(true);
              }}
              className="grid h-12 w-12 place-items-center rounded-full border border-ae-gold/40 bg-ink-100 text-xl shadow-pop transition-transform hover:scale-110"
              aria-label={t.shell.assistantChat}
            >
              <span aria-hidden>💬</span>
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-ink-100 px-2.5 py-1 text-xs text-ink-700 shadow-card">
              {t.shell.assistantCall}
            </span>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setInCall(true);
              }}
              className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-ae-gold to-ae-goldDark text-xl text-white shadow-pop transition-transform hover:scale-110"
              aria-label={t.shell.assistantCall}
            >
              <span aria-hidden>📞</span>
            </button>
          </div>
        </div>
      )}

      {!inCall && (
        <button
          type="button"
          onClick={() => {
            if (chatOpen) {
              setChatOpen(false);
              return;
            }
            setMenuOpen((o) => !o);
          }}
          className="group fixed bottom-6 end-6 z-50 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-ae-gold to-ae-goldDark text-2xl text-white shadow-pop transition-transform hover:scale-110 active:scale-95"
          aria-label={anyOpen ? t.shell.assistantClose : t.shell.assistant}
          aria-expanded={anyOpen}
        >
          {/* Pulse ring draws the eye without being busy. */}
          {!anyOpen && (
            <span
              className="absolute inset-0 -z-10 animate-ping rounded-full bg-ae-gold/40 [animation-duration:2.5s]"
              aria-hidden
            />
          )}
          <span aria-hidden className="transition-transform group-hover:rotate-12">
            {anyOpen ? "✕" : "✦"}
          </span>
        </button>
      )}
    </>
  );
}
