import type { SectorKey } from "@/components/profile/SectorTabs";

interface SectorSummary {
  summary: string;
  citations: string[];
  confidence: "high" | "med" | "low";
}

type SummaryMap = Partial<Record<SectorKey, SectorSummary>>;

const FALLBACK: SectorSummary = {
  summary:
    "AI synthesis not yet available for this sector. Once upstream sources are ingested, this block will surface a sourced executive summary with confidence scoring.",
  citations: ["pending ingest"],
  confidence: "low",
};

const STORE: Record<string, SummaryMap> = {
  ARE: {
    overview: {
      summary:
        "UAE leadership pairs diversified hydrocarbon exports with rapid clean-energy build-out (14.2% renewables share, 2025). Federal strategy frames 2031 economic doubling against COP28 Consensus follow-through and a sovereign green-hydrogen offer to Europe and APAC.",
      citations: ["World Bank, 2025", "IRENA, 2025", "WAM, 2025"],
      confidence: "high",
    },
    energy: {
      summary:
        "Crude output at 4.01 Mb/d with spare capacity well above OPEC quota. Renewables-share growth driven by Al Dhafra (2 GW PV) and the Mohammed bin Rashid solar park (5 GW by 2030). Nuclear baseload from Barakah covers ~25% of electricity demand.",
      citations: ["IEA WEO, 2025", "IRENA, 2025", "Emirates Nuclear Energy Corporation"],
      confidence: "high",
    },
    infrastructure: {
      summary:
        "Infrastructure index at 4.3/5 (WEF). Etihad Rail Stage Two (1,200 km) targets logistics cost reductions of 8%. Dubai South and Khalifa Industrial Zone Abu Dhabi anchor multimodal trade flows to South Asia and East Africa.",
      citations: ["WEF GCI, 2024", "Etihad Rail prospectus, 2025"],
      confidence: "high",
    },
    sustainability: {
      summary:
        "SDG composite score 72.3 with rapid gains on clean-energy access and circular economy targets. Net-zero by 2050 commitment underpins the green-hydrogen pipeline; CO₂ per capita remains elevated (20.7 t) — a sensitivity in bilateral climate dialogues.",
      citations: ["UN SDSN, 2024", "MOCCAE, 2025"],
      confidence: "med",
    },
    trade: {
      summary:
        "Exports at $549B in 2024 with non-oil exports surpassing $200B for the first time. CEPA framework has closed 12 agreements (India, Indonesia, Türkiye, Cambodia, etc.) and is now anchoring tariff and services liberalization across MENA, APAC, and LATAM.",
      citations: ["UN Comtrade, 2024", "MOFAT, 2025"],
      confidence: "high",
    },
    cooperation: {
      summary:
        "Active strategic dialogues with Germany (hydrogen), France (nuclear), Japan (smart cities), South Korea (defense + nuclear O&M), India (CEPA + infra). Open opportunity surface: critical minerals supply chains, AI sovereign compute, climate finance vehicles.",
      citations: ["MoFA, 2025", "MOCCAE, 2025"],
      confidence: "med",
    },
  },
  DEU: {
    overview: {
      summary:
        "Germany blends industrial export strength with the Energiewende transition. GDP growth subdued (0.7%, 2025) under cost pressure, while renewables share leads G7 (52.1%). Coalition government prioritizes hydrogen imports and critical raw-materials partnerships.",
      citations: ["World Bank, 2025", "IRENA, 2025", "BMWK"],
      confidence: "high",
    },
    energy: {
      summary:
        "Renewables generated >52% of power in 2025. Nuclear fully phased out; LNG terminals brought online 2023–2024 to backstop gas security. H2Global auctions formalize import demand — opening UAE green-NH₃ and -methanol corridors.",
      citations: ["BMWK, 2025", "AGEB, 2025"],
      confidence: "high",
    },
  },
  JPN: {
    overview: {
      summary:
        "Japan combines aging demographics with deep industrial capability. GX (Green Transformation) policy mobilizes ¥150T over 10 years across hydrogen, ammonia co-firing, and nuclear restarts. Smart-city programmes anchor Society 5.0 deployment.",
      citations: ["World Bank, 2025", "METI, 2025"],
      confidence: "high",
    },
  },
};

export function summaryFor(iso3: string, sector: SectorKey): SectorSummary {
  return STORE[iso3]?.[sector] ?? FALLBACK;
}
