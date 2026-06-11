/**
 * Executive one-pager as a self-contained SVG string — decision-first (BLUF),
 * dark cinematic, bilingual (EN / AR-RTL).
 *
 * Pure (no DOM, no fs, no clock) so it renders identically on the server
 * (→ rasterised to PNG/PPTX) and in the browser (data URI), and stays
 * deterministic for tests. Numbers come straight from the agent's grounded
 * state; strategic prose comes from `state.briefing` / `state.briefingAr`.
 * The canvas height is computed from stacked content, so modules never overlap.
 */
import { COUNTRIES } from "@/lib/data/countries";
import { iso3Name } from "@/lib/data/iso-countries";
import { humanizeValue } from "@/services/agent/format";
import type {
  AgentState,
  Briefing,
  DealItem,
  IndicatorPoint,
  RiskItem,
} from "@/services/agent/state";

type Loc = "en" | "ar";
type InfographicTheme = "dark" | "light";

/**
 * Light-mode palette substitution. The module renders with the dark constants
 * below; for light export/preview every hex is remapped to the app's warm-cream
 * tokens. String substitution keeps all module renderers palette-free while
 * staying pure and deterministic. Alpha-suffixed uses (e.g. `${col}22`) survive
 * because the replacement preserves the 6-digit prefix.
 */
const LIGHT_MAP: [string, string][] = [
  ["#0b0b12", "#f7f3eb"], // page bg → cream
  ["#101019", "#ece7dd"], // header band
  ["#15161f", "#fdfaf4"], // card
  ["#1b1c26", "#f1ece0"], // card-2
  ["#2a2b38", "#ddd7ca"], // border
  ["#d7bc6d", "#7c5e24"], // bright gold highlight → deep gold (legible on cream)
  ["#f4f5f7", "#231f15"], // primary text → near-black
  ["#a9abb6", "#534c3e"], // mid text
  ["#71727e", "#7d776a"], // dim text
  ["#22c55e", "#15803d"], // ok
  ["#f59e0b", "#a16207"], // amber
  ["#f87171", "#c81e3c"], // risk
  ["#ffffff14", "#00000014"], // score-bar track
  ["#ffffff0d", "#0000000d"], // chart gridline
];

function applyTheme(svg: string, theme: InfographicTheme): string {
  if (theme !== "light") return svg;
  let out = svg;
  for (const [from, to] of LIGHT_MAP) out = out.split(from).join(to);
  return out;
}

const W = 1280;
const M = 32; // page margin
const GAP = 16;
const COL_L_X = M;
const COL_W = 588;
const COL_R_X = COL_L_X + COL_W + 24; // 644
const COL_R_W = W - M - COL_R_X; // 604
const FULL_W = W - 2 * M;

// Dark cinematic palette (app tokens)
const BG = "#0b0b12";
const CARD = "#15161f";
const CARD2 = "#1b1c26";
const BORDER = "#2a2b38";
const TEAL = "#92722a";
const CYAN = "#d7bc6d";
const TXT = "#f4f5f7";
const MID = "#a9abb6";
const DIM = "#71727e";
const OK = "#22c55e";
const AMBER = "#f59e0b";
const RISK = "#f87171";

const AR_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/**
 * Wrap LTR runs (numbers, currency, %, Latin units like "$2.29 trillion") in
 * Unicode bidi isolates (LRI…PDI) so they stay intact and don't get reordered
 * or clipped inside RTL Arabic text. Browsers — unlike resvg — do not isolate
 * LTR runs in SVG `<text>` automatically, which scrambled every metric value in
 * the Arabic one-pager. No-op for strings without Arabic (the English path).
 */
function isolateLtr(s: string): string {
  if (!AR_LETTER.test(s)) return s;
  const words = s.split(" ");
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) {
      out.push(`⁦${run.join(" ")}⁩`);
      run = [];
    }
  };
  for (const w of words) {
    if (/[A-Za-z0-9]/.test(w) && !AR_LETTER.test(w)) run.push(w);
    else {
      flush();
      out.push(w);
    }
  }
  flush();
  return out.join(" ");
}

function esc(s: string): string {
  return isolateLtr(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const fontFor = (loc: Loc) =>
  loc === "ar"
    ? '"Noto Kufi Arabic", "Geeza Pro", "Arial", sans-serif'
    : '"Inter", system-ui, sans-serif';

function byCode(indicators: IndicatorPoint[]): Map<string, IndicatorPoint> {
  return new Map(indicators.map((i) => [i.code, i]));
}

// ── i18n string tables ─────────────────────────────────────────────────────
const SECTOR: Record<string, { en: string; ar: string }> = {
  energy: { en: "Energy", ar: "الطاقة" },
  infrastructure: { en: "Infrastructure", ar: "البنية التحتية" },
  trade: { en: "Trade", ar: "التجارة" },
  sustainability: { en: "Sustainability", ar: "الاستدامة" },
  economy: { en: "Economy", ar: "الاقتصاد" },
  general: { en: "General", ar: "عام" },
};
const CLS: Record<string, { en: string; ar: string }> = {
  public: { en: "PUBLIC", ar: "عام" },
  internal: { en: "INTERNAL", ar: "داخلي" },
  confidential: { en: "CONFIDENTIAL", ar: "سرّي" },
  secret: { en: "SECRET", ar: "سرّي للغاية" },
};
const LIKELY: Record<string, { en: string; ar: string }> = {
  very_unlikely: { en: "Very unlikely", ar: "مستبعد جداً" },
  unlikely: { en: "Unlikely", ar: "مستبعد" },
  even: { en: "Roughly even", ar: "احتمال متساوٍ" },
  likely: { en: "Likely", ar: "مرجّح" },
  very_likely: { en: "Very likely", ar: "مرجّح جداً" },
};
const HORIZON: Record<string, { en: string; ar: string }> = {
  near: { en: "Near-term", ar: "قريب المدى" },
  mid: { en: "Mid-term", ar: "متوسط المدى" },
  long: { en: "Long-term", ar: "بعيد المدى" },
};
const L = {
  recommendation: { en: "RECOMMENDATION", ar: "التوصية" },
  deals: { en: "Deal pipeline", ar: "مسار الصفقات" },
  position: { en: "Our position", ar: "موقفنا" },
  offers: { en: "Offers", ar: "نعرض" },
  asks: { en: "Asks", ar: "نطلب" },
  redlines: { en: "Red lines", ar: "خطوط حمراء" },
  risk: { en: "Risk register", ar: "سجل المخاطر" },
  gdp: { en: "GDP trend & 1-year forecast", ar: "اتجاه الناتج المحلي وتوقّع سنة" },
  kpis: { en: "Key indicators", ar: "المؤشرات الرئيسية" },
  counterpart: { en: "Counterpart", ar: "الطرف المقابل" },
  objectives: { en: "Their objectives", ar: "أهدافهم" },
  theirAsks: { en: "Likely asks", ar: "مطالب محتملة" },
  scenarios: { en: "Scenarios", ar: "السيناريوهات" },
  watch: { en: "What to watch", ar: "ما يجب مراقبته" },
  talking: { en: "Talking points — the ask", ar: "نقاط الحديث — المطلب" },
  verified: { en: "sources", ar: "مصادر موثّقة" },
  conf: { en: "Confidence", ar: "الثقة" },
  onprem: { en: "On-prem AI", ar: "ذكاء اصطناعي محلي" },
  footer: {
    en: "Generated by the Strategic Advisor · on-prem AI · all figures cited",
    ar: "أُعدّت بواسطة المستشار الاستراتيجي · ذكاء اصطناعي محلي · جميع الأرقام موثّقة",
  },
} as const;
const tr = (k: keyof typeof L, loc: Loc) => L[k][loc];

// ── primitives ──────────────────────────────────────────────────────────────
function card(x: number, y: number, w: number, h: number, fill = CARD): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${BORDER}"/>`;
}

/** Locale-aware single line of text inside a padded card. */
function line(
  cx: number,
  cw: number,
  pad: number,
  y: number,
  text: string,
  o: {
    size?: number;
    color?: string;
    weight?: number;
    loc: Loc;
    upper?: boolean;
    spacing?: number;
  },
): string {
  const ar = o.loc === "ar";
  const x = ar ? cx + cw - pad : cx + pad;
  const anchor = ar ? "end" : "start";
  // direction=rtl only when the text is actually Arabic — a pure-LTR value
  // ("$2.29 trillion") rendered rtl scrambles and clips in browsers; right-
  // align it via the anchor but keep its native LTR flow.
  const rtl = ar && AR_LETTER.test(text) ? ' direction="rtl"' : "";
  const extra = `${rtl}${o.upper ? ' letter-spacing="0.6" style="text-transform:uppercase"' : o.spacing ? ` letter-spacing="${o.spacing}"` : ""}`;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${o.size ?? 13}" font-weight="${o.weight ?? 400}" fill="${o.color ?? TXT}"${extra}>${esc(text)}</text>`;
}

/** Locale-aware wrapped paragraph. Returns the rendered svg + the y after it. */
function para(
  cx: number,
  cw: number,
  pad: number,
  y: number,
  text: string,
  o: {
    size?: number;
    color?: string;
    weight?: number;
    loc: Loc;
    max: number;
    lh?: number;
    maxLines?: number;
  },
): { svg: string; y: number } {
  if (!text) return { svg: "", y };
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (`${cur} ${w}`.trim().length > o.max) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) lines.push(cur.trim());
  const shown = lines.slice(0, o.maxLines ?? 6);
  const lh = o.lh ?? (o.size ?? 13) + 6;
  const ar = o.loc === "ar";
  const x = ar ? cx + cw - pad : cx + pad;
  const anchor = ar ? "end" : "start";
  const tspans = shown
    .map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${esc(l)}</tspan>`)
    .join("");
  const rtl = ar && AR_LETTER.test(text) ? ' direction="rtl"' : "";
  const svg = `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${o.size ?? 13}" font-weight="${o.weight ?? 400}" fill="${o.color ?? MID}"${rtl}>${tspans}</text>`;
  return { svg, y: y + (shown.length - 1) * lh };
}

/** Locale-aware bullet list. */
function bullets(
  cx: number,
  cw: number,
  pad: number,
  y: number,
  items: string[],
  o: {
    loc: Loc;
    max: number;
    color?: string;
    size?: number;
    lh?: number;
    dot?: string;
    maxItems?: number;
  },
): { svg: string; y: number } {
  const ar = o.loc === "ar";
  const size = o.size ?? 12.5;
  const lh = o.lh ?? 17;
  let cy = y;
  const out: string[] = [];
  for (const it of items.slice(0, o.maxItems ?? 4)) {
    const dotX = ar ? cx + cw - pad : cx + pad;
    out.push(`<circle cx="${dotX}" cy="${cy - 4}" r="2" fill="${o.dot ?? TEAL}"/>`);
    const p = para(cx, cw, pad + 12, cy, it, {
      size,
      color: o.color ?? MID,
      loc: o.loc,
      max: o.max,
      lh,
      maxLines: 2,
    });
    out.push(p.svg);
    cy = p.y + lh + 4;
  }
  return { svg: out.join(""), y: cy };
}

function confChip(x: number, y: number, c: "H" | "M" | "L"): string {
  const col = c === "H" ? OK : c === "M" ? AMBER : DIM;
  return `<rect x="${x}" y="${y}" width="20" height="16" rx="5" fill="none" stroke="${col}"/><text x="${x + 10}" y="${y + 12}" text-anchor="middle" font-size="10" font-weight="800" fill="${col}">${c}</text>`;
}

const tagWidth = (text: string, loc: Loc) =>
  Math.max(48, text.length * (loc === "ar" ? 8.5 : 6.6) + 16);

function tag(x: number, y: number, text: string, col: string, loc: Loc): string {
  const w = tagWidth(text, loc);
  return `<rect x="${x}" y="${y}" width="${w.toFixed(0)}" height="18" rx="9" fill="${col}22" stroke="${col}55"/><text x="${x + w / 2}" y="${y + 13}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${col}"${loc === "ar" ? ' direction="rtl"' : ""}>${esc(text)}</text>`;
}

/** Count wrapped lines (mirrors `para`'s wrapping) — for dynamic card heights. */
function wrapCount(text: string, max: number, maxLines: number): number {
  if (!text) return 1;
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (`${cur} ${w}`.trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) lines.push(cur);
  return Math.min(maxLines, Math.max(1, lines.length));
}

function scoreBar(x: number, y: number, w: number, score: number): string {
  const fw = Math.max(2, (Math.max(0, Math.min(100, score)) / 100) * w);
  return `<rect x="${x}" y="${y}" width="${w}" height="7" rx="3.5" fill="#ffffff14"/><rect x="${x}" y="${y}" width="${fw.toFixed(0)}" height="7" rx="3.5" fill="url(#bar)"/>`;
}

function sparkline(x: number, y: number, w: number, h: number, series: number[]): string {
  if (series.length < 2) return "";
  const min = Math.min(...series);
  const max = Math.max(...series);
  const sx = (i: number) => x + (i / (series.length - 1)) * w;
  const sy = (v: number) => y + h - ((v - min) / Math.max(1, max - min)) * h;
  const pts = series.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const lx = sx(series.length - 1);
  const ly = sy(series[series.length - 1] as number);
  return `<polyline points="${pts}" fill="none" stroke="${CYAN}" stroke-width="1.8" opacity="0.9"/><circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.4" fill="${CYAN}"/>`;
}

function lineChart(
  x: number,
  y: number,
  w: number,
  h: number,
  series: { year: number; value: number }[],
  forecast?: { year: number; value: number; lower: number; upper: number },
): string {
  const padL = 52;
  const padB = 22;
  const padT = 8;
  const plotW = w - padL - 16;
  const plotH = h - padB - padT;
  const pts = [...series];
  const all = forecast ? [...pts, { year: forecast.year, value: forecast.value }] : pts;
  if (all.length < 2) return "";
  const minYear = all[0]?.year ?? 0;
  const maxYear = all[all.length - 1]?.year ?? 0;
  const vals = forecast
    ? [...pts.map((p) => p.value), forecast.upper, forecast.lower]
    : pts.map((p) => p.value);
  const minV = Math.min(...vals) * 0.95;
  const maxV = Math.max(...vals) * 1.05;
  const sx = (yr: number) => x + padL + ((yr - minYear) / Math.max(1, maxYear - minYear)) * plotW;
  const sy = (v: number) => y + padT + plotH - ((v - minV) / Math.max(1, maxV - minV)) * plotH;
  const poly = pts.map((p) => `${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ");
  const lastP = pts[pts.length - 1];
  const last = lastP ?? { year: minYear, value: minV };
  let fc = "";
  if (forecast) {
    fc = `<line x1="${sx(last.year).toFixed(1)}" y1="${sy(last.value).toFixed(1)}" x2="${sx(forecast.year).toFixed(1)}" y2="${sy(forecast.value).toFixed(1)}" stroke="${CYAN}" stroke-width="2.4" stroke-dasharray="5 4"/><line x1="${sx(forecast.year).toFixed(1)}" y1="${sy(forecast.upper).toFixed(1)}" x2="${sx(forecast.year).toFixed(1)}" y2="${sy(forecast.lower).toFixed(1)}" stroke="${CYAN}" stroke-width="1" opacity="0.45"/><circle cx="${sx(forecast.year).toFixed(1)}" cy="${sy(forecast.value).toFixed(1)}" r="4.5" fill="${CYAN}"/><text x="${sx(forecast.year).toFixed(1)}" y="${(sy(forecast.value) - 10).toFixed(1)}" text-anchor="end" font-size="11" font-weight="700" fill="${CYAN}">${esc(humanizeValue(forecast.value, "USD"))}</text>`;
  }
  const grid = [minV, (minV + maxV) / 2, maxV]
    .map(
      (v) =>
        `<line x1="${x + padL}" y1="${sy(v).toFixed(1)}" x2="${x + padL + plotW}" y2="${sy(v).toFixed(1)}" stroke="#ffffff0d"/><text x="${x + padL - 8}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" font-size="9.5" fill="${DIM}">${esc(humanizeValue(v, "USD"))}</text>`,
    )
    .join("");
  const yearLabels = [minYear, maxYear]
    .map(
      (yr) =>
        `<text x="${sx(yr).toFixed(1)}" y="${y + h - 6}" text-anchor="middle" font-size="9.5" fill="${DIM}">${yr}</text>`,
    )
    .join("");
  return `${grid}<polyline points="${poly}" fill="none" stroke="${TEAL}" stroke-width="2.4"/><circle cx="${sx(last.year).toFixed(1)}" cy="${sy(last.value).toFixed(1)}" r="3.5" fill="${TEAL}"/>${fc}${yearLabels}`;
}

// section header inside a card
function head(cx: number, cw: number, y: number, title: string, loc: Loc): string {
  return line(cx, cw, 18, y, title, {
    size: 12,
    weight: 700,
    color: MID,
    loc,
    upper: loc === "en",
  });
}

// ── module renderers (return svg + consumed height) ─────────────────────────
function dealsCard(
  x: number,
  y: number,
  w: number,
  deals: DealItem[],
  loc: Loc,
): { svg: string; h: number } {
  const pad = 18;
  const rowH = 76;
  const h = 52 + Math.max(1, deals.length) * rowH;
  const ar = loc === "ar";
  const lead = ar ? x + w - pad : x + pad;
  const trail = ar ? x + pad : x + w - pad;
  const leadAnchor = ar ? "end" : "start";
  const trailAnchor = ar ? "start" : "end";
  const rtl = ar ? ' direction="rtl"' : "";
  let s = card(x, y, w, h) + head(x, w, y + 26, tr("deals", loc), loc);
  deals.forEach((d, i) => {
    const ry = y + 56 + i * rowH;
    // title (lead edge) + score (trail edge) on the top line
    s += `<text x="${lead}" y="${ry + 14}" text-anchor="${leadAnchor}" font-size="14" font-weight="700" fill="${TXT}"${rtl}>${esc(d.title)}</text>`;
    s += `<text x="${trail}" y="${ry + 15}" text-anchor="${trailAnchor}" font-size="15" font-weight="800" fill="${TEAL}">${d.score}</text>`;
    // full-width score bar (LTR — a quantity)
    s += scoreBar(x + pad, ry + 26, w - pad * 2, d.score);
    // meta line: horizon tag (lead) + confidence chip (trail) — no collision
    const hWord = HORIZON[d.horizon]?.[loc] ?? d.horizon;
    const tw = tagWidth(hWord, loc);
    s += tag(ar ? x + w - pad - tw : x + pad, ry + 42, hWord, CYAN, loc);
    s += confChip(ar ? x + pad : x + w - pad - 20, ry + 43, d.confidence);
    // evidence (lead edge)
    if (d.evidence)
      s += `<text x="${lead}" y="${ry + 68}" text-anchor="${leadAnchor}" font-size="11" fill="${DIM}"${rtl}>${esc(d.evidence)}</text>`;
  });
  return { svg: s, h };
}

function positionCard(
  x: number,
  y: number,
  w: number,
  b: Briefing,
  loc: Loc,
): { svg: string; h: number } {
  const pad = 18;
  let inner = "";
  let cy = y + 50;
  const block = (label: string, items: string[], color: string) => {
    inner += line(x, w, pad, cy, label, { size: 11, weight: 700, color, loc, upper: loc === "en" });
    cy += 16;
    const r = bullets(x, w, pad, cy + 6, items, {
      loc,
      max: loc === "ar" ? 52 : 64,
      color: MID,
      dot: color,
      maxItems: 3,
    });
    inner += r.svg;
    cy = r.y + 6;
  };
  block(tr("offers", loc), b.position.offers, OK);
  block(tr("asks", loc), b.position.asks, TEAL);
  block(tr("redlines", loc), b.position.redLines, RISK);
  const h = cy - y + 6;
  return { svg: card(x, y, w, h) + head(x, w, y + 26, tr("position", loc), loc) + inner, h };
}

function riskCard(
  x: number,
  y: number,
  w: number,
  risks: RiskItem[],
  loc: Loc,
): { svg: string; h: number } {
  const pad = 18;
  const ar = loc === "ar";
  let inner = "";
  let cy = y + 52;
  for (const r of risks.slice(0, 3)) {
    const col = r.likelihood === "likely" || r.likelihood === "very_likely" ? RISK : AMBER;
    const p = para(x, w, pad, cy, r.text, {
      size: 12.5,
      color: TXT,
      loc,
      max: ar ? 56 : 70,
      lh: 16,
      maxLines: 2,
    });
    inner += p.svg;
    cy = p.y + 22;
    // likelihood chip (lead edge) + impact/confidence text after it — no overlap
    const lw = LIKELY[r.likelihood]?.[loc] ?? r.likelihood;
    const tw = tagWidth(lw, loc);
    inner += tag(ar ? x + w - pad - tw : x + pad, cy - 13, lw, col, loc);
    const meta = ar
      ? `الأثر ${r.impact} · الثقة ${r.confidence}`
      : `Impact ${r.impact} · Confidence ${r.confidence}`;
    inner += `<text x="${ar ? x + w - pad - tw - 10 : x + pad + tw + 10}" y="${cy}" text-anchor="${ar ? "end" : "start"}" font-size="10.5" fill="${DIM}"${ar ? ' direction="rtl"' : ""}>${esc(meta)}</text>`;
    cy += 24;
  }
  const h = Math.max(120, cy - y + 6);
  return { svg: card(x, y, w, h) + head(x, w, y + 26, tr("risk", loc), loc) + inner, h };
}

function listCard(
  x: number,
  y: number,
  w: number,
  title: string,
  sections: { label: string; items: string[]; color: string }[],
  loc: Loc,
): { svg: string; h: number } {
  const pad = 18;
  let inner = "";
  let cy = y + 50;
  for (const sec of sections) {
    inner += line(x, w, pad, cy, sec.label, {
      size: 11,
      weight: 700,
      color: sec.color,
      loc,
      upper: loc === "en",
    });
    cy += 16;
    const r = bullets(x, w, pad, cy + 6, sec.items, {
      loc,
      max: loc === "ar" ? 56 : 70,
      color: MID,
      dot: sec.color,
      maxItems: 3,
    });
    inner += r.svg;
    cy = r.y + 6;
  }
  const h = cy - y + 6;
  return { svg: card(x, y, w, h) + head(x, w, y + 26, title, loc) + inner, h };
}

function kpisCard(
  x: number,
  y: number,
  w: number,
  state: AgentState,
  loc: Loc,
): { svg: string; h: number } {
  const m = byCode(state.indicators);
  const all: { code: string; label: { en: string; ar: string }; unit: string }[] = [
    { code: "gdp", label: { en: "Market size (GDP)", ar: "حجم السوق (الناتج)" }, unit: "USD" },
    { code: "gdp_growth", label: { en: "Growth", ar: "النمو" }, unit: "%" },
    {
      code: "electricity_pc",
      label: { en: "Energy use / capita", ar: "استهلاك الطاقة للفرد" },
      unit: "kWh",
    },
    { code: "renew_share", label: { en: "Renewables", ar: "الطاقة المتجددة" }, unit: "%" },
    { code: "fdi", label: { en: "FDI inflows", ar: "الاستثمار الأجنبي" }, unit: "USD" },
    { code: "exports", label: { en: "Exports", ar: "الصادرات" }, unit: "USD" },
    { code: "population", label: { en: "Population", ar: "السكان" }, unit: "people" },
    { code: "co2", label: { en: "CO₂ / capita", ar: "ثاني أكسيد الكربون للفرد" }, unit: "t" },
  ];
  // Six tiles, preferring metrics the agent actually grounded.
  const defs = [...all.filter((d) => m.has(d.code)), ...all.filter((d) => !m.has(d.code))].slice(
    0,
    6,
  );
  const tw = (w - 12) / 2;
  const th = 74;
  const rows = Math.ceil(defs.length / 2);
  const h = 44 + rows * th + (rows - 1) * 10 + 10;
  let s = card(x, y, w, h) + head(x, w, y + 26, tr("kpis", loc), loc);
  defs.forEach((d, i) => {
    const tx = x + (i % 2) * (tw + 12);
    const ty = y + 44 + Math.floor(i / 2) * (th + 10);
    const ind = m.get(d.code);
    s += `<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="10" fill="${CARD2}"/>`;
    s += line(tx, tw, 12, ty + 22, d.label[loc], {
      size: 11,
      weight: 600,
      color: DIM,
      loc,
      upper: loc === "en",
    });
    s += line(tx, tw, 12, ty + 50, ind ? humanizeValue(ind.value, d.unit) : "—", {
      size: 21,
      weight: 800,
      color: TXT,
      loc,
    });
    if (d.code === "gdp" && state.gdpSeries && state.gdpSeries.length >= 2) {
      s += sparkline(
        tx + tw - 96,
        ty + 50,
        80,
        16,
        state.gdpSeries.map((p) => p.value),
      );
    } else if (ind) {
      s += line(tx, tw, 12, ty + 66, `${ind.year} · ${ind.source}`, {
        size: 9.5,
        color: DIM,
        loc: "en",
      });
    }
  });
  return { svg: s, h };
}

/** Trade composition donut (UAE exports vs imports) with headline figures. */
function tradeCard(
  x: number,
  y: number,
  w: number,
  state: AgentState,
  loc: Loc,
): { svg: string; h: number } {
  const trade = state.trade;
  if (!trade || trade.totalUsd <= 0) return { svg: "", h: 0 };
  const h = 168;
  const ar = loc === "ar";
  const r = 44;
  const thick = 16;
  const dcx = ar ? x + w - 18 - r - thick / 2 : x + 18 + r + thick / 2;
  const dcy = y + 64 + r - 18;
  const c = 2 * Math.PI * r;
  const exFrac = Math.max(0, Math.min(1, trade.exportsUsd / trade.totalUsd));
  const donut =
    `<circle cx="${dcx}" cy="${dcy}" r="${r}" fill="none" stroke="${CYAN}" stroke-width="${thick}" transform="rotate(-90 ${dcx} ${dcy})" stroke-dasharray="${(exFrac * c).toFixed(1)} ${c.toFixed(1)}"/>` +
    `<circle cx="${dcx}" cy="${dcy}" r="${r}" fill="none" stroke="${TEAL}" stroke-width="${thick}" transform="rotate(${(-90 + exFrac * 360).toFixed(1)} ${dcx} ${dcy})" stroke-dasharray="${((1 - exFrac) * c).toFixed(1)} ${c.toFixed(1)}" opacity="0.55"/>` +
    `<text x="${dcx}" y="${dcy + 4}" text-anchor="middle" font-size="12.5" font-weight="800" fill="${TXT}">${esc(humanizeValue(trade.totalUsd, "USD"))}</text>`;
  const txX = ar ? x : dcx + r + thick;
  const txW = ar ? w - (r * 2 + thick + 36) : x + w - txX;
  const balance = trade.exportsUsd - trade.importsUsd;
  const rowsDef: { label: string; value: string; color: string }[] = [
    {
      label: ar ? "صادرات الإمارات" : "UAE exports",
      value: `${humanizeValue(trade.exportsUsd, "USD")} · ${Math.round(exFrac * 100)}%`,
      color: CYAN,
    },
    {
      label: ar ? "واردات الإمارات" : "UAE imports",
      value: `${humanizeValue(trade.importsUsd, "USD")} · ${100 - Math.round(exFrac * 100)}%`,
      color: TEAL,
    },
    {
      label: ar ? "الميزان التجاري" : "Trade balance",
      value: `${balance >= 0 ? "+" : "−"}${humanizeValue(Math.abs(balance), "USD")}`,
      color: balance >= 0 ? OK : AMBER,
    },
  ];
  let rowsSvg = "";
  rowsDef.forEach((rw, i) => {
    const ry = y + 62 + i * 30;
    const dotX = ar ? txX + txW - 18 : txX;
    rowsSvg += `<circle cx="${dotX}" cy="${ry - 4}" r="3.5" fill="${rw.color}"/>`;
    rowsSvg += `<text x="${ar ? dotX - 10 : dotX + 10}" y="${ry}" text-anchor="${ar ? "end" : "start"}" font-size="11.5" fill="${MID}"${ar ? ' direction="rtl"' : ""}>${esc(rw.label)}</text>`;
    rowsSvg += `<text x="${ar ? txX : txX + txW - 18}" y="${ry}" text-anchor="${ar ? "start" : "end"}" font-size="12.5" font-weight="700" fill="${TXT}">${esc(rw.value)}</text>`;
  });
  const src = `<text x="${ar ? x + w - 18 : x + 18}" y="${y + h - 12}" text-anchor="${ar ? "end" : "start"}" font-size="9.5" fill="${DIM}">${esc(`${trade.source} · ${trade.year}`)}</text>`;
  const title = loc === "ar" ? "التجارة مع الإمارات" : "Trade with UAE";
  return { svg: card(x, y, w, h) + head(x, w, y + 26, title, loc) + donut + rowsSvg + src, h };
}

function gdpCard(
  x: number,
  y: number,
  w: number,
  state: AgentState,
  loc: Loc,
): { svg: string; h: number } {
  const h = 208;
  const fc =
    state.forecast && state.gdpSeries && state.gdpSeries.length >= 2
      ? {
          year: (state.gdpSeries[state.gdpSeries.length - 1]?.year ?? 0) + 1,
          value: state.forecast.next,
          lower: state.forecast.lowerBand,
          upper: state.forecast.upperBand,
        }
      : undefined;
  const chart =
    state.gdpSeries && state.gdpSeries.length >= 2
      ? lineChart(x, y + 36, w, h - 44, state.gdpSeries, fc)
      : `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-size="12" fill="${DIM}">GDP trend unavailable</text>`;
  return { svg: card(x, y, w, h) + head(x, w, y + 26, tr("gdp", loc), loc) + chart, h };
}

// ── main ────────────────────────────────────────────────────────────────────
/**
 * Dark-hex → warm-cream palette swap for light mode. The generator composes
 * with the dark brand constants; the unique hex tokens are remapped at the end
 * so layout code stays single-sourced.
 */
const LIGHT_SWAP: [string, string][] = [
  ["#0b0b12", "#f7f3eb"], // BG → warm cream
  ["#15161f", "#fdfaf4"], // CARD → brightest cream
  ["#1b1c26", "#ece7dd"], // CARD2
  ["#2a2b38", "#ddd7ca"], // BORDER
  ["#f4f5f7", "#231f15"], // TXT → warm near-black
  ["#a9abb6", "#534c3e"], // MID
  ["#71727e", "#7d776a"], // DIM
  ["#d7bc6d", "#7c5e24"], // bright gold → deep gold (legible on cream)
];

function toLightPalette(svg: string): string {
  let out = svg;
  for (const [dark, light] of LIGHT_SWAP) {
    out = out.split(dark).join(light).split(dark.toUpperCase()).join(light);
  }
  return out;
}

export function countryOnePagerSvg(
  state: AgentState,
  opts: { locale?: Loc; theme?: "dark" | "light" } = {},
): string {
  const loc: Loc = opts.locale === "ar" ? "ar" : "en";
  const iso3 = state.scope?.iso3 ?? "";
  const country = COUNTRIES.find((c) => c.iso3 === iso3);
  const name =
    (loc === "ar" ? (country?.nameAr ?? country?.nameEn) : country?.nameEn) ??
    iso3Name(iso3) ??
    iso3;
  const sectorKey = state.scope?.sector ?? "general";
  const sector = SECTOR[sectorKey]?.[loc] ?? sectorKey;
  const b = (loc === "ar" ? (state.briefingAr ?? state.briefing) : state.briefing) as
    | Briefing
    | undefined;
  const clsKey = state.classification ?? "internal";
  const cls = CLS[clsKey]?.[loc] ?? clsKey.toUpperCase();
  const clsCol = clsKey === "secret" ? RISK : clsKey === "confidential" ? AMBER : TEAL;

  // ── header ──
  const meetTitle = loc === "ar" ? `الإمارات ↔ ${name} · ${sector}` : `UAE ↔ ${name} · ${sector}`;
  const tradeSeg = state.trade
    ? ` · ${loc === "ar" ? "التجارة" : "trade"} ${humanizeValue(state.trade.totalUsd, "USD")}`
    : "";
  const sub =
    loc === "ar"
      ? `${state.indicators.length} ${tr("verified", loc)} · ${tr("conf", loc)} ${b?.confidence ?? "—"}${tradeSeg} · ${tr("onprem", loc)}`
      : `${state.indicators.length} ${tr("verified", loc)} verified · ${tr("conf", loc)} ${b?.confidence ?? "—"}${tradeSeg} · ${tr("onprem", loc)}`;
  // classification pill + meeting title, anchored to the leading edge per locale
  const pill =
    loc === "ar"
      ? `<rect x="${W - M - 150}" y="24" width="150" height="28" rx="14" fill="${clsCol}22" stroke="${clsCol}66"/><text x="${W - M - 75}" y="42" text-anchor="middle" font-size="12" font-weight="700" fill="${clsCol}" direction="rtl">${esc(cls)}</text><text x="${W - M - 162}" y="44" text-anchor="end" font-size="21" font-weight="800" fill="${TXT}" direction="rtl">${esc(meetTitle)}</text><text x="${W - M - 162}" y="70" text-anchor="end" font-size="12" fill="${DIM}" direction="rtl">${esc(sub)}</text>`
      : `<rect x="${M}" y="24" width="150" height="28" rx="14" fill="${clsCol}22" stroke="${clsCol}66"/><text x="${M + 75}" y="42" text-anchor="middle" font-size="12" font-weight="700" fill="${clsCol}">${esc(cls)}</text><text x="${M + 162}" y="44" font-size="21" font-weight="800" fill="${TXT}">${esc(meetTitle)}</text><text x="${M + 162}" y="70" font-size="12" fill="${DIM}">${esc(sub)}</text>`;
  const header = `<rect x="0" y="0" width="${W}" height="92" fill="#101019"/><rect x="0" y="91" width="${W}" height="2" fill="url(#bar)"/>${pill}`;

  // ── BLUF banner (height grows with the recommendation so whyNow never spills) ──
  const blufTop = 108;
  const blufLines = wrapCount(b?.bluf || "—", loc === "ar" ? 64 : 78, 3);
  const blufH = Math.max(140, 74 + (blufLines - 1) * 25 + (b?.whyNow ? 30 : 0));
  const heroW = 300;
  const heroX = loc === "ar" ? M : W - M - heroW;
  const blufTextX = loc === "ar" ? M + heroW + 24 : M;
  const blufTextW = FULL_W - heroW - 24;
  let bluf = card(M, blufTop, FULL_W, blufH, CARD2);
  bluf += `<rect x="${loc === "ar" ? W - M - 5 : M}" y="${blufTop}" width="5" height="${blufH}" rx="2.5" fill="url(#bar)"/>`;
  bluf += line(blufTextX, blufTextW, 22, blufTop + 30, tr("recommendation", loc), {
    size: 11,
    weight: 700,
    color: TEAL,
    loc,
    upper: loc === "en",
  });
  const blufBody = para(blufTextX, blufTextW, 22, blufTop + 58, b?.bluf || "—", {
    size: 19,
    weight: 700,
    color: TXT,
    loc,
    max: loc === "ar" ? 64 : 78,
    lh: 25,
    maxLines: 3,
  });
  bluf += blufBody.svg;
  if (b?.whyNow)
    bluf += para(blufTextX, blufTextW, 22, blufBody.y + 30, b.whyNow, {
      size: 12.5,
      color: MID,
      loc,
      max: loc === "ar" ? 70 : 88,
      maxLines: 1,
    }).svg;
  // hero metric
  bluf += `<rect x="${heroX}" y="${blufTop + 18}" width="${heroW}" height="${blufH - 36}" rx="12" fill="${BG}" stroke="${BORDER}"/>`;
  if (b?.heroMetric) {
    bluf += line(heroX, heroW, 18, blufTop + 46, b.heroMetric.label, {
      size: 11,
      weight: 600,
      color: DIM,
      loc,
    });
    bluf += line(heroX, heroW, 18, blufTop + 88, b.heroMetric.value, {
      size: 32,
      weight: 800,
      color: CYAN,
      loc,
    });
    if (b.heroMetric.delta) {
      const up = b.heroMetric.delta.includes("▲");
      bluf += line(heroX, heroW, 18, blufTop + 112, b.heroMetric.delta, {
        size: 13,
        weight: 700,
        color: up ? OK : RISK,
        loc,
      });
    }
  }

  // ── stacked body columns ──
  const bodyTop = blufTop + blufH + GAP;
  const parts: string[] = [];
  let yL = bodyTop;
  let yR = bodyTop;
  const pushL = (r: { svg: string; h: number }) => {
    parts.push(r.svg);
    yL += r.h + GAP;
  };
  const pushR = (r: { svg: string; h: number }) => {
    parts.push(r.svg);
    yR += r.h + GAP;
  };

  if (b) {
    if (b.deals.length) pushL(dealsCard(COL_L_X, yL, COL_W, b.deals, loc));
    if (b.position.offers.length || b.position.asks.length || b.position.redLines.length)
      pushL(positionCard(COL_L_X, yL, COL_W, b, loc));
    if (b.risks.length) pushL(riskCard(COL_L_X, yL, COL_W, b.risks, loc));
  }
  pushR(gdpCard(COL_R_X, yR, COL_R_W, state, loc));
  pushR(kpisCard(COL_R_X, yR, COL_R_W, state, loc));
  const tradeR = tradeCard(COL_R_X, yR, COL_R_W, state, loc);
  if (tradeR.h > 0) pushR(tradeR);
  if (b && (b.counterpart.objectives.length || b.counterpart.likelyAsks.length))
    pushR(
      listCard(
        COL_R_X,
        yR,
        COL_R_W,
        tr("counterpart", loc),
        [
          { label: tr("objectives", loc), items: b.counterpart.objectives, color: TEAL },
          { label: tr("theirAsks", loc), items: b.counterpart.likelyAsks, color: CYAN },
        ],
        loc,
      ),
    );

  // ── full-width: scenarios + watchlist, then talking points ──
  let yFull = Math.max(yL, yR);
  if (b && (b.scenarios.length || b.watchlist.length)) {
    const sw = (FULL_W - GAP) / 2;
    const scen = listCard(
      M,
      yFull,
      sw,
      tr("scenarios", loc),
      [
        {
          label: "",
          items: b.scenarios.map(
            (sc) => `${sc.name}: ${sc.outlook} (${LIKELY[sc.likelihood]?.[loc] ?? sc.likelihood})`,
          ),
          color: CYAN,
        },
      ],
      loc,
    );
    const watch = listCard(
      M + sw + GAP,
      yFull,
      sw,
      tr("watch", loc),
      [{ label: "", items: b.watchlist, color: AMBER }],
      loc,
    );
    parts.push(scen.svg, watch.svg);
    yFull += Math.max(scen.h, watch.h) + GAP;
  }
  if (b?.talkingPoints.length) {
    const pad = 18;
    let inner = "";
    let cy = yFull + 50;
    b.talkingPoints.slice(0, 4).forEach((tp, i) => {
      inner += `<text x="${loc === "ar" ? W - M - pad : M + pad}" y="${cy}" text-anchor="${loc === "ar" ? "end" : "start"}" font-size="13" font-weight="800" fill="${TEAL}">${i + 1}.</text>`;
      const p = para(M, FULL_W, pad + 22, cy, tp, {
        size: 13,
        color: TXT,
        loc,
        max: loc === "ar" ? 120 : 150,
        lh: 17,
        maxLines: 2,
      });
      inner += p.svg;
      cy = p.y + 22;
    });
    const h = cy - yFull;
    parts.push(
      card(M, yFull, FULL_W, h) + head(M, FULL_W, yFull + 26, tr("talking", loc), loc) + inner,
    );
    yFull += h + GAP;
  }

  // ── footer: every data source behind the brief ──
  const srcNames: string[] = [...new Set(state.indicators.map((i) => i.source))];
  if (state.trade) srcNames.push(state.trade.source);
  if (state.developments && state.developments.results.length > 0)
    srcNames.push(loc === "ar" ? "ويب حي (Tavily)" : "live web (Tavily)");
  const srcLabel = loc === "ar" ? "المصادر" : "Sources";
  const footerText = `${srcLabel}: ${srcNames.join(" · ")} · ${tr("onprem", loc)} · ${cls}`;
  const H = yFull + 34;
  const footer = `<text x="${loc === "ar" ? W - M : M}" y="${H - 14}" text-anchor="${loc === "ar" ? "end" : "start"}" font-size="11" fill="${DIM}"${loc === "ar" ? ' direction="rtl"' : ""}>${esc(footerText)}</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${fontFor(loc)}'>
  <defs>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="${CYAN}"/></linearGradient>
    <radialGradient id="amb" cx="12%" cy="0%" r="70%"><stop offset="0" stop-color="${TEAL}" stop-opacity="0.10"/><stop offset="1" stop-color="${TEAL}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#amb)"/>
  ${header}
  ${bluf}
  ${parts.join("\n  ")}
  ${footer}
</svg>`;
  return opts.theme === "light" ? toLightPalette(svg) : svg;
}
