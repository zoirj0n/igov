/**
 * Daily budget tracker for LLM spend.
 *
 * Holds per-day running totals (org-wide + per-actor) in process memory.
 * On a logLlmCall, recordSpend() is called; if either threshold crosses,
 * recordSpend returns a BudgetAlert which the audit layer emits as a single
 * cost.budget.exceeded event per scope per day (cooldown 24h).
 *
 * Env config:
 *   DAILY_BUDGET_USD           org-wide cap (default 0 = disabled)
 *   PER_USER_DAILY_BUDGET_USD  per-actor cap (default 0 = disabled)
 *
 * On process restart counters reset. For pilot. Production should reconstruct
 * from logs/llm-calls.jsonl on boot if cross-restart persistence matters.
 */

function envFloat(name: string, dflt: number): number {
  const v = process.env[name];
  if (!v) return dflt;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

const ORG_DAILY_BUDGET = envFloat("DAILY_BUDGET_USD", 0);
const USER_DAILY_BUDGET = envFloat("PER_USER_DAILY_BUDGET_USD", 0);
const ENFORCE_BLOCK = (process.env.BUDGET_ENFORCE_BLOCK ?? "false").toLowerCase() === "true";

interface DayBucket {
  day: string; // YYYY-MM-DD UTC
  orgSpend: number;
  byActor: Map<string, number>;
  byDept: Map<string, number>;
  orgAlertedAt?: number;
  actorAlertedAt: Map<string, number>;
  deptAlertedAt: Map<string, number>;
}

declare global {
  // eslint-disable-next-line no-var
  var __ciBudget: DayBucket | undefined;
}

function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function freshBucket(): DayBucket {
  return {
    day: currentDay(),
    orgSpend: 0,
    byActor: new Map(),
    byDept: new Map(),
    actorAlertedAt: new Map(),
    deptAlertedAt: new Map(),
  };
}

let state: DayBucket = globalThis.__ciBudget ?? freshBucket();
if (!globalThis.__ciBudget) globalThis.__ciBudget = state;

function ensureCurrent(): DayBucket {
  const today = currentDay();
  if (state.day !== today) {
    state = freshBucket();
    globalThis.__ciBudget = state;
  }
  return state;
}

export interface BudgetAlert {
  scope: "org" | "actor" | "dept";
  actor?: string; // only for scope="actor"
  deptId?: string; // only for scope="dept"
  day: string;
  spendUsd: number; // running total at the moment of breach
  thresholdUsd: number;
}

export interface RecordResult {
  alerts: BudgetAlert[];
  orgSpend: number;
  actorSpend: number;
  deptSpend?: number;
  orgLimit: number;
  actorLimit: number;
  deptLimit?: number;
}

// Type alias keeps the typeof-import expression on one line; Biome's formatter
// otherwise splits it into a form that breaks TS parsing.
type OrgPolicyModule = typeof import("@/services/policy/org-policy");
type AuthUsersModule = typeof import("@/lib/auth/users");
type UserDeptModule = typeof import("@/services/policy/user-departments");

function deptCapFor(deptId?: string): number {
  if (!deptId) return 0;
  try {
    const mod = require("@/services/policy/org-policy") as OrgPolicyModule;
    const pol = mod.getOrgPolicy();
    const cap = pol.deptDailyBudgets?.[deptId];
    return typeof cap === "number" && cap > 0 ? cap : 0;
  } catch {
    return 0;
  }
}

/** Memoized email→deptId lookup for callers that don't thread actorDept.
 * Used by both checkBudget and call-log/recordSpend paths. */
const _deptByActor = new Map<string, string | undefined>();
export function resolveActorDept(actor?: string): string | undefined {
  if (!actor || actor === "system") return undefined;
  if (_deptByActor.has(actor)) return _deptByActor.get(actor);
  try {
    const { SEED_USERS } = require("@/lib/auth/users") as AuthUsersModule;
    const { listUserDepartments } = require("@/services/policy/user-departments") as UserDeptModule;
    const u = SEED_USERS.find((x) => x.email === actor);
    if (!u) {
      _deptByActor.set(actor, undefined);
      return undefined;
    }
    const rec = listUserDepartments()[u.sub];
    const deptId = rec?.departmentId;
    _deptByActor.set(actor, deptId);
    return deptId;
  } catch {
    return undefined;
  }
}

/**
 * Record one LLM call's cost. Returns alerts that fired on this call (deduped:
 * at most one per scope per day per actor/dept).
 */
export function recordSpend(actor: string, costUsd: number, deptId?: string): RecordResult {
  const s = ensureCurrent();
  s.orgSpend += costUsd;
  const actorCur = (s.byActor.get(actor) ?? 0) + costUsd;
  s.byActor.set(actor, actorCur);
  let deptCur: number | undefined;
  if (deptId) {
    deptCur = (s.byDept.get(deptId) ?? 0) + costUsd;
    s.byDept.set(deptId, deptCur);
  }
  const deptCap = deptCapFor(deptId);

  const alerts: BudgetAlert[] = [];
  if (ORG_DAILY_BUDGET > 0 && s.orgSpend >= ORG_DAILY_BUDGET && !s.orgAlertedAt) {
    s.orgAlertedAt = Date.now();
    alerts.push({
      scope: "org",
      day: s.day,
      spendUsd: s.orgSpend,
      thresholdUsd: ORG_DAILY_BUDGET,
    });
  }
  if (USER_DAILY_BUDGET > 0 && actorCur >= USER_DAILY_BUDGET && !s.actorAlertedAt.has(actor)) {
    s.actorAlertedAt.set(actor, Date.now());
    alerts.push({
      scope: "actor",
      actor,
      day: s.day,
      spendUsd: actorCur,
      thresholdUsd: USER_DAILY_BUDGET,
    });
  }
  if (
    deptId &&
    deptCap > 0 &&
    deptCur !== undefined &&
    deptCur >= deptCap &&
    !s.deptAlertedAt.has(deptId)
  ) {
    s.deptAlertedAt.set(deptId, Date.now());
    alerts.push({
      scope: "dept",
      deptId,
      day: s.day,
      spendUsd: deptCur,
      thresholdUsd: deptCap,
    });
  }
  return {
    alerts,
    orgSpend: s.orgSpend,
    actorSpend: actorCur,
    deptSpend: deptCur,
    orgLimit: ORG_DAILY_BUDGET,
    actorLimit: USER_DAILY_BUDGET,
    deptLimit: deptCap > 0 ? deptCap : undefined,
  };
}

export interface BudgetSnapshot {
  day: string;
  orgSpend: number;
  orgLimit: number;
  orgPercent: number;
  byActor: { actor: string; spend: number; limit: number; percent: number; alerted: boolean }[];
  byDept: { deptId: string; spend: number; limit: number; percent: number; alerted: boolean }[];
}

export function snapshot(): BudgetSnapshot {
  const s = ensureCurrent();
  return {
    day: s.day,
    orgSpend: Number(s.orgSpend.toFixed(4)),
    orgLimit: ORG_DAILY_BUDGET,
    orgPercent: ORG_DAILY_BUDGET > 0 ? Number((s.orgSpend / ORG_DAILY_BUDGET).toFixed(3)) : 0,
    byActor: Array.from(s.byActor.entries())
      .map(([actor, spend]) => ({
        actor,
        spend: Number(spend.toFixed(4)),
        limit: USER_DAILY_BUDGET,
        percent: USER_DAILY_BUDGET > 0 ? Number((spend / USER_DAILY_BUDGET).toFixed(3)) : 0,
        alerted: s.actorAlertedAt.has(actor),
      }))
      .sort((a, b) => b.spend - a.spend),
    byDept: Array.from(s.byDept.entries())
      .map(([deptId, spend]) => {
        const limit = deptCapFor(deptId);
        return {
          deptId,
          spend: Number(spend.toFixed(4)),
          limit,
          percent: limit > 0 ? Number((spend / limit).toFixed(3)) : 0,
          alerted: s.deptAlertedAt.has(deptId),
        };
      })
      .sort((a, b) => b.spend - a.spend),
  };
}

export function getConfig(): { orgDaily: number; userDaily: number; enforceBlock: boolean } {
  return { orgDaily: ORG_DAILY_BUDGET, userDaily: USER_DAILY_BUDGET, enforceBlock: ENFORCE_BLOCK };
}

export interface BudgetDecision {
  allowed: boolean;
  scope?: "org" | "actor" | "dept";
  spendUsd?: number;
  thresholdUsd?: number;
  message?: string;
}

/**
 * Check budget BEFORE a call. Returns allowed=false when ENFORCE_BLOCK is on
 * AND a cap is already crossed. When ENFORCE_BLOCK is off, always allows.
 */
export function checkBudget(actor: string, deptId?: string): BudgetDecision {
  if (!ENFORCE_BLOCK) return { allowed: true };
  const s = ensureCurrent();
  if (ORG_DAILY_BUDGET > 0 && s.orgSpend >= ORG_DAILY_BUDGET) {
    return {
      allowed: false,
      scope: "org",
      spendUsd: Number(s.orgSpend.toFixed(4)),
      thresholdUsd: ORG_DAILY_BUDGET,
      message: `org daily budget exceeded: $${s.orgSpend.toFixed(4)} >= $${ORG_DAILY_BUDGET}`,
    };
  }
  const actorSpend = s.byActor.get(actor) ?? 0;
  if (USER_DAILY_BUDGET > 0 && actorSpend >= USER_DAILY_BUDGET) {
    return {
      allowed: false,
      scope: "actor",
      spendUsd: Number(actorSpend.toFixed(4)),
      thresholdUsd: USER_DAILY_BUDGET,
      message: `user daily budget exceeded for ${actor}: $${actorSpend.toFixed(4)} >= $${USER_DAILY_BUDGET}`,
    };
  }
  if (deptId) {
    const cap = deptCapFor(deptId);
    const deptSpend = s.byDept.get(deptId) ?? 0;
    if (cap > 0 && deptSpend >= cap) {
      return {
        allowed: false,
        scope: "dept",
        spendUsd: Number(deptSpend.toFixed(4)),
        thresholdUsd: cap,
        message: `dept daily budget exceeded for ${deptId}: $${deptSpend.toFixed(4)} >= $${cap}`,
      };
    }
  }
  return { allowed: true };
}

export class BudgetExceededError extends Error {
  constructor(public decision: BudgetDecision) {
    super(decision.message ?? "budget exceeded");
    this.name = "BudgetExceededError";
  }
}
