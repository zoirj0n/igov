export interface Project {
  id: string;
  countryIso3: string;
  name: string;
  sector: "energy" | "infrastructure" | "sustainability" | "trade";
  status: "planned" | "in_progress" | "operational";
  budgetUsd?: number;
  partnersIso3: string[];
  summary: string;
}

export const PROJECTS: Project[] = [
  {
    id: "proj_001",
    countryIso3: "ARE",
    name: "Al Dhafra Solar PV (2 GW)",
    sector: "energy",
    status: "operational",
    budgetUsd: 1_350_000_000,
    partnersIso3: ["FRA", "CHN"],
    summary: "World-record low tariff utility-scale solar project supplying ~160k UAE homes.",
  },
  {
    id: "proj_002",
    countryIso3: "ARE",
    name: "Etihad Rail Stage Two",
    sector: "infrastructure",
    status: "in_progress",
    budgetUsd: 11_000_000_000,
    partnersIso3: ["DEU", "ITA"],
    summary: "1,200 km national freight + passenger rail network linking Ghuweifat to Fujairah.",
  },
  {
    id: "proj_003",
    countryIso3: "ARE",
    name: "Masdar Green Hydrogen Programme",
    sector: "sustainability",
    status: "in_progress",
    budgetUsd: 4_500_000_000,
    partnersIso3: ["DEU", "JPN", "KOR"],
    summary: "Multi-site green hydrogen and ammonia export capacity targeting 1 Mtpa by 2030.",
  },
  {
    id: "proj_004",
    countryIso3: "DEU",
    name: "H2Global Foundation auctions",
    sector: "sustainability",
    status: "in_progress",
    budgetUsd: 4_400_000_000,
    partnersIso3: ["ARE", "AUS"],
    summary: "Double-sided auction mechanism to import green hydrogen derivatives.",
  },
  {
    id: "proj_005",
    countryIso3: "JPN",
    name: "Society 5.0 smart-city programme",
    sector: "infrastructure",
    status: "in_progress",
    partnersIso3: ["ARE", "SGP"],
    summary: "National framework integrating cyber-physical systems across 27 designated cities.",
  },
];

export function projectsByCountry(iso3: string): Project[] {
  return PROJECTS.filter((p) => p.countryIso3 === iso3);
}

export function cooperationOpportunities(iso3: string): Project[] {
  return PROJECTS.filter((p) => p.partnersIso3.includes(iso3) || p.countryIso3 === iso3);
}
