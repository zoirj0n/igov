import type { ManifestSource } from "@/lib/sources/manifest";
import { completeText, getProvider } from "@/services/llm";

export type RunnerKey = "worldbank" | "imf" | "ember" | "oecd" | "csv" | "ai-extract";

export interface Classification {
  runner: RunnerKey | null;
  reason: string;
  confidence: "high" | "med" | "low";
  usedRealApi: boolean;
}

const HEURISTIC: { test: RegExp; runner: RunnerKey; why: string }[] = [
  {
    test: /api\.worldbank\.org|world bank|data\.worldbank\.org|databank\.worldbank\.org|world development indicators|wdi/i,
    runner: "worldbank",
    why: "URL/title matches World Bank/WDI",
  },
  { test: /imf\.org|datamapper|sdmx-json/i, runner: "imf", why: "URL matches IMF Datamapper" },
  {
    test: /ember-energy|ember-climate|yearly_electricity_data|monthly_electricity_data/i,
    runner: "ember",
    why: "URL matches Ember dataset",
  },
  { test: /oecd\.org|sdmx\.oecd|stats\.oecd/i, runner: "oecd", why: "URL matches OECD SDMX" },
];

export interface ClassifySourceOpts {
  actor?: string;
  actorDept?: string;
  reqId?: string;
}

export async function classifySource(
  source: ManifestSource,
  category: string,
  preview: string,
  opts: ClassifySourceOpts = {},
): Promise<Classification> {
  for (const h of HEURISTIC) {
    if (h.test.test(source.url) || h.test.test(source.name) || h.test.test(source.coverage)) {
      return { runner: h.runner, reason: h.why, confidence: "high", usedRealApi: false };
    }
  }

  if (source.url.startsWith("local://") && /\.csv$/i.test(source.url)) {
    const head = (preview.split(/\r?\n/, 1)[0] ?? "").toLowerCase();
    const hasCountry = /(\b|^)(country|iso|iso3|country_code|nation)(\b|,|$)/.test(head);
    const hasYear = /(\b|^)(year|date|period)(\b|,|$)/.test(head);
    const hasValue = /(\b|^)(value|val|obs_value|amount)(\b|,|$)/.test(head);
    const hasMetric = /(\b|^)(indicator|metric|series|variable)(\b|,|$)/.test(head);
    if (hasCountry && hasYear && hasValue && hasMetric) {
      return {
        runner: "csv",
        reason: "local CSV header has country/indicator/year/value",
        confidence: "high",
        usedRealApi: false,
      };
    }
  }

  if (source.url.startsWith("local://") && /\.txt$/i.test(source.url)) {
    return {
      runner: "ai-extract",
      reason: "local text dump (extracted from PDF/DOCX) — try AI extraction",
      confidence: "med",
      usedRealApi: false,
    };
  }

  const provider = getProvider();
  if (!provider.available()) {
    return {
      runner: null,
      reason: `no heuristic match; LLM provider (${provider.name}) unavailable — ${provider.unavailableReason()}`,
      confidence: "low",
      usedRealApi: false,
    };
  }

  try {
    const previewClean = preview.slice(0, 4000).replace(/\s+/g, " ");
    const result = await completeText({
      maxTokens: 256,
      classification: "internal",
      step: "classifier",
      actor: opts.actor,
      actorDept: opts.actorDept,
      reqId: opts.reqId,
      system: `You classify a data source as one of four ingest runners or "none".

Runners:
- worldbank: World Bank Open Data + WDI (REST JSON, country indicators)
- imf: IMF Datamapper (forecasts, growth, inflation, fiscal)
- ember: Ember Electricity (CSV, electricity mix shares)
- oecd: OECD SDMX (developed-economy indicators)
- none: paywalled, qualitative reports, PDFs, unstructured news — cannot auto-ingest

Reply STRICT JSON only:
{"runner":"worldbank"|"imf"|"ember"|"oecd"|"none","reason":"<≤20 words>","confidence":"high"|"med"|"low"}`,
      messages: [
        {
          role: "user",
          content: `Source: ${source.name}
Category: ${category}
URL: ${source.url}
Coverage: ${source.coverage}
Best use: ${source.bestUse}
Payload preview: ${previewClean}`,
        },
      ],
    });
    const text = result.text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return { runner: null, reason: "AI returned non-JSON", confidence: "low", usedRealApi: true };
    }
    const parsed = JSON.parse(m[0]) as {
      runner?: string;
      reason?: string;
      confidence?: "high" | "med" | "low";
    };
    const runner: RunnerKey | null =
      parsed.runner === "worldbank" ||
      parsed.runner === "imf" ||
      parsed.runner === "ember" ||
      parsed.runner === "oecd" ||
      parsed.runner === "csv" ||
      parsed.runner === "ai-extract"
        ? parsed.runner
        : null;
    return {
      runner,
      reason: parsed.reason ?? "AI classification",
      confidence: parsed.confidence ?? "med",
      usedRealApi: true,
    };
  } catch (err) {
    return {
      runner: null,
      reason: `AI classify failed: ${err instanceof Error ? err.message : String(err)}`,
      confidence: "low",
      usedRealApi: false,
    };
  }
}
