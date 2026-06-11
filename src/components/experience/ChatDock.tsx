"use client";

import { MarkdownView } from "@/components/chat/MarkdownView";
import { useToast } from "@/lib/hooks/useToast";
import { stripForSpeech, useSpeakAloud, useVoiceInput } from "@/lib/hooks/useVoice";
import { useI18n } from "@/lib/i18n/context";
import { formatMetric } from "@/utils/format";
import { useRef, useState } from "react";

interface ComparisonCell {
  value: number;
  unit: string;
  year: number;
}
interface AskResponse {
  kind: "prepare" | "compare" | "general";
  iso3?: string;
  answer?: string | null;
  abstained?: boolean;
  citations?: string[];
  suggestIso3?: string;
  comparison?: {
    countries: { iso3: string; name: string }[];
    rows: { metric: string; a: ComparisonCell | null; b: ComparisonCell | null }[];
  };
}
interface Turn {
  q: string;
  res?: AskResponse;
  error?: boolean;
}

export type SharedHistory = { role: "user" | "assistant"; content: string }[];

export function ChatDock({
  onPrepare,
  sessionId,
  sharedHistory,
}: {
  onPrepare: (iso3: string) => void;
  /** Optional externally-owned session id + history so chat and voice-call
   *  modes share one conversation thread instead of two amnesiac ones. */
  sessionId?: string;
  sharedHistory?: SharedHistory;
}) {
  const { t, locale } = useI18n();
  const x = t.experience.chatDock;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const ownHistoryRef = useRef<SharedHistory>([]);
  const history = sharedHistory ?? ownHistoryRef.current;
  // Stable per-mount session id so all dock turns correlate in the chat log.
  const ownSessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? `dock-${crypto.randomUUID()}`
      : `dock-${Math.random().toString(36).slice(2)}`,
  );
  const effectiveSessionId = sessionId ?? ownSessionIdRef.current;

  // Voice loop: spoken question → answer read back aloud.
  const { push: pushToast } = useToast();
  const speakReplyRef = useRef(false);
  const { speaking, speak, stop: stopSpeaking } = useSpeakAloud(locale);
  const voice = useVoiceInput(
    locale,
    (transcript) => {
      speakReplyRef.current = true;
      void ask(transcript);
    },
    (code) => {
      pushToast({
        kind: code === "no-speech" || code === "aborted" ? "info" : "warn",
        title: t.chat.voiceErrorTitle,
        detail: t.chat.voiceErrors[code],
      });
    },
  );

  async function ask(q: string) {
    setBusy(true);
    setTurns((ts) => [...ts, { q }]);
    try {
      const res = await fetch("/api/chat/ask", {
        method: "POST",
        headers: { "content-type": "application/json", "x-session-id": effectiveSessionId },
        body: JSON.stringify({ question: q, history: history.slice(-6) }),
      });
      if (!res.ok) throw new Error(`ask failed (${res.status})`);
      const data = (await res.json()) as AskResponse;
      if (data.kind === "prepare" && data.iso3) {
        setTurns((ts) => ts.slice(0, -1));
        onPrepare(data.iso3);
        return;
      }
      history.push({ role: "user", content: q });
      if (data.answer) history.push({ role: "assistant", content: data.answer });
      setTurns((ts) => [...ts.slice(0, -1), { q, res: data }]);
      if (speakReplyRef.current && data.answer && !data.abstained) {
        speakReplyRef.current = false;
        speak(stripForSpeech(data.answer));
      } else {
        speakReplyRef.current = false;
      }
    } catch {
      speakReplyRef.current = false;
      setTurns((ts) => [...ts.slice(0, -1), { q, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const q = value.trim();
          if (q.length < 2 || busy) return;
          setValue("");
          void ask(q);
        }}
        className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-100/80 p-1.5 backdrop-blur"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={x.placeholder}
          aria-label={x.placeholder}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-ink-400"
          disabled={busy}
        />
        {voice.supported && (
          <button
            type="button"
            onClick={() =>
              voice.listening ? voice.stop() : speaking ? stopSpeaking() : voice.start()
            }
            disabled={busy}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base transition disabled:opacity-40 ${
              voice.listening
                ? "animate-pulse bg-signal-risk/15 text-signal-risk"
                : "bg-ink-150 text-ink-700 hover:bg-ink-200/80"
            }`}
            title={voice.listening ? t.chat.voiceListening : t.chat.voiceAsk}
            aria-label={voice.listening ? t.chat.voiceListening : t.chat.voiceAsk}
            aria-pressed={voice.listening}
          >
            <span aria-hidden>🎙️</span>
          </button>
        )}
        <button
          type="submit"
          disabled={busy || value.trim().length < 2}
          className="rounded-lg bg-ink-150 px-4 py-2 text-sm font-semibold text-tamm-cyan transition hover:bg-ink-200/80 disabled:opacity-40"
        >
          {x.send}
        </button>
      </form>

      <div className="mt-3 space-y-3">
        {turns.map((turn, i) => (
          <div
            key={`${i}-${turn.q}`}
            className="animate-in rounded-xl border border-ink-200 bg-ink-100/95 p-4 text-start"
          >
            <p className="text-2xs uppercase tracking-wide text-ink-400">
              {x.you} · <span className="normal-case text-ink-600">{turn.q}</span>
            </p>
            <div className="mt-2">
              {!turn.res && !turn.error && (
                <p className="flex items-center gap-2 text-sm text-tamm-cyan">
                  <span className="h-2 w-2 animate-ping rounded-full bg-tamm-cyan" aria-hidden />
                  {x.thinking}
                </p>
              )}
              {turn.error && <p className="text-sm text-signal-risk">{x.error}</p>}
              {turn.res?.abstained && (
                <div className="space-y-2">
                  <p className="text-sm text-tamm-olive">⚠ {x.abstained}</p>
                  {turn.res.suggestIso3 && (
                    <button
                      type="button"
                      onClick={() => onPrepare(turn.res?.suggestIso3 as string)}
                      className="rounded-lg border border-tamm-cyan/40 px-3 py-1.5 text-sm font-medium text-tamm-cyan transition hover:bg-tamm-cyan/10"
                    >
                      {x.runFull} →
                    </button>
                  )}
                </div>
              )}
              {turn.res?.answer && !turn.res.abstained && (
                <div className="text-sm text-ink-800 [&_*]:text-ink-800">
                  <MarkdownView text={turn.res.answer} />
                </div>
              )}
              {turn.res?.comparison && (
                <div className="mt-3 overflow-x-auto rounded-lg border border-ink-200">
                  <p className="border-b border-ink-200 px-3 py-1.5 text-2xs uppercase tracking-wide text-ink-400">
                    {x.comparison}
                  </p>
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-ink-500">
                        <th aria-hidden />
                        {turn.res.comparison.countries.map((c) => (
                          <th
                            key={c.iso3}
                            className="px-3 py-1.5 text-start font-semibold text-ink-700"
                          >
                            {c.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {turn.res.comparison.rows
                        .filter((r) => r.a || r.b)
                        .map((r) => (
                          <tr key={r.metric} className="border-t border-ink-150">
                            <td className="px-3 py-1.5 text-ink-500">
                              {(t.metrics as Record<string, string>)[r.metric] ?? r.metric}
                            </td>
                            {[r.a, r.b].map((cell, ci) => (
                              <td
                                key={`${r.metric}-${ci === 0 ? "a" : "b"}`}
                                className="px-3 py-1.5 tabular text-ink-800"
                              >
                                {cell ? (
                                  <span>
                                    {formatMetric(cell.value, cell.unit, locale)}{" "}
                                    <span className="text-ink-400">·{cell.year}</span>
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
              {turn.res?.citations && turn.res.citations.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-2xs uppercase tracking-wide text-ink-400">
                    {x.sources}:
                  </span>
                  {turn.res.citations.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-ink-200 px-2 py-0.5 text-2xs text-ink-600"
                    >
                      {c}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
