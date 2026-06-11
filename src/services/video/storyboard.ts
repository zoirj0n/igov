import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import * as React from "react";
import type { VideoVariant } from "./script";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1f1e1a" },
  classification: {
    position: "absolute",
    top: 14,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 8,
    color: "#615e54",
    letterSpacing: 2,
  },
  cover: { paddingTop: 200, textAlign: "center" },
  coverTitle: { fontSize: 28, fontWeight: 700, marginBottom: 8 },
  coverMeta: { fontSize: 12, color: "#615e54" },
  coverHook: { marginTop: 24, fontSize: 14, fontStyle: "italic", color: "#1f1e1a", padding: 16 },
  sceneHeader: {
    fontSize: 9,
    color: "#615e54",
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sceneTime: { fontSize: 18, fontWeight: 700, marginBottom: 12 },
  visualBox: {
    backgroundColor: "#ecebe6",
    border: "1pt solid #d6d4cc",
    padding: 16,
    minHeight: 180,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  visualText: { fontSize: 11, color: "#615e54", textAlign: "center", lineHeight: 1.4 },
  overlayBox: { backgroundColor: "#1f1e1a", padding: 8, marginBottom: 12, alignSelf: "flex-start" },
  overlayText: { color: "#ffffff", fontSize: 13, fontWeight: 700 },
  narrationLabel: {
    fontSize: 8,
    color: "#615e54",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  narrationText: { fontSize: 11, lineHeight: 1.45, marginBottom: 10 },
  source: { fontSize: 8, color: "#8a8779", marginTop: 8 },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#8a8779",
    borderTop: "1pt solid #ecebe6",
    paddingTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

export async function renderStoryboardPdf(
  variant: VideoVariant,
  meta: { prompt: string; durationSeconds: number; countries: string[] },
): Promise<Buffer> {
  const cls = (variant.classification ?? "internal").toUpperCase();
  const totalScenes = variant.scenes.length;
  const doc = React.createElement(
    Document,
    {
      title: variant.title,
      subject: `Video storyboard · ${variant.style}`,
      keywords: `storyboard, ${variant.style}, ${meta.countries.join(",")}`,
    },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.classification, fixed: true }, cls),
      React.createElement(
        View,
        { style: styles.cover },
        React.createElement(Text, { style: styles.coverTitle }, variant.title),
        React.createElement(
          Text,
          { style: styles.coverMeta },
          `${variant.style.toUpperCase()} · ${meta.durationSeconds}s · ${meta.countries.join(" × ")}`,
        ),
        React.createElement(
          Text,
          { style: styles.coverMeta },
          `${totalScenes} scenes · confidence ${variant.confidence}`,
        ),
        React.createElement(Text, { style: styles.coverHook }, `"${variant.hook}"`),
      ),
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, {}, "Country Intelligence Platform · Storyboard"),
        React.createElement(Text, {
          render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`,
        }),
      ),
    ),
    ...variant.scenes.map((s, i) =>
      React.createElement(
        Page,
        { key: `scene-${i}`, size: "A4", style: styles.page },
        React.createElement(Text, { style: styles.classification, fixed: true }, cls),
        React.createElement(
          Text,
          { style: styles.sceneHeader },
          `Scene ${i + 1} of ${totalScenes} · ${variant.style}`,
        ),
        React.createElement(
          Text,
          { style: styles.sceneTime },
          `${fmt(s.startSec)} – ${fmt(s.endSec)}`,
        ),
        React.createElement(
          View,
          { style: styles.visualBox },
          React.createElement(Text, { style: styles.visualText }, `VISUAL\n\n${s.visual}`),
        ),
        s.onScreenText
          ? React.createElement(
              View,
              { style: styles.overlayBox },
              React.createElement(Text, { style: styles.overlayText }, s.onScreenText),
            )
          : null,
        React.createElement(Text, { style: styles.narrationLabel }, "Narration"),
        React.createElement(Text, { style: styles.narrationText }, s.narration),
        s.source
          ? React.createElement(Text, { style: styles.source }, `Source: ${s.source}`)
          : null,
        React.createElement(
          View,
          { style: styles.footer, fixed: true },
          React.createElement(Text, {}, `${variant.title} · scene ${i + 1}/${totalScenes}`),
          React.createElement(Text, {
            render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`,
          }),
        ),
      ),
    ),
  );
  return renderToBuffer(doc);
}

function fmt(sec: number): string {
  const mm = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${mm}:${ss}`;
}
