import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Classification, OrgPolicy, Role } from "@/types";

const STORE_PATH = path.join(process.cwd(), "data", "org-policy.json");

function seed(): OrgPolicy {
  return {
    orgDefaultClassification: "internal",
    roleDefaults: {},
    updatedAt: new Date(0).toISOString(),
    updatedBy: "system",
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __ciOrgPolicy: OrgPolicy | undefined;
}

function loadFromDisk(): OrgPolicy {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<OrgPolicy>;
    if (
      parsed.orgDefaultClassification === "public" ||
      parsed.orgDefaultClassification === "internal" ||
      parsed.orgDefaultClassification === "confidential" ||
      parsed.orgDefaultClassification === "secret"
    ) {
      return {
        orgDefaultClassification: parsed.orgDefaultClassification,
        roleDefaults: parsed.roleDefaults ?? {},
        deptDailyBudgets: parsed.deptDailyBudgets ?? {},
        updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
        updatedBy: parsed.updatedBy ?? "system",
      };
    }
  } catch {
    // miss
  }
  return seed();
}

let cache: OrgPolicy = globalThis.__ciOrgPolicy ?? loadFromDisk();
if (!globalThis.__ciOrgPolicy) globalThis.__ciOrgPolicy = cache;

function persist(): void {
  globalThis.__ciOrgPolicy = cache;
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error("[org-policy] persist failed:", err instanceof Error ? err.message : err);
  }
}

export function getOrgPolicy(): OrgPolicy {
  return {
    ...cache,
    roleDefaults: { ...cache.roleDefaults },
    deptDailyBudgets: cache.deptDailyBudgets ? { ...cache.deptDailyBudgets } : undefined,
  };
}

export interface SetOrgPolicyInput {
  orgDefaultClassification?: Classification;
  roleDefaults?: Partial<Record<Role, Classification>>;
  deptDailyBudgets?: Record<string, number>;
  updatedBy: string;
}

export function setOrgPolicy(input: SetOrgPolicyInput): OrgPolicy {
  cache = {
    orgDefaultClassification: input.orgDefaultClassification ?? cache.orgDefaultClassification,
    roleDefaults: input.roleDefaults ?? cache.roleDefaults,
    deptDailyBudgets: input.deptDailyBudgets ?? cache.deptDailyBudgets,
    updatedAt: new Date().toISOString(),
    updatedBy: input.updatedBy,
  };
  persist();
  return getOrgPolicy();
}
