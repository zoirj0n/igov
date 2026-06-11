/**
 * Shared MOEI brand kit for PPTX exports — palette, layout constants and the
 * primitives (assertion heading, stat box) used by both the briefing deck
 * (services/export.ts) and the experience agent deck (export/agent-deck.ts).
 * Assertion-evidence doctrine: headings are claims, bodies are evidence,
 * sources ride in footers.
 */
import type PptxGenJS from "pptxgenjs";

// MOEI brand (hex without # — pptxgenjs convention)
export const P = {
  bg: "F7F3EB",
  card: "FDFAF4",
  ink: "1F1E1A",
  dim: "615E54",
  faint: "8A8779",
  gold: "92722A",
  goldDeep: "7C5E24",
  line: "E3DDD0",
  ok: "15803D",
  risk: "C81E3C",
  amber: "A16207",
};
export const FONT = "Inter";
export const PAGE_W = 13.33;
export const MARGIN = 0.6;
export const CONTENT_W = PAGE_W - MARGIN * 2;

export function classificationColor(c: string): string {
  return c === "secret" ? P.risk : c === "confidential" ? P.amber : P.gold;
}

/** Kicker bar + assertion heading shared by all content slides. */
export function slideHeading(s: PptxGenJS.Slide, title: string, rtl = false): void {
  s.addShape("rect", {
    x: rtl ? PAGE_W - MARGIN - 0.5 : MARGIN,
    y: 0.62,
    w: 0.5,
    h: 0.07,
    fill: { color: P.gold },
  });
  s.addText(title, {
    x: MARGIN,
    y: 0.78,
    w: CONTENT_W,
    h: 0.55,
    fontSize: 24,
    bold: true,
    color: P.ink,
    fontFace: FONT,
    align: rtl ? "right" : "left",
  });
}

export function statBox(
  s: PptxGenJS.Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  src: string,
  rtl = false,
): void {
  const align = rtl ? "right" : "left";
  s.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: 0.06,
    fill: { color: P.card },
    line: { color: P.line, width: 1 },
  });
  s.addText(label.toUpperCase(), {
    x: x + 0.15,
    y: y + 0.1,
    w: w - 0.3,
    h: 0.3,
    fontSize: 9,
    color: P.dim,
    charSpacing: 1.5,
    fontFace: FONT,
    align,
  });
  s.addText(value, {
    x: x + 0.15,
    y: y + 0.38,
    w: w - 0.3,
    h: 0.5,
    fontSize: 21,
    bold: true,
    color: P.ink,
    fontFace: FONT,
    align,
  });
  s.addText(src, {
    x: x + 0.15,
    y: y + h - 0.32,
    w: w - 0.3,
    h: 0.25,
    fontSize: 8,
    color: P.faint,
    fontFace: FONT,
    align,
  });
}

/** Classification banner + footer master, registered once per document. */
export function defineBaseMaster(
  pptx: PptxGenJS,
  classification: string,
  footerText: string,
): void {
  pptx.defineSlideMaster({
    title: "BASE",
    background: { color: P.bg },
    slideNumber: { x: 12.65, y: 7.1, fontSize: 8, color: P.faint, fontFace: FONT },
    objects: [
      {
        text: {
          text: classification.toUpperCase(),
          options: {
            x: 0,
            y: 0.12,
            w: "100%",
            h: 0.25,
            align: "center",
            fontSize: 8,
            bold: true,
            color: classificationColor(classification),
            charSpacing: 30,
            fontFace: FONT,
          },
        },
      },
      {
        text: {
          text: footerText,
          options: {
            x: MARGIN,
            y: 7.08,
            w: 9,
            h: 0.2,
            fontSize: 8,
            color: P.faint,
            fontFace: FONT,
          },
        },
      },
    ],
  });
}
