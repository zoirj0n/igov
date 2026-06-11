/**
 * Animated video brief from the SAME structured deck the PPTX export uses —
 * fully on-prem: pure-SVG keyframes (text-highlight states baked per frame),
 * rasterised with resvg, assembled by ffmpeg with a slow Ken Burns zoom and
 * crossfades. Highlights animate by crossfading between keyframes (gold bar +
 * emphasis sweeps from line to line). Silent by design — the narrated variant
 * lives in the video studio (services/video/render.ts).
 *
 * Requires `ffmpeg` on PATH (or FFMPEG_PATH). No cloud calls.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { seriesFor } from "@/lib/data/timeseries";
import { humanizeValue } from "@/services/agent/format";
import type { DeckPayload } from "@/services/export/deck-schema";
import { Resvg } from "@resvg/resvg-js";

const exec = promisify(execFile);
const EXEC_OPTS = { maxBuffer: 64 * 1024 * 1024, timeout: 180_000 };

const W = 1920;
const H = 1080;
const FPS = 30;
const XFADE = 0.45; // s, crossfade between keyframes

// Dark cinematic palette (matches the video studio + one-pager)
const BG = "#0b0b12";
const CARD = "#15161f";
const BORDER = "#2a2b38";
const GOLD = "#92722a";
const GOLD_HI = "#d7bc6d";
const TXT = "#f4f5f7";
const MID = "#a9abb6";
const DIM = "#71727e";
const OK = "#22c55e";
const RISK = "#f87171";

function esc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Greedy word-wrap for SVG tspans. */
function wrap(text: string, max: number, maxLines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (`${cur} ${w}`.trim().length > max) {
      if (cur) out.push(cur.trim());
      cur = w;
    } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.slice(0, maxLines);
}

interface Keyframe {
  svg: string;
  durationSec: number;
}

const FONT = (rtl: boolean) =>
  rtl ? '"Noto Kufi Arabic", "Geeza Pro", "Arial", sans-serif' : '"Inter", system-ui, sans-serif';

function shell(body: string, rtl: boolean, classification: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family='${FONT(rtl)}'>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CARD}"/><stop offset="1" stop-color="${BG}"/></linearGradient>
    <radialGradient id="amb" cx="18%" cy="8%" r="85%"><stop offset="0" stop-color="${GOLD}" stop-opacity="0.16"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_HI}"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#amb)"/>
  <text x="${W / 2}" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="${GOLD}" letter-spacing="8">${esc(classification.toUpperCase())}</text>
  ${body}
  <text x="${W / 2}" y="${H - 28}" text-anchor="middle" font-size="15" fill="${DIM}">Country Intelligence Platform · on-prem AI · all figures cited</text>
</svg>`;
}

/** Gold sweep highlight behind an active line. */
function hiBox(x: number, y: number, w: number, h: number): string {
  return `<rect x="${x - 18}" y="${y}" width="${w}" height="${h}" rx="10" fill="${GOLD}26" stroke="${GOLD}55"/><rect x="${x - 18}" y="${y}" width="6" height="${h}" rx="3" fill="url(#bar)"/>`;
}

/** Line chart with progressive draw (fraction 0..1) and optional forecast tail. */
function vidLine(
  x: number,
  y: number,
  w: number,
  h: number,
  series: { year: number; value: number }[],
  fraction: number,
  forecast?: number,
): string {
  if (series.length < 2) return "";
  const all = forecast ? [...series.map((p) => p.value), forecast] : series.map((p) => p.value);
  const minV = Math.min(...all) * 0.95;
  const maxV = Math.max(...all) * 1.05;
  const lastYear = series[series.length - 1]?.year ?? 0;
  const maxYear = forecast ? lastYear + 1 : lastYear;
  const minYear = series[0]?.year ?? 0;
  const sx = (yr: number) => x + ((yr - minYear) / Math.max(1, maxYear - minYear)) * w;
  const sy = (v: number) => y + h - ((v - minV) / Math.max(1e-9, maxV - minV)) * h;
  const shown = series.slice(0, Math.max(2, Math.ceil(series.length * fraction)));
  const pts = shown.map((p) => `${sx(p.year).toFixed(1)},${sy(p.value).toFixed(1)}`).join(" ");
  const last = shown[shown.length - 1];
  const lastReal = series[series.length - 1];
  const grid = [0.0, 0.5, 1.0]
    .map((f) => {
      const gy = y + h * f;
      return `<line x1="${x}" y1="${gy}" x2="${x + w}" y2="${gy}" stroke="#ffffff14"/>`;
    })
    .join("");
  const area = `M ${pts.split(" ").join(" L ")} L ${sx(last?.year ?? minYear).toFixed(1)} ${y + h} L ${sx(minYear).toFixed(1)} ${y + h} Z`;
  let fc = "";
  if (forecast && fraction >= 1 && lastReal) {
    fc = `<line x1="${sx(lastReal.year).toFixed(1)}" y1="${sy(lastReal.value).toFixed(1)}" x2="${sx(maxYear).toFixed(1)}" y2="${sy(forecast).toFixed(1)}" stroke="${GOLD_HI}" stroke-width="5" stroke-dasharray="14 10"/>
      <circle cx="${sx(maxYear).toFixed(1)}" cy="${sy(forecast).toFixed(1)}" r="11" fill="${GOLD_HI}"/>
      <text x="${(sx(maxYear) - 18).toFixed(1)}" y="${(sy(forecast) - 28).toFixed(1)}" text-anchor="end" font-size="28" font-weight="800" fill="${GOLD_HI}">${esc(humanizeValue(forecast, "USD"))}</text>`;
  }
  const lastLabel =
    fraction >= 1 && lastReal
      ? `<text x="${sx(lastReal.year).toFixed(1)}" y="${(sy(lastReal.value) - 24).toFixed(1)}" text-anchor="middle" font-size="26" font-weight="700" fill="${TXT}">${esc(humanizeValue(lastReal.value, "USD"))}</text>`
      : "";
  const years = `<text x="${x}" y="${y + h + 38}" font-size="20" fill="${DIM}">${minYear}</text><text x="${x + w}" y="${y + h + 38}" text-anchor="end" font-size="20" fill="${DIM}">${maxYear}</text>`;
  return `${grid}<path d="${area}" fill="${GOLD}" opacity="0.16"/><polyline points="${pts}" fill="none" stroke="url(#bar)" stroke-width="6" stroke-linejoin="round"/>${
    last
      ? `<circle cx="${sx(last.year).toFixed(1)}" cy="${sy(last.value).toFixed(1)}" r="9" fill="${GOLD_HI}"/>`
      : ""
  }${lastLabel}${fc}${years}`;
}

/** Year bars with ghost/reveal and a highlighted final bar. */
function vidBars(
  x: number,
  y: number,
  w: number,
  h: number,
  series: { year: number; value: number }[],
  unit: string,
  revealUpTo: number,
  highlightLast: boolean,
): string {
  if (series.length === 0) return "";
  const maxV = Math.max(...series.map((p) => p.value)) || 1;
  const bw = Math.min(140, (w - (series.length - 1) * 36) / series.length);
  const step = bw + 36;
  const x0 = x + (w - (series.length * step - 36)) / 2;
  return series
    .map((p, i) => {
      const bh = Math.max(14, (p.value / maxV) * h);
      const bx = x0 + i * step;
      const by = y + h - bh;
      const ghost = i > revealUpTo;
      const isHi = highlightLast && i === series.length - 1 && !ghost;
      const valueLabel = isHi
        ? `<text x="${bx + bw / 2}" y="${by - 22}" text-anchor="middle" font-size="30" font-weight="800" fill="${GOLD_HI}">${esc(humanizeValue(p.value, unit))}</text>`
        : "";
      return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${isHi ? "url(#bar)" : GOLD}" opacity="${ghost ? 0.12 : isHi ? 1 : 0.5}"/>
      ${isHi ? `<rect x="${bx - 5}" y="${by - 5}" width="${bw + 10}" height="${bh + 10}" rx="13" fill="none" stroke="${GOLD_HI}" stroke-width="3"/>` : ""}
      <text x="${bx + bw / 2}" y="${y + h + 38}" text-anchor="middle" font-size="20" fill="${ghost ? "#3a3a46" : DIM}">${p.year}</text>${valueLabel}`;
    })
    .join("");
}

/** Donut with one slice spotlighted (exports vs imports market share). */
function vidDonut(cx: number, cy: number, r: number, exFrac: number, active: 0 | 1): string {
  const c = 2 * Math.PI * r;
  const seg = (frac: number, rot: number, color: string, on: boolean) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${on ? 52 : 38}" transform="rotate(${rot} ${cx} ${cy})" stroke-dasharray="${(frac * c).toFixed(1)} ${c.toFixed(1)}" opacity="${on ? 1 : 0.35}"/>`;
  return (
    seg(exFrac, -90, GOLD_HI, active === 0) +
    seg(1 - exFrac, -90 + exFrac * 360, "#5b6c8f", active === 1)
  );
}

/** Sector → headline metric for the sector chart scene, with bilingual labels. */
const SECTOR_METRIC: Record<string, { codes: string[]; en: string; ar: string }> = {
  energy: {
    codes: ["electricity_pc", "renew_share"],
    en: "Energy consumption per capita",
    ar: "استهلاك الطاقة للفرد",
  },
  infrastructure: {
    codes: ["internet_users", "mobile"],
    en: "Digital infrastructure — internet users",
    ar: "البنية الرقمية — مستخدمو الإنترنت",
  },
  trade: { codes: ["exports", "fdi"], en: "Exports of goods & services", ar: "الصادرات" },
  sustainability: {
    codes: ["renew_share", "co2"],
    en: "Renewables share of energy",
    ar: "حصة الطاقة المتجددة",
  },
  economy: { codes: ["gdp_growth"], en: "GDP growth", ar: "نمو الناتج المحلي" },
  general: { codes: ["gdp_growth"], en: "GDP growth", ar: "نمو الناتج المحلي" },
};

/** Build all keyframes for the deck video. */
export function deckVideoKeyframes(deck: DeckPayload): Keyframe[] {
  const rtl = deck.locale === "ar";
  const t = (en: string, ar: string) => (rtl ? ar : en);
  const dir = rtl ? ' direction="rtl"' : "";
  const frames: Keyframe[] = [];
  const byCode = new Map(deck.indicators.map((i) => [i.code, i]));
  const stats = [
    byCode.get("gdp") && {
      label: t("Market size (GDP)", "حجم السوق"),
      i: byCode.get("gdp"),
    },
    byCode.get("gdp_growth") && { label: t("GDP growth", "النمو"), i: byCode.get("gdp_growth") },
    byCode.get("electricity_pc") && {
      label: t("Energy use / capita", "استهلاك الطاقة للفرد"),
      i: byCode.get("electricity_pc"),
    },
    byCode.get("renew_share") && {
      label: t("Renewables", "الطاقة المتجددة"),
      i: byCode.get("renew_share"),
    },
  ]
    .filter((x): x is { label: string; i: NonNullable<ReturnType<typeof byCode.get>> } =>
      Boolean(x && x.i),
    )
    .slice(0, 4);

  // ── Scene 1 · Cover: title, then BLUF highlighted ──
  const blufLines = wrap(deck.bluf, rtl ? 52 : 62, 3);
  const coverBase = (withBluf: boolean) =>
    shell(
      `
    <text x="${W / 2}" y="300" text-anchor="middle" font-size="32" fill="${GOLD_HI}" letter-spacing="3"${dir}>${esc(t("EXECUTIVE BRIEF", "إحاطة تنفيذية"))}</text>
    <text x="${W / 2}" y="400" text-anchor="middle" font-size="84" font-weight="800" fill="${TXT}"${dir}>${esc(deck.countryName)}</text>
    <text x="${W / 2}" y="465" text-anchor="middle" font-size="28" fill="${MID}"${dir}>${esc(`${deck.sector ?? ""}${deck.audience ? ` · ${deck.audience}` : ""}`)}</text>
    <rect x="${W / 2 - 220}" y="510" width="440" height="4" rx="2" fill="url(#bar)"/>
    ${
      withBluf
        ? `<rect x="${W / 2 - 700}" y="580" width="1400" height="${70 + blufLines.length * 52}" rx="18" fill="${GOLD}1f" stroke="${GOLD}55"/>
           <text x="${W / 2}" y="650" text-anchor="middle" font-size="38" font-weight="700" fill="${TXT}"${dir}>${blufLines
             .map((l, i) => `<tspan x="${W / 2}" dy="${i === 0 ? 0 : 52}">${esc(l)}</tspan>`)
             .join("")}</text>`
        : ""
    }`,
      rtl,
      deck.classification,
    );
  frames.push({ svg: coverBase(false), durationSec: 2.2 });
  frames.push({ svg: coverBase(true), durationSec: 3.2 });

  // ── Scene 2 · The numbers: each stat highlighted in turn ──
  if (stats.length > 0) {
    const cardW = 380;
    const gap = 40;
    const totalW = stats.length * cardW + (stats.length - 1) * gap;
    const x0 = (W - totalW) / 2;
    const numbersFrame = (active: number) =>
      shell(
        `
      <text x="${W / 2}" y="240" text-anchor="middle" font-size="44" font-weight="800" fill="${TXT}"${dir}>${esc(
        t("The numbers behind the recommendation", "الأرقام خلف التوصية"),
      )}</text>
      ${stats
        .map((st, i) => {
          const x = x0 + i * (cardW + gap);
          const isA = i === active;
          return `
        <rect x="${x}" y="400" width="${cardW}" height="300" rx="20" fill="${CARD}" stroke="${isA ? GOLD_HI : BORDER}" stroke-width="${isA ? 4 : 1.5}" opacity="${isA ? 1 : 0.55}"/>
        ${isA ? `<rect x="${x}" y="400" width="${cardW}" height="8" rx="4" fill="url(#bar)"/>` : ""}
        <text x="${x + cardW / 2}" y="470" text-anchor="middle" font-size="20" fill="${isA ? GOLD_HI : DIM}" letter-spacing="2"${dir}>${esc(st.label.toUpperCase())}</text>
        <text x="${x + cardW / 2}" y="570" text-anchor="middle" font-size="52" font-weight="800" fill="${isA ? TXT : MID}">${esc(humanizeValue(st.i.value, st.i.unit))}</text>
        <text x="${x + cardW / 2}" y="650" text-anchor="middle" font-size="17" fill="${DIM}">${esc(`${st.i.source} · ${st.i.year}`)}</text>`;
        })
        .join("")}`,
        rtl,
        deck.classification,
      );
    for (let i = 0; i < stats.length; i++) frames.push({ svg: numbersFrame(i), durationSec: 1.9 });
  }

  // ── Scene 3 · GDP trajectory + GDP per capita (progressive line draw) ──
  if (deck.gdpSeries.length > 2) {
    const gdpInd = byCode.get("gdp");
    const pop = byCode.get("population");
    const perCapita = gdpInd && pop && pop.value > 0 ? gdpInd.value / pop.value : null;
    const chartTitle = t("GDP trajectory & per capita", "مسار الناتج المحلي ونصيب الفرد");
    const gdpFrame = (fraction: number, withForecast: boolean) =>
      shell(
        `
      <text x="${W / 2}" y="200" text-anchor="middle" font-size="44" font-weight="800" fill="${TXT}"${dir}>${esc(chartTitle)}</text>
      <rect x="120" y="280" width="1250" height="620" rx="22" fill="${CARD}" stroke="${BORDER}"/>
      ${vidLine(200, 340, 1100, 440, deck.gdpSeries, fraction, withForecast ? deck.forecast?.next : undefined)}
      ${
        perCapita
          ? `<rect x="1430" y="380" width="370" height="280" rx="20" fill="${CARD}" stroke="${fraction >= 1 ? GOLD_HI : BORDER}" stroke-width="${fraction >= 1 ? 4 : 1.5}"/>
             ${fraction >= 1 ? `<rect x="1430" y="380" width="370" height="8" rx="4" fill="url(#bar)"/>` : ""}
             <text x="1615" y="450" text-anchor="middle" font-size="20" fill="${fraction >= 1 ? GOLD_HI : DIM}" letter-spacing="2"${dir}>${esc(t("GDP PER CAPITA", "نصيب الفرد"))}</text>
             <text x="1615" y="545" text-anchor="middle" font-size="48" font-weight="800" fill="${fraction >= 1 ? TXT : MID}">${esc(humanizeValue(perCapita, "USD"))}</text>
             <text x="1615" y="615" text-anchor="middle" font-size="17" fill="${DIM}">${esc(`${gdpInd?.source ?? ""} · ${gdpInd?.year ?? ""}`)}</text>`
          : ""
      }`,
        rtl,
        deck.classification,
      );
    frames.push({ svg: gdpFrame(0.55, false), durationSec: 1.8 });
    frames.push({ svg: gdpFrame(1, false), durationSec: 2.0 });
    if (deck.forecast) frames.push({ svg: gdpFrame(1, true), durationSec: 2.2 });
  }

  // ── Scene 4 · Sector chart (energy consumption / infrastructure / …) ──
  const sectorMeta =
    SECTOR_METRIC[(deck.sector ?? "general").toLowerCase()] ?? SECTOR_METRIC.general;
  const sectorInd = sectorMeta?.codes.map((c) => byCode.get(c)).find(Boolean);
  if (sectorInd && sectorMeta) {
    const sLabel =
      sectorMeta.codes[0] === sectorInd.code ? t(sectorMeta.en, sectorMeta.ar) : sectorInd.label;
    const sSeries = seriesFor(deck.iso3, sectorInd.code, sectorInd.value, 6);
    const barFrame = (revealUpTo: number, hiLast: boolean) =>
      shell(
        `
      <text x="${W / 2}" y="200" text-anchor="middle" font-size="44" font-weight="800" fill="${TXT}"${dir}>${esc(sLabel)}</text>
      <text x="${W / 2}" y="252" text-anchor="middle" font-size="22" fill="${DIM}"${dir}>${esc(`${sectorInd.source} · ${sectorInd.year}`)}</text>
      <rect x="260" y="300" width="1400" height="600" rx="22" fill="${CARD}" stroke="${BORDER}"/>
      ${vidBars(340, 370, 1240, 420, sSeries, sectorInd.unit, revealUpTo, hiLast)}`,
        rtl,
        deck.classification,
      );
    frames.push({ svg: barFrame(2, false), durationSec: 1.7 });
    frames.push({ svg: barFrame(5, true), durationSec: 2.3 });
  }

  // ── Scene 5 · Trade market share donut ──
  const trade = deck.trade;
  if (trade && trade.totalUsd > 0) {
    const exFrac = Math.max(0, Math.min(1, trade.exportsUsd / trade.totalUsd));
    const donutFrame = (active: 0 | 1) =>
      shell(
        `
      <text x="${W / 2}" y="200" text-anchor="middle" font-size="44" font-weight="800" fill="${TXT}"${dir}>${esc(
        t("Trade with UAE — market share", "التجارة مع الإمارات — الحصص"),
      )}</text>
      ${vidDonut(700, 600, 200, exFrac, active)}
      <text x="700" y="612" text-anchor="middle" font-size="40" font-weight="800" fill="${TXT}">${esc(humanizeValue(trade.totalUsd, "USD"))}</text>
      <rect x="1080" y="${active === 0 ? 430 : 620}" width="600" height="140" rx="18" fill="${GOLD}1f" stroke="${GOLD}66"/>
      <circle cx="1130" cy="480" r="12" fill="${GOLD_HI}" opacity="${active === 0 ? 1 : 0.35}"/>
      <text x="1165" y="492" font-size="30" font-weight="${active === 0 ? 800 : 500}" fill="${active === 0 ? TXT : MID}"${dir}>${esc(
        `${t("UAE exports", "صادرات الإمارات")} · ${humanizeValue(trade.exportsUsd, "USD")} · ${Math.round(exFrac * 100)}%`,
      )}</text>
      <circle cx="1130" cy="670" r="12" fill="#5b6c8f" opacity="${active === 1 ? 1 : 0.35}"/>
      <text x="1165" y="682" font-size="30" font-weight="${active === 1 ? 800 : 500}" fill="${active === 1 ? TXT : MID}"${dir}>${esc(
        `${t("UAE imports", "واردات الإمارات")} · ${humanizeValue(trade.importsUsd, "USD")} · ${100 - Math.round(exFrac * 100)}%`,
      )}</text>
      <text x="1080" y="800" font-size="20" fill="${DIM}">${esc(`${trade.source} · ${trade.year}`)}</text>`,
        rtl,
        deck.classification,
      );
    frames.push({ svg: donutFrame(0), durationSec: 1.9 });
    frames.push({ svg: donutFrame(1), durationSec: 1.9 });
  }

  // ── Scene 6 · Talking points: progressive reveal + active highlight ──
  const points = deck.talkingPoints.slice(0, 4);
  if (points.length > 0) {
    const pointsFrame = (active: number) =>
      shell(
        `
      <text x="${rtl ? W - 160 : 160}" y="220" text-anchor="${rtl ? "end" : "start"}" font-size="44" font-weight="800" fill="${TXT}"${dir}>${esc(
        t("Talking points — the ask", "نقاط الحديث — المطلب"),
      )}</text>
      <rect x="${rtl ? W - 160 - 240 : 160}" y="248" width="240" height="5" rx="2.5" fill="url(#bar)"/>
      ${points
        .map((tp, i) => {
          if (i > active) return "";
          const isA = i === active;
          const y = 330 + i * 165;
          const lines = wrap(tp, rtl ? 62 : 76, 2);
          const boxH = 50 + lines.length * 44;
          const txX = rtl ? W - 250 : 250;
          const anchor = rtl ? "end" : "start";
          return `
        ${isA ? hiBox(rtl ? 200 : 232, y - 44, W - 432, boxH) : ""}
        <text x="${rtl ? W - 190 : 190}" y="${y}" text-anchor="middle" font-size="34" font-weight="800" fill="${isA ? GOLD_HI : GOLD}" opacity="${isA ? 1 : 0.55}">${i + 1}</text>
        <text x="${txX}" y="${y}" text-anchor="${anchor}" font-size="30" font-weight="${isA ? 700 : 500}" fill="${isA ? TXT : MID}" opacity="${isA ? 1 : 0.55}"${dir}>${lines
          .map((l, li) => `<tspan x="${txX}" dy="${li === 0 ? 0 : 44}">${esc(l)}</tspan>`)
          .join("")}</text>`;
        })
        .join("")}`,
        rtl,
        deck.classification,
      );
    for (let i = 0; i < points.length; i++) frames.push({ svg: pointsFrame(i), durationSec: 2.4 });
  }

  // ── Scene 7 · Opportunities ⇄ risks: column spotlight ──
  const deals = deck.deals.slice(0, 3);
  const risks = deck.risks.slice(0, 3);
  if (deals.length > 0 || risks.length > 0) {
    const colFrame = (activeCol: 0 | 1) =>
      shell(
        `
      <text x="${W / 2}" y="220" text-anchor="middle" font-size="44" font-weight="800" fill="${TXT}"${dir}>${esc(
        t("Opportunities and risks", "الفرص والمخاطر"),
      )}</text>
      ${[
        {
          x: 160,
          color: OK,
          title: t("DEAL PIPELINE", "مسار الصفقات"),
          items: deals.map((d) => `${d.title} — ${Math.round(d.score)}/100`),
          on: activeCol === 0,
        },
        {
          x: W / 2 + 40,
          color: RISK,
          title: t("RISKS", "المخاطر"),
          items: risks.map((r) => r.text),
          on: activeCol === 1,
        },
      ]
        .map(
          (c) => `
        <rect x="${c.x}" y="290" width="${W / 2 - 200}" height="600" rx="22" fill="${CARD}" stroke="${c.on ? c.color : BORDER}" stroke-width="${c.on ? 4 : 1.5}" opacity="${c.on ? 1 : 0.45}"/>
        <rect x="${c.x}" y="290" width="${W / 2 - 200}" height="8" rx="4" fill="${c.color}" opacity="${c.on ? 1 : 0.4}"/>
        <text x="${c.x + 40}" y="370" font-size="24" font-weight="800" fill="${c.color}" letter-spacing="3" opacity="${c.on ? 1 : 0.55}"${dir}>${esc(c.title)}</text>
        ${c.items
          .map((it, i) => {
            const lines = wrap(it, 44, 2);
            const y = 440 + i * 140;
            return `<circle cx="${c.x + 52}" cy="${y - 9}" r="7" fill="${c.color}" opacity="${c.on ? 1 : 0.4}"/>
            <text x="${c.x + 80}" y="${y}" font-size="26" fill="${c.on ? TXT : MID}" opacity="${c.on ? 1 : 0.5}"${dir}>${lines
              .map((l, li) => `<tspan x="${c.x + 80}" dy="${li === 0 ? 0 : 38}">${esc(l)}</tspan>`)
              .join("")}</text>`;
          })
          .join("")}`,
        )
        .join("")}`,
        rtl,
        deck.classification,
      );
    frames.push({ svg: colFrame(0), durationSec: 2.4 });
    frames.push({ svg: colFrame(1), durationSec: 2.4 });
  }

  // ── Scene 8 · Closing: sources + confidence ──
  const sources = [
    ...new Set([
      ...deck.indicators.map((i) => i.source),
      ...(deck.trade ? [deck.trade.source] : []),
    ]),
  ].slice(0, 5);
  frames.push({
    svg: shell(
      `
    <text x="${W / 2}" y="430" text-anchor="middle" font-size="56" font-weight="800" fill="${TXT}"${dir}>${esc(
      t("Every figure is cited", "كل رقم موثّق"),
    )}</text>
    <text x="${W / 2}" y="510" text-anchor="middle" font-size="26" fill="${MID}"${dir}>${esc(sources.join(" · "))}</text>
    <rect x="${W / 2 - 170}" y="580" width="340" height="64" rx="32" fill="${GOLD}22" stroke="${GOLD}66"/>
    <text x="${W / 2}" y="622" text-anchor="middle" font-size="24" font-weight="700" fill="${GOLD_HI}"${dir}>${esc(
      `${t("Confidence", "الثقة")}: ${(deck.confidence ?? "med").toUpperCase()}`,
    )}</text>`,
      rtl,
      deck.classification,
    ),
    durationSec: 2.8,
  });

  return frames;
}

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

export class FfmpegMissingError extends Error {
  constructor() {
    super("ffmpeg not found — install it (e.g. `brew install ffmpeg`) or set FFMPEG_PATH");
    this.name = "FfmpegMissingError";
  }
}

/**
 * Rasterise keyframes and assemble: slow Ken Burns zoom per keyframe,
 * crossfaded into one H.264 MP4.
 */
export async function renderDeckVideoMp4(deck: DeckPayload): Promise<Buffer> {
  const frames = deckVideoKeyframes(deck);
  const dir = mkdtempSync(path.join(tmpdir(), "deckvid-"));
  try {
    // Rasterise (slightly oversized so the zoom never reveals edges).
    const pngs = frames.map((f, i) => {
      const png = new Resvg(f.svg, {
        fitTo: { mode: "width", value: 2112 }, // 110% of 1920
        font: { loadSystemFonts: true },
      })
        .render()
        .asPng();
      const file = path.join(dir, `kf${String(i).padStart(2, "0")}.png`);
      writeFileSync(file, png);
      return { file, dur: f.durationSec };
    });

    // Per-keyframe inputs + Ken Burns zoompan, then chained xfade.
    const inputs: string[] = [];
    const filters: string[] = [];
    pngs.forEach((p, i) => {
      inputs.push(
        "-loop",
        "1",
        "-framerate",
        String(FPS),
        "-t",
        (p.dur + XFADE).toFixed(2),
        "-i",
        p.file,
      );
      // d=1: one output frame per input frame; `zoom` accumulates across frames
      // for a slow Ken Burns drift. (d>1 would multiply every looped frame.)
      filters.push(
        `[${i}:v]zoompan=z='min(zoom+0.0006,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p[v${i}]`,
      );
    });
    let last = "v0";
    let offset = 0;
    for (let i = 1; i < pngs.length; i++) {
      offset += pngs[i - 1]?.dur ?? 0;
      const out = i === pngs.length - 1 ? "vout" : `x${i}`;
      filters.push(
        `[${last}][v${i}]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(2)}[${out}]`,
      );
      last = out;
    }
    const filterGraph = filters.join(";");
    const out = path.join(dir, "out.mp4");
    try {
      await exec(
        ffmpegBin(),
        [
          "-y",
          "-loglevel",
          "error",
          ...inputs,
          "-filter_complex",
          filterGraph,
          "-map",
          `[${pngs.length > 1 ? "vout" : "v0"}]`,
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          "20",
          "-movflags",
          "+faststart",
          out,
        ],
        EXEC_OPTS,
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new FfmpegMissingError();
      throw err;
    }
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
