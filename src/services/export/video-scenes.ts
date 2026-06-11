/**
 * Scene frames + narration for the AI video brief, derived from agent state.
 * Pure SVG strings (rasterised to PNG by the route) + plain-text narration
 * (spoken on-prem by macOS `say`). Dark cinematic theme, decision-first.
 */
import { COUNTRIES } from "@/lib/data/countries";
import { iso3Name } from "@/lib/data/iso-countries";
import type { AgentState } from "@/services/agent/state";
import { countryOnePagerSvg } from "@/services/export/infographic";

const BG = "#0b0b12";
const CARD = "#15161f";
const TEAL = "#92722a";
const CYAN = "#d7bc6d";
const TXT = "#f4f5f7";
const MID = "#a9abb6";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function titleCard(name: string, sector: string, cls: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" font-family="Inter, system-ui, sans-serif">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CARD}"/><stop offset="1" stop-color="${BG}"/></linearGradient>
      <radialGradient id="amb" cx="20%" cy="10%" r="80%"><stop offset="0" stop-color="${TEAL}" stop-opacity="0.18"/><stop offset="1" stop-color="${TEAL}" stop-opacity="0"/></radialGradient>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="${CYAN}"/></linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#g)"/>
    <rect width="1280" height="720" fill="url(#amb)"/>
    <text x="640" y="295" text-anchor="middle" font-size="30" fill="${CYAN}" letter-spacing="2">EXECUTIVE BRIEF</text>
    <text x="640" y="385" text-anchor="middle" font-size="76" font-weight="800" fill="${TXT}">${esc(name)}</text>
    <text x="640" y="445" text-anchor="middle" font-size="26" fill="${MID}">${esc(sector)} · prepared for UAE leadership</text>
    <rect x="560" y="505" width="160" height="42" rx="21" fill="${TEAL}22" stroke="${TEAL}66"/>
    <text x="640" y="532" text-anchor="middle" font-size="16" font-weight="700" fill="${TEAL}">${esc(cls)}</text>
    <rect x="440" y="600" width="400" height="3" rx="1.5" fill="url(#bar)"/>
  </svg>`;
}

function closingCard(name: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" font-family="Inter, system-ui, sans-serif">
    <defs><linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${TEAL}"/><stop offset="1" stop-color="${CYAN}"/></linearGradient></defs>
    <rect width="1280" height="720" fill="${BG}"/>
    <rect x="0" y="0" width="1280" height="6" fill="url(#bar)"/>
    <text x="640" y="320" text-anchor="middle" font-size="46" font-weight="800" fill="${TXT}">Leadership ready.</text>
    <text x="640" y="380" text-anchor="middle" font-size="22" fill="${MID}">UAE × ${esc(name)} · generated on-prem by the Strategic Advisor</text>
    <text x="640" y="690" text-anchor="middle" font-size="13" fill="${MID}">All figures cited · on-prem AI · UAE Design System</text>
  </svg>`;
}

export interface VideoSceneSpec {
  svg: string;
  narration: string;
}

export function videoSceneSvgs(state: AgentState): VideoSceneSpec[] {
  const iso3 = state.scope?.iso3 ?? "";
  const name = COUNTRIES.find((c) => c.iso3 === iso3)?.nameEn ?? iso3Name(iso3) ?? iso3;
  const sectorRaw = state.scope?.sector ?? "general";
  const sector = sectorRaw.charAt(0).toUpperCase() + sectorRaw.slice(1);
  const cls = (state.classification ?? "internal").toUpperCase();
  const b = state.briefing;
  const hero = b?.heroMetric;
  const bluf = b?.bluf || b?.overview || `Strategic overview of ${name}.`;
  const ask = b?.talkingPoints?.[b.talkingPoints.length - 1] ?? "";
  const deals = (b?.deals ?? []).slice(0, 3);

  return [
    {
      svg: titleCard(name, sector, cls),
      narration: `Executive brief on ${name}, prepared for United Arab Emirates leadership ahead of a ministerial meeting.`,
    },
    {
      svg: countryOnePagerSvg(state),
      narration: `Bottom line. ${bluf}${hero ? ` ${hero.label} is ${hero.value}.` : ""}`,
    },
    {
      svg: closingCard(name),
      narration: `${
        deals.length
          ? `Priority deals: ${deals.map((d) => d.title).join("; ")}.`
          : "Opportunities under assessment."
      }${ask ? ` The ask: ${ask}` : ""} Generated on premise. Decision ready in seconds.`,
    },
  ];
}
