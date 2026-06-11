"use client";

import { COUNTRIES } from "@/lib/data/countries";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { useToast } from "@/lib/hooks/useToast";
import { stripForSpeech, useSpeakAloud, useVoiceInput } from "@/lib/hooks/useVoice";
import { useI18n } from "@/lib/i18n/context";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MarkdownView } from "./MarkdownView";
import { RagAnswerView } from "./RagAnswerView";

type Classification = "public" | "internal" | "confidential" | "secret";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  const KEY = "country-intel.sessionId";
  const existing = window.localStorage.getItem(KEY);
  if (existing) return existing;
  const fresh = (globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}`).toString();
  window.localStorage.setItem(KEY, fresh);
  return fresh;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: string[];
  classification?: Classification;
  // RAG-specific extras (only set when message came from /api/rag)
  rag?: {
    intent: string;
    abstained: boolean;
    abstainReasons?: string[];
    facts?: { id: string; value: number; unit: string; year: number; source: string }[];
    passages?: { id: string; source: string; score?: number }[];
    violations?: { kind: string; detail: string }[];
    safety?: {
      injectionFindings?: { passageId: string; patternName: string; excerpt: string }[];
      redactions?: { kind: string; count: number }[];
      echoedInjection?: boolean;
    };
    meta?: { embedVendor: string; rerankVendor: string; durationMs: number; topScore: number };
  };
}

interface SessionSummary {
  sessionId: string;
  firstTs: string;
  lastTs: string;
  turns: number;
  preview: string;
  classification?: Classification;
  actor?: string;
}

const SEED: Message[] = [
  {
    id: "m0",
    role: "assistant",
    text: "Welcome. Ask about countries, indicators, briefings, or cooperation. I cite every claim.",
  },
];

const CLASSIFICATIONS: { value: Classification; label: string; tone: string }[] = [
  { value: "public", label: "Public", tone: "bg-ink-100 text-ink-600" },
  { value: "internal", label: "Internal", tone: "bg-accent-subtle text-accent" },
  { value: "confidential", label: "Confidential", tone: "bg-amber-100 text-amber-800" },
  { value: "secret", label: "Secret", tone: "bg-red-100 text-red-800" },
];

const RANK: Record<Classification, number> = { public: 0, internal: 1, confidential: 2, secret: 3 };

const TONE_FOR: Record<Classification, string> = Object.fromEntries(
  CLASSIFICATIONS.map((c) => [c.value, c.tone]),
) as Record<Classification, string>;

function RagDetails({ rag }: { rag: NonNullable<Message["rag"]> }) {
  const [open, setOpen] = useState(false);
  const factCount = rag.facts?.length ?? 0;
  const passageCount = rag.passages?.length ?? 0;
  const violations = rag.violations?.length ?? 0;
  const injCount = rag.safety?.injectionFindings?.length ?? 0;
  const redCount = rag.safety?.redactions?.reduce((s, r) => s + (r.count ?? 0), 0) ?? 0;
  const safetyHit = injCount > 0 || redCount > 0 || rag.safety?.echoedInjection;
  return (
    <>
      {safetyHit && (
        <div className="mt-2 rounded-md border border-signal-warn/40 bg-signal-warn/5 px-2.5 py-1.5 text-2xs text-ink-700">
          <span className="me-2 rounded-xs bg-signal-warn/20 px-1.5 py-0.5 font-medium uppercase tracking-wide text-signal-warn">
            Safety
          </span>
          {injCount > 0 && (
            <span className="me-3">
              <strong>{injCount}</strong> injection passage(s) dropped
              {rag.safety?.injectionFindings && rag.safety.injectionFindings.length > 0 && (
                <span className="ms-1 font-mono text-ink-500">
                  [{rag.safety.injectionFindings.map((f) => f.patternName).join(", ")}]
                </span>
              )}
            </span>
          )}
          {redCount > 0 && (
            <span className="me-3">
              <strong>{redCount}</strong> PII redaction(s)
              <span className="ms-1 font-mono text-ink-500">
                [{rag.safety?.redactions?.map((r) => `${r.kind}×${r.count}`).join(", ")}]
              </span>
            </span>
          )}
          {rag.safety?.echoedInjection && (
            <span className="me-3 text-signal-risk">⚠ output echoed injection pattern</span>
          )}
        </div>
      )}
      <div className="mt-2 rounded-md border border-ink-100 bg-ink-50/50 text-2xs">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-ink-600 hover:text-ink-800"
        >
          <span className="flex items-center gap-2">
            <span className="rounded-xs bg-accent/15 px-1.5 py-0.5 font-medium uppercase tracking-wide text-accent">
              RAG
            </span>
            {rag.abstained ? (
              <span className="font-medium text-signal-risk">abstained</span>
            ) : (
              <>
                <span>{factCount} facts</span>
                <span className="text-ink-300">·</span>
                <span>{passageCount} passages</span>
                {violations > 0 && (
                  <>
                    <span className="text-ink-300">·</span>
                    <span className="text-signal-warn">{violations} violations</span>
                  </>
                )}
                {rag.meta && (
                  <>
                    <span className="text-ink-300">·</span>
                    <span className="font-mono text-ink-500">
                      top {rag.meta.topScore.toFixed(2)}
                    </span>
                  </>
                )}
              </>
            )}
          </span>
          <span className="font-mono text-ink-400">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <div className="space-y-2 border-t border-ink-100 px-2.5 py-2">
            {rag.facts && rag.facts.length > 0 && (
              <div>
                <div className="mb-1 font-medium uppercase tracking-wide text-ink-500">
                  Verified facts
                </div>
                <ul className="space-y-0.5">
                  {rag.facts.map((f) => (
                    <li key={f.id} className="font-mono">
                      <span className="text-ink-600">{f.id}</span>
                      <span className="ms-2 text-ink-800">
                        {formatNumber(f.value)} {f.unit}
                      </span>
                      <span className="ms-1 text-ink-400">
                        ({f.year} · {f.source})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rag.passages && rag.passages.length > 0 && (
              <div>
                <div className="mb-1 font-medium uppercase tracking-wide text-ink-500">
                  Top passages
                </div>
                <ul className="space-y-0.5">
                  {rag.passages.map((p) => (
                    <li key={p.id} className="font-mono">
                      <span className="text-ink-600">{p.id}</span>
                      <span className="ms-2 text-ink-400">{p.source}</span>
                      {typeof p.score === "number" && (
                        <span className="ms-2 text-ink-500">{p.score.toFixed(2)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rag.violations && rag.violations.length > 0 && (
              <div>
                <div className="mb-1 font-medium uppercase tracking-wide text-signal-warn">
                  Validation violations
                </div>
                <ul className="space-y-0.5">
                  {rag.violations.map((v, i) => (
                    <li key={i} className="text-ink-700">
                      <span className="font-mono text-signal-warn">{v.kind}</span>
                      <span className="ms-2">{v.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rag.meta && (
              <div className="border-t border-ink-100 pt-2 font-mono text-ink-400">
                embed: {rag.meta.embedVendor} · rerank: {rag.meta.rerankVendor} ·{" "}
                {rag.meta.durationMs}ms
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function formatNumber(n: number): string {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return n.toLocaleString();
  return n.toString();
}

function MessageActions({
  text,
  canRegenerate,
  onRegenerate,
  speakLabel,
  speakingLabel,
  isSpeaking,
  onSpeak,
}: {
  text: string;
  canRegenerate: boolean;
  onRegenerate: () => void;
  speakLabel?: string;
  speakingLabel?: string;
  isSpeaking?: boolean;
  onSpeak?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }
  return (
    <div className="mt-2 flex items-center gap-2 text-2xs text-ink-400">
      <button
        type="button"
        onClick={copy}
        className="rounded-xs px-1.5 py-0.5 transition hover:bg-ink-200 hover:text-ink-700"
        title="Copy"
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
      {canRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-xs px-1.5 py-0.5 transition hover:bg-ink-200 hover:text-ink-700"
          title="Regenerate"
        >
          ↻ Regenerate
        </button>
      )}
      {onSpeak && (
        <button
          type="button"
          onClick={onSpeak}
          className="rounded-xs px-1.5 py-0.5 transition hover:bg-ink-200 hover:text-ink-700"
          title={isSpeaking ? speakingLabel : speakLabel}
        >
          {isSpeaking ? `■ ${speakingLabel}` : `🔊 ${speakLabel}`}
        </button>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export function ChatWorkspace() {
  useDocumentTitle("Chat");
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<Message[]>(SEED);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [classification, setClassification] = useState<Classification>("internal");
  const [userClearance, setUserClearance] = useState<Classification>("internal");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSession, setLoadingSession] = useState<string | null>(null);
  const [llmCfg, setLlmCfg] = useState<{
    provider: "anthropic" | "openrouter" | "local";
    model: string;
  } | null>(null);
  const [ragMode, setRagMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Voice loop: a question asked by voice gets its answer read back aloud.
  const speakReplyRef = useRef(false);
  const { push: pushToast } = useToast();
  const { speaking, speak, stop: stopSpeaking } = useSpeakAloud(locale);
  const voice = useVoiceInput(
    locale,
    (transcript) => {
      setInput(transcript);
      speakReplyRef.current = true;
      void send(transcript);
    },
    (code) => {
      pushToast({
        kind: code === "no-speech" || code === "aborted" ? "info" : "warn",
        title: t.chat.voiceErrorTitle,
        detail: t.chat.voiceErrors[code],
      });
    },
  );

  function maybeSpeakReply(text: string): void {
    if (!speakReplyRef.current) return;
    speakReplyRef.current = false;
    speak(stripForSpeech(text));
  }

  function refreshSessions(): void {
    fetch("/api/chat/sessions")
      .then(async (r) => (r.ok ? r.json() : { sessions: [] }))
      .then((d: { sessions?: SessionSummary[] }) => setSessions(d.sessions ?? []))
      .catch(() => {});
  }

  useEffect(refreshSessions, []);

  useEffect(() => {
    fetch("/api/admin/llm")
      .then(async (r) => (r.ok ? r.json() : null))
      .then(
        (
          d: { current?: { provider: "anthropic" | "openrouter" | "local"; model: string } } | null,
        ) => {
          if (d?.current) setLlmCfg({ provider: d.current.provider, model: d.current.model });
        },
      )
      .catch(() => {});
  }, []);

  async function loadSession(id: string): Promise<void> {
    setLoadingSession(id);
    try {
      const res = await fetch(`/api/chat/sessions/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok)
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      const loaded: Message[] = (
        data.entries as Array<{
          role: string;
          text: string;
          citations?: string[];
          classification?: Classification;
        }>
      )
        .filter(
          (e) =>
            (e.role === "user" || e.role === "assistant") &&
            typeof e.text === "string" &&
            e.text.trim().length > 0,
        )
        .map((e, i) => ({
          id: `${id}-${i}`,
          role: e.role as "user" | "assistant",
          text: e.text,
          citations: e.citations,
          classification: e.classification,
        }));
      setMessages(loaded.length ? loaded : SEED);
      setSessionId(id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("country-intel.sessionId", id);
      }
    } catch (err) {
      setMessages((all) => [
        ...all,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: `Error loading session: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      setLoadingSession(null);
    }
  }

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  // Reset textarea height when input cleared (after send).
  useEffect(() => {
    if (input === "" && inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [input]);

  // Auto-focus chat input on mount, and re-focus when generation finishes.
  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  const sp = useSearchParams();
  useEffect(() => {
    if (!sp) return;
    const q = sp.get("q");
    const ctx = sp.get("context");
    if (q && !input) {
      setInput(q);
      return;
    }
    if (ctx?.startsWith("country:") && !input) {
      const iso = ctx.slice("country:".length).toUpperCase();
      const c = COUNTRIES.find((x) => x.iso3 === iso);
      if (c) {
        setInput(
          `Brief me on ${c.nameEn} (${iso}): latest indicators, key risks, top cooperation opportunities. Cite sources.`,
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: { clearance?: Classification } | null }) => {
        const c = d.user?.clearance;
        if (c === "public" || c === "internal" || c === "confidential" || c === "secret") {
          setUserClearance(c);
          setClassification(c);
        }
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  function rotateSession(): void {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("country-intel.sessionId");
    }
    setSessionId(getOrCreateSessionId());
    setMessages(SEED);
    refreshSessions();
  }

  async function send(text: string, retryFromIdx?: number): Promise<void> {
    if (!text.trim()) return;
    const baseMessages = retryFromIdx !== undefined ? messages.slice(0, retryFromIdx) : messages;
    const userMsg: Message =
      retryFromIdx !== undefined
        ? (messages[retryFromIdx - 1] ?? { id: crypto.randomUUID(), role: "user", text })
        : { id: crypto.randomUUID(), role: "user", text };
    const assistantId = crypto.randomUUID();
    const nextMessages = retryFromIdx !== undefined ? baseMessages : [...baseMessages, userMsg];
    setMessages([
      ...nextMessages,
      { id: assistantId, role: "assistant", text: "", citations: [], classification },
    ]);
    if (retryFromIdx === undefined) setInput("");
    setBusy(true);

    // RAG path: non-streaming POST → /api/rag
    if (ragMode) {
      // Pass recent conversational history so referential questions
      // ("compare to 2026") inherit entity context from prior turns.
      const history = nextMessages
        .filter((m) => m.role !== "assistant" || m.id !== "m0")
        .map((m) => ({ role: m.role, content: m.text.trim() }))
        .filter((m) => m.content.length > 0)
        .slice(-6, -1); // last 5 turns excluding the current user message
      try {
        const res = await fetch("/api/rag", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question: text,
            classification,
            sessionId: sessionId || undefined,
            history: history.length > 0 ? history : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
        const finalText = data.abstained
          ? `**Insufficient evidence to answer.**\n\n${(data.abstainReasons ?? []).map((r: string) => `- ${r}`).join("\n")}`
          : (data.answer ?? "");
        setMessages((all) =>
          all.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: finalText,
                  citations: data.citations ?? [],
                  classification,
                  rag: {
                    intent: data.intent,
                    abstained: data.abstained,
                    abstainReasons: data.abstainReasons,
                    facts: data.facts,
                    passages: data.passages,
                    violations: data.violations,
                    safety: data.safety,
                    meta: data.meta,
                  },
                }
              : m,
          ),
        );
        maybeSpeakReply(finalText);
      } catch (err) {
        speakReplyRef.current = false;
        const errText = err instanceof Error ? err.message : String(err);
        setMessages((all) =>
          all.map((m) => (m.id === assistantId ? { ...m, text: `Error: ${errText}` } : m)),
        );
      } finally {
        setBusy(false);
        requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
        refreshSessions();
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          ...(sessionId ? { "x-session-id": sessionId } : {}),
        },
        body: JSON.stringify({
          stream: true,
          classification,
          messages: nextMessages
            .filter((m) => m.role !== "assistant" || m.id !== "m0")
            .map((m) => ({ role: m.role, content: m.text.trim() }))
            .filter((m) => m.content.length > 0),
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.error === "string" ? data.error : `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let citations: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload) as
              | { kind: "delta"; text: string }
              | {
                  kind: "done";
                  text: string;
                  citations: string[];
                  usedRealApi: boolean;
                  classification?: Classification;
                }
              | { kind: "error"; error: string };
            if (evt.kind === "delta") {
              acc += evt.text;
              setMessages((all) =>
                all.map((m) => (m.id === assistantId ? { ...m, text: acc } : m)),
              );
              requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
            } else if (evt.kind === "done") {
              citations = evt.citations;
              acc = evt.text;
              const outClass = evt.classification ?? classification;
              setMessages((all) =>
                all.map((m) =>
                  m.id === assistantId
                    ? { ...m, text: acc, citations, classification: outClass }
                    : m,
                ),
              );
            } else if (evt.kind === "error") {
              throw new Error(evt.error);
            }
          } catch {
            // ignore malformed line
          }
        }
      }
      maybeSpeakReply(acc.replace(/^\[CLASSIFICATION:\s*\w+\]\s*\n?/i, ""));
    } catch (err) {
      speakReplyRef.current = false;
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((all) =>
          all.map((m) =>
            m.id === assistantId
              ? { ...m, text: m.text ? `${m.text}\n\n_[stopped]_` : "_[stopped]_" }
              : m,
          ),
        );
      } else {
        const errText = err instanceof Error ? err.message : String(err);
        setMessages((all) =>
          all.map((m) => (m.id === assistantId ? { ...m, text: `Error: ${errText}` } : m)),
        );
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
      refreshSessions();
    }
  }

  function stop(): void {
    abortRef.current?.abort();
  }

  return (
    <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block">
        <button
          type="button"
          className="w-full rounded-sm bg-accent px-3 py-2 text-sm text-white hover:bg-accent-strong"
          onClick={rotateSession}
        >
          {t.chat.newChat}
        </button>
        <div className="mt-2 truncate font-mono text-[10px] text-ink-400" title={sessionId}>
          session: {sessionId.slice(0, 8) || "—"}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide text-ink-500">{t.chat.recent}</span>
          <span className="font-mono text-2xs text-ink-400">{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div className="mt-2 rounded-sm px-2 py-1.5 text-2xs text-ink-400">
            No prior chats yet.
          </div>
        ) : (
          <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto pe-1 text-xs">
            {sessions.map((s) => {
              const active = s.sessionId === sessionId;
              const loading = loadingSession === s.sessionId;
              const isCurrent = active;
              async function deleteSession(): Promise<void> {
                if (
                  !window.confirm(
                    `Delete this chat?\n\nPreview: ${s.preview.slice(0, 60) || "(empty)"}\nTurns: ${s.turns}`,
                  )
                )
                  return;
                try {
                  const res = await fetch(`/api/chat/sessions/${encodeURIComponent(s.sessionId)}`, {
                    method: "DELETE",
                  });
                  const d = await res.json().catch(() => ({}));
                  if (!res.ok)
                    throw new Error(typeof d?.error === "string" ? d.error : `HTTP ${res.status}`);
                  if (isCurrent) {
                    rotateSession();
                  } else {
                    refreshSessions();
                  }
                } catch (err) {
                  setMessages((all) => [
                    ...all,
                    {
                      id: crypto.randomUUID(),
                      role: "assistant",
                      text: `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
                    },
                  ]);
                }
              }
              return (
                <li key={s.sessionId} className="group relative">
                  <button
                    type="button"
                    onClick={() => loadSession(s.sessionId)}
                    disabled={loading || active}
                    className={
                      active
                        ? "w-full rounded-sm bg-ink-100 px-2 py-1.5 pe-7 text-start text-ink-800"
                        : "w-full rounded-sm px-2 py-1.5 pe-7 text-start text-ink-700 transition hover:bg-ink-200"
                    }
                    title={`${s.turns} turns · ${new Date(s.lastTs).toLocaleString()}`}
                  >
                    <div className="truncate font-medium">{s.preview || "(empty)"}</div>
                    <div className="mt-0.5 flex items-center justify-between gap-1 font-mono text-2xs text-ink-400">
                      <span>{s.turns}t</span>
                      <span>{relativeTime(s.lastTs)}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={deleteSession}
                    aria-label={`Delete chat ${s.preview || s.sessionId}`}
                    title="Delete chat"
                    className="absolute end-1 top-1.5 hidden h-5 w-5 place-items-center rounded-xs text-ink-400 transition hover:bg-signal-risk/10 hover:text-signal-risk group-hover:grid focus-visible:grid focus-visible:bg-signal-risk/10 focus-visible:text-signal-risk"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-6 text-xs uppercase tracking-wide text-ink-500">{t.chat.examples}</div>
        <ul className="mt-2 space-y-1 text-xs">
          {t.chat.sample.map((s) => (
            <li key={s}>
              <button
                onClick={() => send(s)}
                className="w-full rounded-sm px-2 py-1.5 text-start text-ink-600 hover:bg-ink-200"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="card flex h-[calc(100vh-160px)] flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold tracking-tight text-ink-800">{t.chat.title}</h2>
            {llmCfg && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-xs px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                  llmCfg.provider === "local"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
                title={`Provider: ${llmCfg.provider} · Model: ${llmCfg.model}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${llmCfg.provider === "local" ? "bg-emerald-600" : "bg-amber-600"}`}
                />
                {llmCfg.provider === "local" ? "ON-PREM" : "CLOUD"} · {llmCfg.provider}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label
              className="inline-flex cursor-pointer items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-ink-500"
              title="Route through RAG: grounded answers with verified facts + citations only"
            >
              <input
                type="checkbox"
                checked={ragMode}
                onChange={(e) => setRagMode(e.target.checked)}
                className="h-3 w-3 accent-accent"
              />
              <span>RAG</span>
              {ragMode && (
                <span className="rounded-xs bg-accent/15 px-1 py-0.5 text-[9px] font-medium text-accent">
                  grounded
                </span>
              )}
            </label>
            <span className="text-2xs font-medium uppercase tracking-wide text-ink-500">
              classification
            </span>
            <select
              value={classification}
              onChange={(e) => setClassification(e.target.value as Classification)}
              className="rounded-sm border border-ink-150 bg-ink-100 px-2.5 py-1 text-xs shadow-card transition focus:border-accent"
              aria-label="output classification"
            >
              {CLASSIFICATIONS.map((c) => {
                const disabled = RANK[c.value] > RANK[userClearance];
                return (
                  <option key={c.value} value={c.value} disabled={disabled}>
                    {c.label}
                    {disabled ? " · locked" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {messages.length === 1 && messages[0]?.role === "assistant" && (
            <div className="me-auto max-w-[80%] space-y-2">
              <div className="text-2xs font-medium uppercase tracking-wide text-ink-500">
                {t.chat.examples} — tap to send
              </div>
              <div className="flex flex-wrap gap-1.5">
                {t.chat.sample.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={busy}
                    className="rounded-md border border-ink-150 bg-ink-100 px-3 py-1.5 text-xs text-ink-700 shadow-card transition hover:border-accent hover:text-accent disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, idx) => {
            const isLast = idx === messages.length - 1;
            const showCursor = busy && isLast && m.role === "assistant";
            const cleanText =
              m.role === "assistant" && m.text
                ? m.text.replace(
                    /^\[CLASSIFICATION:\s*(PUBLIC|INTERNAL|CONFIDENTIAL|SECRET)\]\s*\n?/i,
                    "",
                  )
                : m.text;
            return (
              <div
                key={m.id}
                className={
                  m.role === "user"
                    ? "ms-auto max-w-[80%] rounded-md bg-gradient-to-br from-ink-800 to-ink-900 px-3.5 py-2.5 text-sm text-ink-50 shadow-card"
                    : "me-auto max-w-[80%] rounded-md border border-ink-150 bg-ink-100 px-3.5 py-2.5 text-sm text-ink-800 shadow-card"
                }
              >
                {m.role === "assistant" && m.classification && (
                  <div className="mb-1.5">
                    <span
                      className={`rounded-xs px-1.5 py-0.5 text-[10px] font-medium uppercase ${TONE_FOR[m.classification]}`}
                    >
                      {m.classification}
                    </span>
                  </div>
                )}
                <div className="text-sm leading-relaxed">
                  {m.role === "assistant" ? (
                    <>
                      {m.rag ? (
                        <RagAnswerView
                          text={cleanText}
                          facts={m.rag.facts}
                          passages={m.rag.passages}
                        />
                      ) : (
                        <MarkdownView text={cleanText} />
                      )}
                      {showCursor && (
                        <span
                          className="ms-0.5 inline-block h-3 w-1 -translate-y-px animate-pulse bg-ink-500 align-middle"
                          aria-hidden
                        />
                      )}
                    </>
                  ) : (
                    <div className="whitespace-pre-wrap">{cleanText}</div>
                  )}
                </div>
                {!m.rag && m.citations && m.citations.length > 0 && (
                  <div className="mt-2 text-[11px] text-ink-500">
                    {t.chat.cited}: {m.citations.join(" · ")}
                  </div>
                )}
                {m.rag && <RagDetails rag={m.rag} />}
                {m.role === "assistant" && !showCursor && m.text && (
                  <MessageActions
                    text={cleanText}
                    speakLabel={t.chat.voiceSpeak}
                    speakingLabel={t.chat.voiceStop}
                    isSpeaking={speaking}
                    onSpeak={() => (speaking ? stopSpeaking() : speak(stripForSpeech(cleanText)))}
                    canRegenerate={
                      idx === messages.length - 1 && !busy && messages[idx - 1]?.role === "user"
                    }
                    onRegenerate={() => {
                      const prevUser = messages[idx - 1];
                      if (prevUser?.role === "user") void send(prevUser.text, idx);
                    }}
                  />
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2 border-t border-ink-100 bg-ink-50/40 px-3 py-3"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const ta = e.currentTarget;
              ta.style.height = "auto";
              ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim() && !busy) send(input);
              }
            }}
            placeholder={t.chat.placeholder}
            rows={1}
            className="flex-1 resize-none rounded-md border border-ink-150 bg-ink-100 px-3.5 py-2.5 text-sm leading-relaxed shadow-card transition focus:border-accent focus:outline-none focus:shadow-pop"
            aria-label={t.chat.placeholder}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            suppressHydrationWarning
          />
          {voice.supported && (
            <button
              type="button"
              onClick={() => (voice.listening ? voice.stop() : voice.start())}
              disabled={busy}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-md border text-base transition disabled:opacity-50 ${
                voice.listening
                  ? "animate-pulse border-signal-risk bg-signal-risk/10 text-signal-risk"
                  : "border-ink-150 bg-ink-100 text-ink-700 hover:border-accent hover:text-accent"
              }`}
              title={voice.listening ? t.chat.voiceListening : t.chat.voiceAsk}
              aria-label={voice.listening ? t.chat.voiceListening : t.chat.voiceAsk}
              aria-pressed={voice.listening}
            >
              <span aria-hidden>🎙️</span>
            </button>
          )}
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className="btn-primary inline-flex h-10 items-center gap-1.5 !bg-signal-risk hover:!bg-signal-risk/90"
              title="Stop generation"
            >
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-ink-100" aria-hidden />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="btn-primary h-10"
              title="Send (Enter). Shift+Enter for newline."
            >
              {t.chat.send}
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
