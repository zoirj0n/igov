import type { AuthUser } from "@/lib/auth/types";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import type { Classification, PolicySource, ResolvedPolicy } from "@/types";
import { getDepartment } from "./departments";
import { getOrgPolicy } from "./org-policy";
import { getUserOverride } from "./user-overrides";

function isValidClass(v: unknown): v is Classification {
  return v === "public" || v === "internal" || v === "confidential" || v === "secret";
}

export function resolveDefaultClassification(user: AuthUser): ResolvedPolicy {
  const override = getUserOverride(user.sub);
  const org = getOrgPolicy();
  const dept = user.departmentId ? getDepartment(user.departmentId) : undefined;
  const roleDefault = org.roleDefaults[user.role];

  let value: Classification;
  let source: PolicySource;
  let sourceLabel: string;

  if (override && isValidClass(override.defaultClassification)) {
    value = override.defaultClassification;
    source = "user";
    sourceLabel = "your personal setting";
  } else if (isValidClass(roleDefault)) {
    value = roleDefault;
    source = "role";
    sourceLabel = `${user.role} role default`;
  } else if (dept && isValidClass(dept.defaultClassification)) {
    value = dept.defaultClassification;
    source = "department";
    sourceLabel = `your department: ${dept.name}`;
  } else {
    value = org.orgDefaultClassification;
    source = "org";
    sourceLabel = "organization default";
  }

  const clearanceRank = CLEARANCE_RANK[user.clearance];
  let clampedFromClearance = false;
  if (CLEARANCE_RANK[value] > clearanceRank) {
    value = user.clearance;
    clampedFromClearance = true;
  }

  return { value, source, sourceLabel, clampedFromClearance };
}
