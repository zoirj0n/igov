"use client";

import { AgentSteps } from "@/components/agent/AgentSteps";
import { BriefingVisualizer } from "@/components/agent/BriefingVisualizer";
import { MarkdownView } from "@/components/chat/MarkdownView";
import { useToast } from "@/lib/hooks/useToast";
import { useSpeakAloud, useVoiceInput } from "@/lib/hooks/useVoice";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState, Briefing } from "@/services/agent/state";
import { countryOnePagerSvg } from "@/services/export/infographic";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function triggerDownload(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadSvg(svg: string) {
  triggerDownload(
    URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })),
    "country-one-pager.svg",
  );
}

async function exportOnePager(payload: Record<string, unknown>, filename: string) {
  const res = await fetch("/api/export/onepager", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return;
  triggerDownload(URL.createObjectURL(await res.blob()), filename);
}

async function exportDeck(payload: Record<string, unknown>, filename: string) {
  const res = await fetch("/api/export/deck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return;
  triggerDownload(URL.createObjectURL(await res.blob()), filename);
}

type StepKey = "scope" | "research" | "analyse" | "opportunities" | "briefing";

const STEP_KEYS: StepKey[] = ["scope", "research", "analyse", "opportunities", "briefing"];

const EXAMPLES = [
  "Prepare me for Brazil's Energy Minister",
  "Prepare me for Germany — hydrogen cooperation",
  "Prepare me for India — logistics & trade",
];

const COPY = {
  en: {
    h1: "Strategic Advisor",
    sub: "One command prepares leadership for an international meeting — researched, grounded, on-prem.",
    aiBadge: "On-prem AI · multi-agent",
    placeholder: "Prepare me for Brazil's Energy Minister",
    prepare: "Prepare",
    working: "Working…",
    agentsWorking: "Agents working…",
    briefReady: "Brief ready",
    speak: "Speak your command",
    steps: {
      scope: "Scope the request",
      research: "Retrieve real data",
      analyse: "Analyse & forecast",
      opportunities: "Identify opportunities",
      briefing: "Compose briefing",
    } as Record<StepKey, string>,
    pptx: "Download slides (PPTX)",
    deck: "Download full deck (PPTX)",
    png: "Download one-pager (PNG)",
    svg: "SVG",
    preparing: "Preparing…",
    video: "🎬 Generate video brief",
    rendering: "Rendering video… (~30s)",
    readAloud: "🔊 Read aloud",
    talkingPoints: "Talking points — the ask",
    sources: "Sources",
    fullAnalysis: "Full analysis",
    recommendation: "Recommendation",
    confidence: "Confidence",
    capsTitle: "What this advisor does",
    caps: [
      { t: "5 live sources", d: "World Bank · IMF · EIA · UN Comtrade · live web" },
      { t: "Autonomous research", d: "A multi-agent tool-loop gathers & verifies evidence" },
      { t: "Bilingual brief", d: "Executive one-pager in English & Arabic" },
      { t: "On-prem AI", d: "Local models — your data stays sovereign" },
      { t: "Decision-first", d: "Recommendation, sized deals, risks, scenarios — cited" },
      { t: "Export-ready", d: "PNG · PPTX slides · on-prem video brief" },
    ],
  },
  ar: {
    h1: "المستشار الاستراتيجي",
    sub: "أمرٌ واحد يجهّز القيادة لاجتماع دولي — ببحثٍ وتحليلٍ موثّق، ومحلي بالكامل.",
    aiBadge: "ذكاء اصطناعي محلي · متعدد الوكلاء",
    placeholder: "جهّزني لاجتماع وزير الطاقة البرازيلي",
    prepare: "جهّزني",
    working: "جارٍ العمل…",
    agentsWorking: "الوكلاء يعملون…",
    briefReady: "الإحاطة جاهزة",
    speak: "تحدّث بأمرك",
    steps: {
      scope: "تحديد نطاق الطلب",
      research: "جلب بيانات حقيقية",
      analyse: "التحليل والتنبؤ",
      opportunities: "تحديد الفرص",
      briefing: "صياغة الإحاطة",
    } as Record<StepKey, string>,
    pptx: "تنزيل العرض (PPTX)",
    deck: "تنزيل العرض الكامل (PPTX)",
    png: "تنزيل الملخص (PNG)",
    svg: "SVG",
    preparing: "جارٍ التحضير…",
    video: "🎬 إنشاء فيديو موجز",
    rendering: "جارٍ إنشاء الفيديو… (~30 ثانية)",
    readAloud: "🔊 استماع",
    talkingPoints: "نقاط الحديث — المطلب",
    sources: "المصادر",
    fullAnalysis: "التحليل الكامل",
    recommendation: "التوصية",
    confidence: "الثقة",
    capsTitle: "ماذا يفعل هذا المستشار",
    caps: [
      { t: "5 مصادر حيّة", d: "البنك الدولي · صندوق النقد · EIA · كومتريد · ويب حي" },
      { t: "بحث ذاتي", d: "حلقة وكلاء متعددة تجمع الأدلة وتتحقق منها" },
      { t: "إحاطة ثنائية اللغة", d: "ملخّص تنفيذي بالعربية والإنجليزية" },
      { t: "ذكاء اصطناعي محلي", d: "نماذج محلية — بياناتك سيادية" },
      { t: "القرار أولاً", d: "توصية وصفقات ومخاطر وسيناريوهات موثّقة" },
      { t: "جاهز للتصدير", d: "PNG · شرائح PPTX · فيديو محلي" },
    ],
  },
};

type StepStatus = "idle" | "start" | "done" | "error";

interface RunEvent {
  event: "trace" | "final" | "error";
  state?: AgentState;
  message?: string;
}

function statusFor(state: AgentState | null, key: StepKey): StepStatus {
  if (!state) return "idle";
  let s: StepStatus = "idle";
  for (const t of state.trace) if (t.step === key) s = t.status as StepStatus;
  return s;
}

function lastDetail(state: AgentState | null, key: StepKey): string | undefined {
  if (!state) return undefined;
  let d: string | undefined;
  for (const t of state.trace) if (t.step === key) d = t.detail;
  return d;
}

function notesFor(state: AgentState | null, key: StepKey): string[] {
  if (!state) return [];
  return state.trace.flatMap((t) => (t.step === key && t.note ? [t.note] : []));
}

export function AgentRunner() {
  const { locale, t } = useI18n();
  const { push: pushToast } = useToast();
  const c = COPY[locale === "ar" ? "ar" : "en"];
  const [command, setCommand] = useState<string>(
    EXAMPLES[0] ?? "Prepare me for Brazil's Energy Minister",
  );
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<AgentState | null>(null);
  const [final, setFinal] = useState<AgentState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  // Which language of the brief is displayed (EN first; AR activates once ready).
  const [briefLang, setBriefLang] = useState<"en" | "ar">("en");
  const abortRef = useRef<AbortController | null>(null);

  const doExport = useCallback(
    async (payload: Record<string, unknown>, filename: string, key: string) => {
      setExporting(key);
      try {
        await exportOnePager(payload, filename);
      } finally {
        setExporting(null);
      }
    },
    [],
  );

  const doExportDeck = useCallback(async (st: AgentState, brief: Briefing, lang: "en" | "ar") => {
    const iso3 = st.scope?.iso3;
    if (!iso3) return;
    setExporting("deck");
    try {
      await exportDeck(
        {
          format: "pptx",
          lang,
          briefing: {
            title: brief.title,
            countryIso3: iso3,
            audience: lang === "ar" ? "القيادة" : "Leadership",
            classification: st.classification,
            body: [brief.bluf, brief.whyNow].filter(Boolean).join("\n\n"),
            talkingPoints: brief.talkingPoints.slice(0, 20),
            risks: brief.risks.map((r) => r.text).slice(0, 20),
            opportunities: brief.deals.map((d) => `${d.title} — ${d.rationale}`).slice(0, 20),
            citations: brief.citations.slice(0, 40),
            confidence: brief.confidence,
          },
        },
        `country-brief-${iso3.toLowerCase()}.pptx`,
      );
    } finally {
      setExporting(null);
    }
  }, []);

  const genVideo = useCallback(async (st: AgentState) => {
    setVideoBusy(true);
    setVideoUrl(null);
    try {
      const res = await fetch("/api/agent/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: st }),
      });
      if (res.ok) setVideoUrl(URL.createObjectURL(await res.blob()));
    } finally {
      setVideoBusy(false);
    }
  }, []);

  const run = useCallback(
    async (cmdOverride?: string) => {
      const cmd = (cmdOverride ?? command).trim();
      if (running || cmd.length < 2) return;
      setRunning(true);
      setState(null);
      setFinal(null);
      setError(null);
      setBriefLang("en");
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const res = await fetch("/api/agent/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: cmd }),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `agent run failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const ev = JSON.parse(line.slice(5).trim()) as RunEvent;
            if (ev.event === "trace" && ev.state) setState(ev.state);
            else if (ev.event === "final" && ev.state) {
              setState(ev.state);
              setFinal(ev.state);
            } else if (ev.event === "error") setError(ev.message ?? "agent error");
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError")
          setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    },
    [command, running],
  );

  const voiceIn = useVoiceInput(
    locale,
    (transcript) => {
      setCommand(transcript);
      void run(transcript);
    },
    (code) => {
      pushToast({
        kind: code === "no-speech" || code === "aborted" ? "info" : "warn",
        title: t.chat.voiceErrorTitle,
        detail: t.chat.voiceErrors[code],
      });
    },
  );
  // Read-aloud follows the brief-language toggle, not the app locale.
  const speakOut = useSpeakAloud(briefLang);

  // Deep-link from the landing page: /agent?q=<command> prefills and auto-runs once.
  const searchParams = useSearchParams();
  const autoRan = useRef(false);
  useEffect(() => {
    const q = searchParams?.get("q");
    if (q && !autoRan.current) {
      autoRan.current = true;
      setCommand(q);
      void run(q);
    }
  }, [searchParams, run]);

  const result = final ?? state;
  // Brief display language follows the per-brief toggle (not the app locale).
  const loc = briefLang;
  const cb = COPY[loc]; // brief-section labels follow the toggle so the AR view is fully Arabic
  const arReady = !!result?.briefingAr;
  const b = result
    ? loc === "ar"
      ? (result.briefingAr ?? result.briefing)
      : result.briefing
    : undefined;
  const onePager =
    result?.briefing && result.scope ? countryOnePagerSvg(result, { locale: loc }) : null;
  const confColor =
    b?.confidence === "high"
      ? "text-signal-ok border-signal-ok/40"
      : b?.confidence === "low"
        ? "text-signal-risk border-signal-risk/40"
        : "text-tamm-olive border-tamm-olive/40";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 lg:px-6">
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-tamm-cyan/30 bg-tamm-cyan/10 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-accent-strong">
          <span className="h-1.5 w-1.5 rounded-full bg-tamm-cyan" aria-hidden />
          {c.aiBadge}
        </div>
        <h1 className="text-4xl font-semibold tracking-tighter text-ink-900">{c.h1}</h1>
        <p className="mt-2 max-w-2xl text-base text-ink-600">{c.sub}</p>
      </header>

      <div className="rounded-lg border border-ink-200 bg-ink-100 p-4 shadow-card">
        <label htmlFor="cmd" className="sr-only">
          Command
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="cmd"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder={c.placeholder}
            className="flex-1 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-ink-800 outline-none focus:ring-2 focus:ring-accent/30"
            disabled={running}
          />
          {voiceIn.supported && (
            <button
              type="button"
              onClick={voiceIn.start}
              disabled={running || voiceIn.listening}
              aria-label={c.speak}
              title={c.speak}
              className="rounded-md border border-ink-200 px-4 py-2 text-lg disabled:opacity-50"
            >
              {voiceIn.listening ? "🎙️…" : "🎤"}
            </button>
          )}
          <button
            type="button"
            onClick={() => run()}
            disabled={running}
            className="rounded-md bg-accent-strong px-5 py-2 font-semibold text-white disabled:opacity-50"
          >
            {running ? c.working : c.prepare}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setCommand(ex)}
              className="rounded-full border border-ink-200 px-3 py-1 text-2xs uppercase tracking-tight text-ink-500 hover:bg-ink-200"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {!running && !result && (
        <section className="mt-8">
          <h2 className="mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-400">
            {c.capsTitle}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {c.caps.map((cap) => (
              <div
                key={cap.t}
                className="rounded-lg border border-ink-200 bg-ink-100 p-4 shadow-card transition-colors hover:border-accent/40"
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-tamm-cyan" aria-hidden />
                  <span className="text-sm font-semibold text-ink-800">{cap.t}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{cap.d}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(running || result) && (
        <AgentSteps
          workingLabel={c.agentsWorking}
          doneLabel={c.briefReady}
          steps={STEP_KEYS.map((key) => ({
            key,
            label: c.steps[key],
            status: statusFor(result, key),
            detail: lastDetail(result, key),
            notes: notesFor(result, key),
          }))}
        />
      )}

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-signal-risk/40 bg-signal-risk/5 p-3 text-signal-risk"
        >
          {error}
        </div>
      )}

      {result?.briefing && onePager && (
        <section className="mt-8 space-y-6" dir={loc === "ar" ? "rtl" : "ltr"}>
          {/* Brief language toggle — Arabic activates once the AR version is ready */}
          <div className="flex items-center gap-2" dir="ltr">
            <span className="me-1 text-2xs uppercase tracking-wide text-ink-400">Language</span>
            <button
              type="button"
              onClick={() => setBriefLang("en")}
              className={`rounded-full px-3 py-1 text-2xs font-semibold transition-colors ${
                briefLang === "en"
                  ? "bg-accent text-white"
                  : "border border-ink-200 text-ink-500 hover:bg-ink-200"
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => arReady && setBriefLang("ar")}
              disabled={!arReady}
              title={arReady ? "" : "Arabic version is still generating…"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-semibold transition-colors ${
                briefLang === "ar"
                  ? "bg-accent text-white"
                  : "border border-ink-200 text-ink-500 hover:bg-ink-200"
              } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
            >
              العربية
              {!arReady && (
                <span
                  className="h-2.5 w-2.5 animate-spin rounded-full border border-ink-400 border-t-transparent"
                  aria-hidden
                />
              )}
            </button>
          </div>

          {/* Decision-first BLUF — the recommendation up front */}
          {b?.bluf && (
            <div className="rounded-lg border border-accent/30 border-s-4 border-s-accent bg-ink-100 p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <span className="text-2xs font-semibold uppercase tracking-wide text-accent-strong">
                  {cb.recommendation}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-2xs font-semibold ${confColor}`}
                >
                  {cb.confidence}: {b.confidence.toUpperCase()}
                </span>
              </div>
              <p className="mt-2 text-lg font-semibold leading-snug text-ink-800">{b.bluf}</p>
              {b.whyNow && <p className="mt-1 text-sm text-ink-500">{b.whyNow}</p>}
              {b.heroMetric && (
                <div className="mt-3 inline-flex items-baseline gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-1.5">
                  <span className="text-2xs uppercase text-ink-400">{b.heroMetric.label}</span>
                  <span className="font-display text-xl font-bold text-tamm-cyan">
                    {b.heroMetric.value}
                  </span>
                  {b.heroMetric.delta && (
                    <span className="text-2xs font-semibold text-ink-500">
                      {b.heroMetric.delta}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Infographic one-pager — the executive deliverable */}
          <div className="overflow-hidden rounded-lg border border-ink-200 bg-ink-100 shadow-card">
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(onePager)}`}
              alt={`Executive country one-pager for ${result.scope?.iso3 ?? ""}`}
              className="h-auto w-full"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() =>
                doExport(
                  {
                    svg: onePager,
                    format: "pptx",
                    title: b?.title,
                    talkingPoints: b?.talkingPoints,
                  },
                  "country-brief.pptx",
                  "pptx",
                )
              }
              className="rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {exporting === "pptx" ? cb.preparing : cb.pptx}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => result && b && doExportDeck(result, b, loc)}
              className="rounded-md border border-accent/40 bg-accent-subtle px-4 py-2 text-sm font-semibold text-accent-strong disabled:opacity-50"
            >
              {exporting === "deck" ? cb.preparing : cb.deck}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() =>
                doExport({ svg: onePager, format: "png" }, "country-one-pager.png", "png")
              }
              className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-200 disabled:opacity-50"
            >
              {exporting === "png" ? cb.preparing : cb.png}
            </button>
            <button
              type="button"
              onClick={() => downloadSvg(onePager)}
              className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-200"
            >
              {cb.svg}
            </button>
            <button
              type="button"
              onClick={() => result && genVideo(result)}
              disabled={videoBusy}
              className="rounded-md border border-accent/40 bg-accent-subtle px-4 py-2 text-sm font-semibold text-accent-strong disabled:opacity-50"
            >
              {videoBusy ? cb.rendering : cb.video}
            </button>
            <button
              type="button"
              onClick={() =>
                b && (speakOut.speaking ? speakOut.stop() : speakOut.speak(`${b.title}. ${b.bluf}`))
              }
              className="rounded-md border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-200"
            >
              {cb.readAloud}
            </button>
          </div>

          {videoUrl && (
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg border border-ink-200 shadow-card"
            >
              <track kind="captions" />
            </video>
          )}

          {b && <BriefingVisualizer briefing={b} locale={loc} />}

          {b && b.talkingPoints.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-ink-100 p-5 shadow-card">
              <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
                {cb.talkingPoints}
              </h3>
              <ol className="mt-2 list-decimal space-y-1 ps-5 text-ink-700">
                {b.talkingPoints.map((tp) => (
                  <li key={tp}>{tp}</li>
                ))}
              </ol>
            </div>
          )}

          {result.developments && result.developments.results.length > 0 && (
            <div className="rounded-lg border border-ink-200 bg-ink-100 p-5 shadow-card">
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-tight text-ink-400">
                <span className="h-1.5 w-1.5 rounded-full bg-tamm-cyan" aria-hidden />
                {loc === "ar" ? "تطورات حديثة (بحث ويب حي)" : "Recent developments (live web)"}
              </h3>
              {result.developments.answer && (
                <p className="mt-2 text-sm text-ink-600">{result.developments.answer}</p>
              )}
              <ul className="mt-2 space-y-1 text-sm">
                {result.developments.results.slice(0, 4).map((d) => (
                  <li key={d.url}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-strong hover:underline"
                    >
                      {d.title}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-2xs text-ink-400">via Tavily</p>
            </div>
          )}

          {result.analysis && (
            <details className="rounded-lg border border-ink-200 bg-ink-100 p-4 shadow-card">
              <summary className="cursor-pointer text-sm font-semibold uppercase tracking-tight text-ink-400">
                {cb.fullAnalysis}
              </summary>
              <div className="mt-2 text-ink-700">
                <MarkdownView text={result.analysis} />
              </div>
            </details>
          )}

          {/* Sources — every data source behind the brief, at the bottom */}
          {b && (b.citations.length > 0 || result.developments?.results.length) && (
            <div className="rounded-lg border border-ink-200 bg-ink-50 p-4">
              <h3 className="text-2xs font-semibold uppercase tracking-tight text-ink-400">
                {cb.sources}
              </h3>
              {b.citations.length > 0 && (
                <p className="mt-1.5 text-xs text-ink-500">{b.citations.join("  ·  ")}</p>
              )}
              {result.developments && result.developments.results.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {result.developments.results.map((d) => (
                    <li key={d.url} className="truncate text-2xs">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-ink-400 hover:text-accent-strong hover:underline"
                      >
                        {d.title} — {d.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
