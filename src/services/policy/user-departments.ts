import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DepartmentSource } from "@/lib/auth/types";

const STORE_PATH = path.join(process.cwd(), "data", "user-departments.json");

export interface UserDepartmentRecord {
  departmentId: string;
  source: DepartmentSource;
  updatedAt: string;
  updatedBy: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __ciUserDepartments: Record<string, UserDepartmentRecord> | undefined;
}

function loadFromDisk(): Record<string, UserDepartmentRecord> {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, UserDepartmentRecord>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // miss
  }
  return {};
}

const cache: Record<string, UserDepartmentRecord> =
  globalThis.__ciUserDepartments ?? loadFromDisk();
if (!globalThis.__ciUserDepartments) globalThis.__ciUserDepartments = cache;

function persist(): void {
  globalThis.__ciUserDepartments = cache;
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error("[user-departments] persist failed:", err instanceof Error ? err.message : err);
  }
}

export function getUserDepartment(sub: string): UserDepartmentRecord | undefined {
  return cache[sub];
}

export function setUserDepartment(
  sub: string,
  departmentId: string,
  source: DepartmentSource,
  updatedBy: string,
): UserDepartmentRecord {
  const rec: UserDepartmentRecord = {
    departmentId,
    source,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };
  cache[sub] = rec;
  persist();
  return rec;
}

/**
 * SSO-driven update — respects admin override.
 * Returns the effective record after the operation.
 */
export function recordSsoDepartment(
  sub: string,
  departmentId: string,
  ssoActor: string,
): UserDepartmentRecord {
  const existing = cache[sub];
  if (existing && existing.source === "admin") return existing;
  return setUserDepartment(sub, departmentId, "sso", ssoActor);
}

export function clearUserDepartment(sub: string): boolean {
  if (!(sub in cache)) return false;
  delete cache[sub];
  persist();
  return true;
}

export function listUserDepartments(): Record<string, UserDepartmentRecord> {
  return { ...cache };
}
