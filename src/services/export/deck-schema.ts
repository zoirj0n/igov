/**
 * Zod schema for the structured deck payload the experience client sends to
 * the export routes (PPTX slides, MP4 video). Mirrors AgentDeckPayload in
 * export/agent-deck.ts — one schema, both exports.
 */
import { z } from "zod";

export const DeckSchema = z.object({
  locale: z.enum(["en", "ar"]).optional(),
  classification: z.string().max(20),
  countryName: z.string().max(120),
  iso3: z.string().max(3),
  sector: z.string().max(60).optional(),
  audience: z.string().max(120).optional(),
  title: z.string().max(240),
  bluf: z.string().max(600),
  whyNow: z.string().max(400).optional(),
  heroMetric: z
    .object({
      label: z.string().max(120),
      value: z.string().max(60),
      delta: z.string().max(60).optional(),
    })
    .optional(),
  confidence: z.string().max(10).optional(),
  talkingPoints: z.array(z.string().max(400)).max(8),
  deals: z
    .array(
      z.object({
        title: z.string().max(200),
        score: z.number().min(0).max(100),
        horizon: z.string().max(20).optional(),
      }),
    )
    .max(6),
  risks: z
    .array(z.object({ text: z.string().max(300), likelihood: z.string().max(30).optional() }))
    .max(6),
  scenarios: z
    .array(
      z.object({
        name: z.string().max(120),
        outlook: z.string().max(300),
        likelihood: z.string().max(30).optional(),
      }),
    )
    .max(4),
  watchlist: z.array(z.string().max(200)).max(8),
  indicators: z
    .array(
      z.object({
        code: z.string().max(40),
        label: z.string().max(120),
        value: z.number(),
        unit: z.string().max(20),
        year: z.number(),
        source: z.string().max(80),
      }),
    )
    .max(20),
  gdpSeries: z.array(z.object({ year: z.number(), value: z.number() })).max(30),
  forecast: z.object({ next: z.number(), lower: z.number(), upper: z.number() }).optional(),
  trade: z
    .object({
      totalUsd: z.number(),
      exportsUsd: z.number(),
      importsUsd: z.number(),
      source: z.string().max(80),
      year: z.number(),
    })
    .optional(),
});

export type DeckPayload = z.infer<typeof DeckSchema>;
