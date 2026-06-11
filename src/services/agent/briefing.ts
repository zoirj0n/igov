/**
 * Deterministic, honest builders for the executive briefing's structured half.
 *
 * The numbers a minister acts on (deal scores, risk likelihoods, the hero metric,
 * overall confidence) are computed here from real `AgentState` — never by the LLM
 * — so figures stay grounded and bilingual text comes from fixed catalogs. The
 * scribe's LLM only writes prose (bluf, counterpart, position, scenarios…).
 */
import { humanizeValue } from "@/services/agent/format";
import type {
  AgentState,
  Confidence,
  DealItem,
  HeroMetric,
  Likelihood,
  RiskItem,
} from "@/services/agent/state";

export type Lang = "en" | "ar";

// Deal titles keyed by opportunity sector (the scorer emits a fixed catalogue).
const DEAL_TITLE: Record<string, { en: string; ar: string }> = {
  energy: {
    en: "Clean-energy & green-hydrogen cooperation",
    ar: "تعاون الطاقة النظيفة والهيدروجين الأخضر",
  },
  trade: {
    en: "Bilateral trade & CEPA expansion",
    ar: "توسيع التجارة الثنائية واتفاقية الشراكة الاقتصادية",
  },
  infrastructure: {
    en: "Smart-port & digital-infrastructure standards",
    ar: "معايير الموانئ الذكية والبنية التحتية الرقمية",
  },
};

const EVIDENCE_LABEL: Record<string, { en: string; ar: string }> = {
  renewSharePct: { en: "Renewables", ar: "الطاقة المتجددة" },
  electricityPerCapita: { en: "Electricity/capita", ar: "الكهرباء للفرد" },
  gdpUsd: { en: "GDP", ar: "الناتج المحلي" },
  exportsUsd: { en: "Exports", ar: "الصادرات" },
  gdpGrowthPct: { en: "Growth", ar: "النمو" },
  internetPct: { en: "Internet", ar: "الإنترنت" },
  mobilePer100: { en: "Mobile", ar: "الاتصالات" },
};

const SIGNAL_UNIT: Record<string, string> = {
  renewSharePct: "%",
  electricityPerCapita: "kWh",
  gdpUsd: "USD",
  exportsUsd: "USD",
  gdpGrowthPct: "%",
  internetPct: "%",
  mobilePer100: "per 100",
};

const horizonFor = (score: number): DealItem["horizon"] =>
  score >= 45 ? "near" : score >= 25 ? "mid" : "long";
const confFromScore = (score: number): Confidence => (score >= 45 ? "H" : score >= 25 ? "M" : "L");

function evidenceFor(signals: Record<string, number>, lang: Lang): string {
  return Object.entries(signals)
    .filter(([, v]) => v > 0)
    .slice(0, 2)
    .map(([k, v]) => `${EVIDENCE_LABEL[k]?.[lang] ?? k} ${humanizeValue(v, SIGNAL_UNIT[k] ?? "")}`)
    .join(" · ");
}

/** Deal pipeline rows from the scored opportunities — real score + signal evidence. */
export function dealItems(s: AgentState, lang: Lang): DealItem[] {
  return s.opportunities.slice(0, 3).map((o) => ({
    title: DEAL_TITLE[o.sector]?.[lang] ?? o.title,
    rationale: lang === "en" ? o.rationale || o.title : "",
    score: Math.round(o.score),
    horizon: horizonFor(o.score),
    confidence: confFromScore(o.score),
    evidence: evidenceFor(o.signals, lang),
  }));
}

// Fixed risk strings emitted by strategistNode → calibrated, bilingual.
const RISK_CATALOG: {
  match: string;
  en: string;
  ar: string;
  likelihood: Likelihood;
  impact: Confidence;
  confidence: Confidence;
}[] = [
  {
    match: "Sparse indicator",
    en: "Sparse indicator coverage — verify figures before any commitment.",
    ar: "تغطية محدودة للمؤشرات — يجب التحقق من الأرقام قبل أي التزام.",
    likelihood: "likely",
    impact: "M",
    confidence: "M",
  },
  {
    match: "No reliable GDP",
    en: "No reliable GDP trend — forecast confidence is reduced.",
    ar: "لا يتوفر اتجاه موثوق للناتج المحلي — تنخفض ثقة التنبؤ.",
    likelihood: "even",
    impact: "M",
    confidence: "L",
  },
];

/** Risk register: translate the agent's real risk flags + a data-derived forecast-band risk. */
export function riskItems(s: AgentState, lang: Lang): RiskItem[] {
  const out: RiskItem[] = [];
  for (const r of s.risks) {
    const hit = RISK_CATALOG.find((c) => r.includes(c.match));
    if (hit)
      out.push({
        text: hit[lang],
        likelihood: hit.likelihood,
        impact: hit.impact,
        confidence: hit.confidence,
      });
  }
  // Honest, data-derived risk from the forecast band width.
  if (s.forecast) {
    const lo = humanizeValue(s.forecast.lowerBand, "USD");
    const hi = humanizeValue(s.forecast.upperBand, "USD");
    const spread =
      Math.abs(s.forecast.upperBand - s.forecast.lowerBand) /
      Math.max(1, Math.abs(s.forecast.next));
    out.push({
      text:
        lang === "ar"
          ? `يتراوح أفق الناتج المحلي بين ${lo} و${hi} — يجب التخطيط لاحتمال الجانب السلبي.`
          : `GDP outlook spans ${lo}–${hi} — plan against the downside.`,
      likelihood: spread > 0.4 ? "likely" : "even",
      impact: "M",
      confidence: "M",
    });
  }
  return out.slice(0, 3);
}

/** Overall confidence derived from coverage — replaces the old hardcoded "med". */
export function deriveConfidence(s: AgentState): "high" | "med" | "low" {
  let pts = 0;
  if (s.indicators.length >= 7) pts += 2;
  else if (s.indicators.length >= 4) pts += 1;
  if (s.passages.length >= 3) pts += 1;
  if (s.forecast) pts += 1;
  return pts >= 3 ? "high" : pts >= 2 ? "med" : "low";
}

export function confidenceTag(c: "high" | "med" | "low"): Confidence {
  return c === "high" ? "H" : c === "med" ? "M" : "L";
}

/** The single hero number: next-year GDP projection (with delta) or current GDP. */
export function heroMetric(s: AgentState, lang: Lang): HeroMetric | undefined {
  if (s.forecast) {
    const last = s.gdpSeries?.[s.gdpSeries.length - 1]?.value;
    let delta: string | undefined;
    if (last && last > 0) {
      const pct = ((s.forecast.next - last) / last) * 100;
      delta = `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
    }
    return {
      label: lang === "ar" ? "الناتج المحلي للعام القادم (متوقع)" : "GDP next year (proj.)",
      value: humanizeValue(s.forecast.next, "USD"),
      delta,
    };
  }
  const gdp = s.indicators.find((i) => i.code === "gdp");
  if (gdp)
    return {
      label: lang === "ar" ? "الناتج المحلي" : "GDP",
      value: humanizeValue(gdp.value, "USD"),
    };
  return undefined;
}

/** One-line GDP trend characterization (CAGR) for the scribe prompt. */
export function gdpTrend(s: AgentState): string {
  const g = s.gdpSeries;
  if (!g || g.length < 2) return "";
  const first = g[0]?.value ?? 0;
  const last = g[g.length - 1]?.value ?? 0;
  const yrs = (g[g.length - 1]?.year ?? 0) - (g[0]?.year ?? 0);
  if (first <= 0 || yrs <= 0) return "";
  const cagr = ((last / first) ** (1 / yrs) - 1) * 100;
  return `GDP ${cagr >= 0 ? "grew" : "declined"} ~${Math.abs(cagr).toFixed(1)}% CAGR over ${yrs}y (${g[0]?.year}–${g[g.length - 1]?.year}).`;
}

/** Every data source behind the brief — indicators, bilateral trade, live web. */
export function defaultCitations(s: AgentState): string[] {
  const set = new Set<string>(s.indicators.map((i) => `${i.source} (${i.year})`));
  if (s.trade) set.add(`${s.trade.source} (${s.trade.year})`);
  for (const p of s.passages) set.add(p.source);
  if (s.developments && s.developments.results.length > 0) set.add("Live web (Tavily)");
  return [...set].slice(0, 12);
}
