export type Classification = "public" | "internal" | "confidential" | "secret";
export type Locale = "en" | "ar";
export type Role = "viewer" | "analyst" | "lead" | "executive" | "admin";

export interface Department {
  id: string;
  name: string;
  parentId?: string;
  defaultClassification?: Classification;
  createdAt: string;
  createdBy: string;
}

export interface OrgPolicy {
  orgDefaultClassification: Classification;
  roleDefaults: Partial<Record<Role, Classification>>;
  /** Daily LLM budget cap per department in USD. Missing key = no dept cap. */
  deptDailyBudgets?: Record<string, number>;
  updatedAt: string;
  updatedBy: string;
}

export interface UserOverride {
  defaultClassification: Classification;
  updatedAt: string;
}

export type PolicySource = "user" | "role" | "department" | "org";

export interface ResolvedPolicy {
  value: Classification;
  source: PolicySource;
  sourceLabel: string;
  clampedFromClearance: boolean;
}

export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export interface User {
  id: string;
  email: string;
  nameEn: string;
  nameAr: string;
  role: Role;
  classificationClearance: Classification;
}

export interface Country {
  iso3: string;
  nameEn: string;
  nameAr: string;
  region: string;
  flagEmoji?: string;
}

export interface Indicator {
  id: string;
  countryIso3: string;
  metric: string;
  value: number;
  unit: string;
  year: number;
  source: string;
  confidence: "high" | "med" | "low";
}

export interface Briefing {
  id: string;
  title: string;
  countryIso3: string;
  audience: string;
  classification: Classification;
  createdBy: string;
  createdAt: string;
  body: string;
  talkingPoints?: string[];
  risks?: string[];
  opportunities?: string[];
  citations?: string[];
  confidence?: "high" | "med" | "low";
}
