/**
 * Map a Briefing into AntV Infographic DSL for the in-app interactive "Visualize"
 * view. Pure (no DOM) so it's testable; the component feeds the result to the
 * client-side AntV renderer. Text is already locale-correct (the caller passes
 * the EN or AR briefing); only the scaffolding labels are localized here.
 */
import type { Briefing } from "@/services/agent/state";

export type AntVTemplate = "swot" | "pipeline" | "watchlist";

export const ANTV_TEMPLATES: { id: AntVTemplate; label: { en: string; ar: string } }[] = [
  { id: "swot", label: { en: "SWOT", ar: "سوات" } },
  { id: "pipeline", label: { en: "Deal pipeline", ar: "مسار الصفقات" } },
  { id: "watchlist", label: { en: "What to watch", ar: "المراقبة" } },
];

const L = {
  en: {
    swot: "UAE ↔ Partner — Cooperation SWOT",
    pipeline: "Deal pipeline — opportunity score",
    watch: "What to watch",
    s: "Strengths",
    w: "Weaknesses",
    o: "Opportunities",
    t: "Threats",
    none: "—",
  },
  ar: {
    swot: "تحليل سوات للتعاون",
    pipeline: "مسار الصفقات — درجة الفرصة",
    watch: "ما يجب مراقبته",
    s: "عوامل القوة",
    w: "عوامل الضعف",
    o: "الفرص",
    t: "التهديدات",
    none: "—",
  },
};

const clean = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
const orNone = (arr: string[], none: string) => (arr.length ? arr : [none]);
// Short axis label for the bar chart so long deal titles don't wrap and collide.
const shortLabel = (title: string) => {
  const head = clean(title.split(/\s+&\s+/)[0] ?? title);
  return head.length > 26 ? `${head.slice(0, 24)}…` : head;
};

const PALETTE = ["#92722a", "#d7bc6d", "#c0c171", "#e41d3d"];
const themeBlock = () => `theme dark\n  palette\n${PALETTE.map((c) => `    - ${c}`).join("\n")}`;

export function antvSyntax(b: Briefing, locale: "en" | "ar", tmpl: AntVTemplate): string {
  const t = L[locale];

  if (tmpl === "pipeline") {
    const items =
      b.deals
        .map((d) => {
          const desc = d.evidence ? `\n      desc ${clean(d.evidence)}` : "";
          return `    - label ${shortLabel(d.title)}\n      value ${Math.round(d.score)}${desc}`;
        })
        .join("\n") || `    - label ${t.none}\n      value 0`;
    return `infographic chart-bar-plain-text\ndata\n  title ${t.pipeline}\n  items\n${items}\n${themeBlock()}`;
  }

  if (tmpl === "watchlist") {
    // Ribbon cards — no icons (CSP blocks the icon CDN), title clear of the items.
    const items = orNone(b.watchlist.map(clean), t.none)
      .map((wl) => `    - label ${wl}`)
      .join("\n");
    return `infographic list-grid-ribbon-card\ndata\n  title ${t.watch}\n  items\n${items}\n${themeBlock()}`;
  }

  // SWOT — Strengths(offers) · Weaknesses(red lines) · Opportunities(deals) · Threats(risks)
  const quad = (label: string, arr: string[]) => {
    const kids = orNone(arr.slice(0, 3).map(clean), t.none)
      .map((v) => `        - label ${v}`)
      .join("\n");
    return `    - label ${label}\n      children\n${kids}`;
  };
  const strengths = b.position.offers.length ? b.position.offers : b.deals.map((d) => d.title);
  const items = [
    quad(t.s, strengths),
    quad(t.w, b.position.redLines),
    quad(
      t.o,
      b.deals.map((d) => d.title),
    ),
    quad(
      t.t,
      b.risks.map((r) => r.text),
    ),
  ].join("\n");
  return `infographic compare-swot\ndata\n  title ${t.swot}\n  items\n${items}\n${themeBlock()}`;
}
