import { indicatorsByCountry } from "@/lib/data/indicators";
import { seriesFor } from "@/lib/data/timeseries";
import { humanizeValue } from "@/services/agent/format";
import {
  CONTENT_W,
  FONT,
  MARGIN,
  P,
  PAGE_W,
  defineBaseMaster,
  slideHeading,
  statBox,
} from "@/services/export/pptx-kit";
import type { Briefing } from "@/types";
import type { Country } from "@/types";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import PptxGenJS from "pptxgenjs";
import * as React from "react";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.45, color: "#1f1e1a" },
  classification: {
    position: "absolute",
    top: 16,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    color: "#615e54",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  meta: { fontSize: 9, color: "#615e54", marginBottom: 18 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 6, color: "#1f1e1a" },
  countryRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  countryLabel: { fontSize: 11, color: "#615e54" },
  sectionTitle: {
    fontSize: 10,
    color: "#615e54",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 6,
    borderBottom: "1pt solid #ecebe6",
    paddingBottom: 3,
  },
  body: { fontSize: 11, color: "#1f1e1a", marginBottom: 6 },
  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bullet: { width: 12, color: "#615e54" },
  bulletText: { flex: 1, fontSize: 11, color: "#1f1e1a" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#8a8779",
    borderTop: "1pt solid #ecebe6",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

interface RenderArgs {
  briefing: Briefing;
  country: Country | undefined;
}

function BriefingDocument({ briefing, country }: RenderArgs) {
  const created = new Date(briefing.createdAt).toISOString().slice(0, 10);
  const classification = briefing.classification.toUpperCase();
  return React.createElement(
    Document,
    {
      title: briefing.title,
      author: briefing.createdBy,
      subject: `Country Intelligence briefing · ${briefing.countryIso3}`,
      keywords: `briefing, ${briefing.countryIso3}, ${briefing.audience}, ${briefing.classification}`,
    },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.classification, fixed: true }, classification),
      React.createElement(
        Text,
        { style: styles.meta },
        `${country?.nameEn ?? briefing.countryIso3} · ${briefing.audience} · ${created}`,
      ),
      React.createElement(Text, { style: styles.title }, briefing.title),
      React.createElement(
        View,
        { style: styles.countryRow },
        React.createElement(
          Text,
          { style: styles.countryLabel },
          `Country: ${country?.nameEn ?? briefing.countryIso3} (${briefing.countryIso3}) · Region: ${country?.region ?? "—"}`,
        ),
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "Strategic overview"),
      React.createElement(Text, { style: styles.body }, briefing.body),

      briefing.talkingPoints && briefing.talkingPoints.length > 0
        ? React.createElement(
            View,
            {},
            React.createElement(Text, { style: styles.sectionTitle }, "Talking points"),
            ...briefing.talkingPoints.map((tp, i) =>
              React.createElement(
                View,
                { key: `tp-${i}`, style: styles.bulletRow },
                React.createElement(Text, { style: styles.bullet }, "•"),
                React.createElement(Text, { style: styles.bulletText }, tp),
              ),
            ),
          )
        : null,

      briefing.risks && briefing.risks.length > 0
        ? React.createElement(
            View,
            {},
            React.createElement(Text, { style: styles.sectionTitle }, "Risks & sensitivities"),
            ...briefing.risks.map((r, i) =>
              React.createElement(
                View,
                { key: `r-${i}`, style: styles.bulletRow },
                React.createElement(Text, { style: styles.bullet }, "•"),
                React.createElement(Text, { style: styles.bulletText }, r),
              ),
            ),
          )
        : null,

      briefing.opportunities && briefing.opportunities.length > 0
        ? React.createElement(
            View,
            {},
            React.createElement(Text, { style: styles.sectionTitle }, "Cooperation opportunities"),
            ...briefing.opportunities.map((o, i) =>
              React.createElement(
                View,
                { key: `o-${i}`, style: styles.bulletRow },
                React.createElement(Text, { style: styles.bullet }, "•"),
                React.createElement(Text, { style: styles.bulletText }, o),
              ),
            ),
          )
        : null,

      React.createElement(Text, { style: styles.sectionTitle }, "Sources & confidence"),
      React.createElement(
        Text,
        { style: styles.body },
        `Sources: ${(briefing.citations ?? []).join(" · ") || "—"}\nConfidence: ${briefing.confidence ?? "med"}`,
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, {}, `Country Intelligence Platform · ${briefing.createdBy}`),
        React.createElement(Text, {
          render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`,
        }),
      ),
    ),
  );
}

export async function renderBriefingPdf(
  briefing: Briefing,
  country: Country | undefined,
): Promise<Buffer> {
  const doc = BriefingDocument({ briefing, country });
  return renderToBuffer(doc);
}

/* ── PPTX export ─────────────────────────────────────────────────────────────
 * Executive deck structured on assertion-evidence principles (cover states the
 * recommendation; every content slide pairs a claim with grounded evidence;
 * sources ride in the footer). MOEI gold/cream brand, native editable charts.
 */

const PPTX_LABELS = {
  en: {
    talkingPoints: "Talking points",
    risks: "Risks & sensitivities",
    opportunities: "Cooperation opportunities",
    sources: "Sources & confidence",
    sourcesLabel: "Sources: ",
    confidenceLabel: "Confidence: ",
    confidence: { high: "high", med: "med", low: "low" } as Record<string, string>,
  },
  ar: {
    talkingPoints: "نقاط الحديث",
    risks: "المخاطر والحساسيات",
    opportunities: "فرص التعاون",
    sources: "المصادر والثقة",
    sourcesLabel: "المصادر: ",
    confidenceLabel: "الثقة: ",
    confidence: { high: "عالية", med: "متوسطة", low: "منخفضة" } as Record<string, string>,
  },
};

export type PptxLang = keyof typeof PPTX_LABELS;

export async function renderBriefingPptx(
  briefing: Briefing,
  country: Country | undefined,
  lang: PptxLang = "en",
): Promise<Buffer> {
  const L = PPTX_LABELS[lang];
  const rtl = lang === "ar";
  // PowerPoint substitutes an Arabic-capable font automatically when none is
  // forced, so only pin the Latin face for English decks.
  const heading = rtl ? { align: "right" as const, rtlMode: true } : { fontFace: "Inter" as const };
  const para = rtl ? { align: "right" as const, rtlMode: true } : { fontFace: "Inter" as const };
  const pptx = new PptxGenJS();
  if (rtl) pptx.rtlMode = true;
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = briefing.createdBy;
  pptx.title = briefing.title;

  const created = new Date(briefing.createdAt).toISOString().slice(0, 10);
  const countryName = country?.nameEn ?? briefing.countryIso3;

  const indicators = indicatorsByCountry(briefing.countryIso3);
  const byMetric = new Map(indicators.map((i) => [i.metric, i]));
  const gdp = byMetric.get("gdp_usd_nominal");
  const growth = byMetric.get("gdp_growth_pct");
  const population = byMetric.get("population");
  const renewables = byMetric.get("renewables_share_pct");
  const exportsUsd = byMetric.get("exports_usd");
  const fdi = byMetric.get("fdi_inflows_usd");

  defineBaseMaster(
    pptx,
    briefing.classification,
    `Country Intelligence Platform · ${briefing.createdBy} · ${created}`,
  );

  // ── 1 · Cover — the recommendation up front ──
  const cover = pptx.addSlide({ masterName: "BASE" });
  cover.addShape("rect", { x: 0, y: 0.46, w: PAGE_W, h: 0.025, fill: { color: P.gold } });
  cover.addShape("rect", { x: MARGIN, y: 1.55, w: 0.1, h: 2.5, fill: { color: P.gold } });
  if (country?.flagEmoji)
    cover.addText(country.flagEmoji, { x: 11.1, y: 0.85, w: 1.6, h: 1.2, fontSize: 60 });
  cover.addText(`${countryName} (${briefing.countryIso3}) · ${country?.region ?? "—"}`, {
    x: 0.92,
    y: 1.55,
    w: 10,
    h: 0.4,
    fontSize: 14,
    color: P.goldDeep,
    bold: true,
    charSpacing: 2,
    fontFace: FONT,
  });
  cover.addText(briefing.title, {
    x: 0.92,
    y: 2.0,
    w: 10.1,
    h: 1.7,
    fontSize: 33,
    bold: true,
    color: P.ink,
    fontFace: FONT,
    valign: "top",
  });
  cover.addText(
    `Prepared for ${briefing.audience} · ${created} · Confidence: ${(briefing.confidence ?? "med").toUpperCase()}`,
    { x: 0.92, y: 3.78, w: 10, h: 0.4, fontSize: 13, color: P.dim, fontFace: FONT },
  );
  // quick-stat strip anchors the cover in evidence
  const coverStats = [gdp, growth, population].filter((i): i is NonNullable<typeof i> =>
    Boolean(i),
  );
  coverStats.forEach((i, idx) => {
    statBox(
      cover,
      MARGIN + idx * 4.13,
      5.1,
      3.93,
      1.35,
      i.metric === "gdp_usd_nominal" ? "Market size (GDP)" : i.metric.replace(/_/g, " "),
      humanizeValue(i.value, i.unit),
      `${i.source} · ${i.year}`,
    );
  });

  // ── 2 · Executive summary — claim left, evidence rail right ──
  const exec = pptx.addSlide({ masterName: "BASE" });
  slideHeading(exec, "Executive summary");
  exec.addText(briefing.body, {
    x: MARGIN,
    y: 1.55,
    w: 7.6,
    h: 4.6,
    fontSize: 15,
    color: P.ink,
    fontFace: FONT,
    lineSpacingMultiple: 1.25,
    valign: "top",
  });
  const railStats = [
    renewables && {
      label: "Renewables share",
      value: humanizeValue(renewables.value, renewables.unit),
      src: `${renewables.source} · ${renewables.year}`,
    },
    exportsUsd && {
      label: "Exports",
      value: humanizeValue(exportsUsd.value, exportsUsd.unit),
      src: `${exportsUsd.source} · ${exportsUsd.year}`,
    },
    fdi && {
      label: "FDI inflows",
      value: humanizeValue(fdi.value, fdi.unit),
      src: `${fdi.source} · ${fdi.year}`,
    },
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));
  railStats.forEach((st, idx) => {
    statBox(exec, 8.5, 1.55 + idx * 1.6, 4.23, 1.4, st.label, st.value, st.src);
  });

  // ── 3 · By the numbers — native, editable charts ──
  if (gdp) {
    const nums = pptx.addSlide({ masterName: "BASE" });
    slideHeading(nums, "The numbers behind the recommendation");
    const series = seriesFor(briefing.countryIso3, "gdp_usd_nominal", gdp.value, 6);
    nums.addChart(
      pptx.ChartType.line,
      [
        {
          name: "GDP (US$)",
          labels: series.map((p) => String(p.year)),
          values: series.map((p) => Math.round(p.value / 1e9)),
        },
      ],
      {
        x: MARGIN,
        y: 1.6,
        w: 7.4,
        h: 4.5,
        chartColors: [P.gold],
        lineSize: 3,
        lineSmooth: true,
        lineDataSymbol: "circle",
        lineDataSymbolSize: 7,
        showTitle: true,
        title: `GDP trend — US$ billions (${gdp.source})`,
        titleFontSize: 12,
        titleColor: P.dim,
        catAxisLabelColor: P.dim,
        valAxisLabelColor: P.dim,
        catAxisLabelFontSize: 10,
        valAxisLabelFontSize: 10,
        valGridLine: { color: P.line, style: "solid", size: 1 },
        plotArea: { fill: { color: P.card } },
        chartArea: { fill: { color: P.bg } },
      },
    );
    if (renewables) {
      nums.addChart(
        pptx.ChartType.doughnut,
        [
          {
            name: "Energy mix",
            labels: ["Renewables", "Other sources"],
            values: [
              Math.round(renewables.value * 10) / 10,
              Math.round((100 - renewables.value) * 10) / 10,
            ],
          },
        ],
        {
          x: 8.35,
          y: 1.6,
          w: 4.35,
          h: 2.35,
          chartColors: [P.ok, P.line],
          holeSize: 62,
          showTitle: true,
          title: "Renewables share of energy",
          titleFontSize: 11,
          titleColor: P.dim,
          showLegend: true,
          legendPos: "b",
          legendFontSize: 9,
          dataLabelColor: P.ink,
          showValue: false,
        },
      );
    }
    if (exportsUsd || fdi) {
      const bars = [
        exportsUsd && { l: "Exports", v: exportsUsd },
        fdi && { l: "FDI", v: fdi },
      ].filter((b): b is NonNullable<typeof b> => Boolean(b));
      nums.addChart(
        pptx.ChartType.bar,
        [
          {
            name: "US$ billions",
            labels: bars.map((b) => b.l),
            values: bars.map((b) => Math.round(b.v.value / 1e9)),
          },
        ],
        {
          x: 8.35,
          y: 4.15,
          w: 4.35,
          h: 2.0,
          barDir: "bar",
          chartColors: [P.gold],
          showTitle: true,
          title: "External position — US$ billions",
          titleFontSize: 11,
          titleColor: P.dim,
          catAxisLabelColor: P.dim,
          valAxisLabelColor: P.dim,
          catAxisLabelFontSize: 10,
          valAxisLabelFontSize: 9,
          valGridLine: { color: P.line, style: "solid", size: 1 },
          showLegend: false,
        },
      );
    }
  }

  // ── 4 · Talking points — the ask, numbered ──
  if (briefing.talkingPoints && briefing.talkingPoints.length > 0) {
    const s = pptx.addSlide({ masterName: "BASE" });
    slideHeading(s, lang === "ar" ? L.talkingPoints : "Talking points — the ask");
    s.addText(
      briefing.talkingPoints.slice(0, 5).map((t) => ({
        text: t,
        options: {
          bullet: { type: "number", color: P.gold, style: "arabicPeriod" },
          // item arrays ignore body-level rtlMode — must be per item
          ...(rtl ? { rtlMode: true, align: "right" as const } : {}),
        },
      })),
      {
        x: MARGIN,
        y: 1.6,
        w: CONTENT_W,
        h: 4.9,
        fontSize: 17,
        color: P.ink,
        fontFace: FONT,
        paraSpaceAfter: 14,
        lineSpacingMultiple: 1.15,
        valign: "top",
        ...(rtl ? { rtlMode: true, align: "right" as const } : {}),
      },
    );
  }

  // ── 5 · Risks ⇄ Opportunities — split comparison ──
  const risks = (briefing.risks ?? []).slice(0, 4);
  const opps = (briefing.opportunities ?? []).slice(0, 4);
  if (risks.length > 0 || opps.length > 0) {
    const s = pptx.addSlide({ masterName: "BASE" });
    slideHeading(
      s,
      lang === "ar"
        ? `${L.opportunities} · ${L.risks}`
        : "Opportunities outweigh the risks — if managed",
    );
    const col = (x: number, header: string, color: string, items: string[]): void => {
      s.addShape("roundRect", {
        x,
        y: 1.6,
        w: 5.96,
        h: 4.9,
        rectRadius: 0.08,
        fill: { color: P.card },
        line: { color: P.line, width: 1 },
      });
      s.addShape("rect", { x, y: 1.6, w: 5.96, h: 0.06, fill: { color } });
      s.addText(header.toUpperCase(), {
        x: x + 0.25,
        y: 1.8,
        w: 5.4,
        h: 0.35,
        fontSize: 12,
        bold: true,
        color,
        charSpacing: 1.5,
        fontFace: FONT,
      });
      s.addText(
        items.map((t) => ({ text: t, options: { bullet: { code: "25CF", color } } })),
        {
          x: x + 0.25,
          y: 2.3,
          w: 5.45,
          h: 4.0,
          fontSize: 13.5,
          color: P.ink,
          fontFace: FONT,
          paraSpaceAfter: 10,
          valign: "top",
        },
      );
    };
    if (opps.length > 0) col(MARGIN, L.opportunities, P.ok, opps);
    if (risks.length > 0) col(opps.length > 0 ? MARGIN + 6.17 : MARGIN, L.risks, P.risk, risks);
  }

  // ── 6 · Sources & confidence — every figure traceable ──
  const last = pptx.addSlide({ masterName: "BASE" });
  slideHeading(last, lang === "ar" ? L.sources : "Every figure is cited");
  const citations = (briefing.citations ?? []).slice(0, 10);
  last.addText(
    (citations.length > 0 ? citations : ["—"]).map((t) => ({
      text: t,
      options: { bullet: { code: "25CF", color: P.gold } },
    })),
    {
      x: MARGIN,
      y: 1.6,
      w: 7.6,
      h: 4.6,
      fontSize: 13,
      color: P.ink,
      fontFace: FONT,
      paraSpaceAfter: 8,
      valign: "top",
    },
  );
  statBox(
    last,
    8.5,
    1.6,
    4.23,
    1.4,
    "Analytic confidence",
    (briefing.confidence ?? "med").toUpperCase(),
    "ICD-203 confidence levels",
  );
  last.addText(
    "Generated by the Country Intelligence Platform — classification-gated AI, full audit trail, figures validated against source data.",
    { x: 8.5, y: 3.2, w: 4.23, h: 1.2, fontSize: 10, color: P.dim, fontFace: FONT, italic: true },
  );

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return out;
}
