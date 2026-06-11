"use client";

import { MarkdownView } from "@/components/chat/MarkdownView";
import { downloadSvg, exportDeckVideo, exportOnePager } from "@/components/experience/exporters";
import { COUNTRIES } from "@/lib/data/countries";
import { iso3Name } from "@/lib/data/iso-countries";
import { useTheme } from "@/lib/hooks/useTheme";
import { useI18n } from "@/lib/i18n/context";
import type { AgentState } from "@/services/agent/state";
import { countryOnePagerSvg } from "@/services/export/infographic";
import { useEffect, useState } from "react";

const COPY = {
  en: {
    recommendation: "Recommendation",
    confidence: "Confidence",
    talkingPoints: "Talking points — the ask",
    fullAnalysis: "Full analysis",
    pptx: "Download slides (PPTX)",
    png: "Download one-pager (PNG)",
    video: "Download video (MP4)",
    svg: "SVG",
    preparing: "Preparing…",
    developments: "Recent developments (live web)",
    fallback: "Template fallback — model output failed validation. Run a new briefing.",
  },
  ar: {
    recommendation: "التوصية",
    confidence: "الثقة",
    talkingPoints: "نقاط الحديث — المطلب",
    fullAnalysis: "التحليل الكامل",
    pptx: "تنزيل العرض (PPTX)",
    png: "تنزيل الملخص (PNG)",
    video: "تنزيل الفيديو (MP4)",
    svg: "SVG",
    preparing: "جارٍ التحضير…",
    developments: "تطورات حديثة (بحث ويب حي)",
    fallback: "نص احتياطي قالبي — تعذّر التحقق من مخرجات النموذج. أعد توليد الإحاطة.",
  },
};

export function BriefView({ state }: { state: AgentState }) {
  const { locale } = useI18n();
  const [briefLang, setBriefLang] = useState<"en" | "ar">(locale === "ar" ? "ar" : "en");
  const { theme } = useTheme();
  const arReadyNow = Boolean(state.briefingAr);
  // The header EN/عربي switch drives the brief content too: follow the app
  // locale whenever it (or AR availability) changes; the in-brief pill remains
  // a manual override until the next locale switch.
  useEffect(() => {
    setBriefLang(locale === "ar" && arReadyNow ? "ar" : locale === "ar" ? "en" : "en");
  }, [locale, arReadyNow]);
  const [exporting, setExporting] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const arReady = Boolean(state.briefingAr);
  const b = briefLang === "ar" ? (state.briefingAr ?? state.briefing) : state.briefing;
  const c = COPY[briefLang];
  if (!b) return null;
  const onePager = state.scope ? countryOnePagerSvg(state, { locale: briefLang, theme }) : null;

  async function doExport(payload: Record<string, unknown>, filename: string, key: string) {
    setExporting(key);
    try {
      await exportOnePager(payload, filename);
    } finally {
      setExporting(null);
    }
  }

  /** Structured agent state → multi-slide executive deck on the server. */
  function deckPayload() {
    if (!b) return undefined;
    const iso3 = state.scope?.iso3 ?? "";
    const c = COUNTRIES.find((x) => x.iso3 === iso3);
    const countryName =
      (briefLang === "ar" ? (c?.nameAr ?? c?.nameEn) : c?.nameEn) ?? iso3Name(iso3) ?? iso3;
    return {
      locale: briefLang,
      classification: state.classification ?? "internal",
      countryName,
      iso3,
      sector: state.scope?.sector,
      audience: state.scope?.audience,
      title: b.title,
      bluf: b.bluf,
      whyNow: b.whyNow,
      heroMetric: b.heroMetric,
      confidence: b.confidence,
      talkingPoints: b.talkingPoints.slice(0, 8),
      deals: b.deals
        .slice(0, 6)
        .map((d) => ({ title: d.title, score: d.score, horizon: d.horizon })),
      risks: b.risks.slice(0, 6).map((r) => ({ text: r.text, likelihood: r.likelihood })),
      scenarios: b.scenarios
        .slice(0, 4)
        .map((sc) => ({ name: sc.name, outlook: sc.outlook, likelihood: sc.likelihood })),
      watchlist: b.watchlist.slice(0, 8),
      indicators: state.indicators.slice(0, 20),
      gdpSeries: (state.gdpSeries ?? []).slice(-12),
      forecast: state.forecast
        ? {
            next: state.forecast.next,
            lower: state.forecast.lowerBand,
            upper: state.forecast.upperBand,
          }
        : undefined,
      trade: state.trade
        ? {
            totalUsd: state.trade.totalUsd,
            exportsUsd: state.trade.exportsUsd,
            importsUsd: state.trade.importsUsd,
            source: state.trade.source,
            year: state.trade.year,
          }
        : undefined,
    };
  }

  const confColor =
    b.confidence === "high"
      ? "text-signal-ok border-signal-ok/40"
      : b.confidence === "low"
        ? "text-signal-risk border-signal-risk/40"
        : "text-tamm-olive border-tamm-olive/40";

  return (
    <div className="space-y-5" dir={briefLang === "ar" ? "rtl" : "ltr"}>
      <div className="flex items-center gap-2" dir="ltr">
        <button
          type="button"
          onClick={() => setBriefLang("en")}
          className={`rounded-full px-3 py-1 text-2xs font-semibold ${briefLang === "en" ? "bg-accent text-white" : "border border-ink-200 text-ink-500 hover:bg-ink-200"}`}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => arReady && setBriefLang("ar")}
          disabled={!arReady}
          title={arReady ? "" : "Arabic version is still generating…"}
          className={`rounded-full px-3 py-1 text-2xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${briefLang === "ar" ? "bg-accent text-white" : "border border-ink-200 text-ink-500 hover:bg-ink-200"}`}
        >
          العربية
        </button>
      </div>

      <div className="rounded-lg border border-accent/30 border-s-4 border-s-accent bg-ink-100 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs font-semibold uppercase tracking-wide text-accent-strong">
            {c.recommendation}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-2xs font-semibold ${confColor}`}>
            {c.confidence}: {b.confidence.toUpperCase()}
          </span>
        </div>
        <p className="mt-2 text-lg font-semibold leading-snug text-ink-800">{b.bluf}</p>
        {b.whyNow && <p className="mt-1 text-sm text-ink-500">{b.whyNow}</p>}
        {b.proseSource === "fallback" && (
          <p className="mt-2 inline-block rounded-sm border border-signal-warn/40 bg-signal-warn/10 px-2 py-1 text-2xs font-medium text-tamm-oliveDark">
            ⚠ {c.fallback}
          </p>
        )}
      </div>

      {onePager && (
        <>
          <div className="overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(onePager)}`}
              alt={`Executive country one-pager for ${state.scope?.iso3 ?? ""}`}
              className="h-auto w-full"
            />
          </div>
          <div className="flex flex-wrap gap-2" dir="ltr">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() =>
                doExport(
                  {
                    svg: onePager,
                    format: "pptx",
                    title: b.title,
                    talkingPoints: b.talkingPoints,
                    deck: deckPayload(),
                  },
                  "country-brief.pptx",
                  "pptx",
                )
              }
              className="rounded-md bg-accent-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {exporting === "pptx" ? c.preparing : c.pptx}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() =>
                doExport({ svg: onePager, format: "png" }, "country-one-pager.png", "png")
              }
              className="rounded-md border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-200 disabled:opacity-50"
            >
              {exporting === "png" ? c.preparing : c.png}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={async () => {
                const deck = deckPayload();
                if (!deck) return;
                setExporting("video");
                try {
                  await exportDeckVideo(deck);
                } catch (err) {
                  setVideoError(err instanceof Error ? err.message : String(err));
                } finally {
                  setExporting(null);
                }
              }}
              className="rounded-md border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-200 disabled:opacity-50"
            >
              {exporting === "video" ? c.preparing : c.video}
            </button>
            {videoError && (
              <span role="alert" className="self-center text-xs text-signal-risk">
                {videoError}
              </span>
            )}
            <button
              type="button"
              onClick={() => downloadSvg(onePager)}
              className="rounded-md border border-ink-200 px-4 py-2 text-sm text-ink-700 hover:bg-ink-200"
            >
              {c.svg}
            </button>
          </div>
        </>
      )}

      {b.talkingPoints.length > 0 && (
        <div className="rounded-lg border border-ink-200 bg-ink-100 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {c.talkingPoints}
          </h3>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-ink-700">
            {b.talkingPoints.map((tp) => (
              <li key={tp}>{tp}</li>
            ))}
          </ol>
        </div>
      )}

      {state.developments && state.developments.results.length > 0 && (
        <div className="rounded-lg border border-ink-200 bg-ink-100 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-tight text-ink-400">
            {c.developments}
          </h3>
          {state.developments.answer && (
            <p className="mt-2 text-sm text-ink-600">{state.developments.answer}</p>
          )}
          <ul className="mt-2 space-y-1 text-sm">
            {state.developments.results.slice(0, 4).map((d) => (
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
        </div>
      )}

      {state.analysis && (
        <details className="rounded-lg border border-ink-200 bg-ink-100 p-4">
          <summary className="cursor-pointer text-sm font-semibold uppercase tracking-tight text-ink-400">
            {c.fullAnalysis}
          </summary>
          <div className="mt-2 text-ink-700">
            <MarkdownView text={state.analysis} />
          </div>
        </details>
      )}
    </div>
  );
}
