import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Classification, UserOverride } from "@/types";

const STORE_PATH = path.join(process.cwd(), "data", "user-overrides.json");

declare global {
  // eslint-disable-next-line no-var
  var __ciUserOverrides: Record<string, UserOverride> | undefined;
}

function loadFromDisk(): Record<string, UserOverride> {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, UserOverride>;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // miss
  }
  return {};
}

const cache: Record<string, UserOverride> = globalThis.__ciUserOverrides ?? loadFromDisk();
if (!globalThis.__ciUserOverrides) globalThis.__ciUserOverrides = cache;

function persist(): void {
  globalThis.__ciUserOverrides = cache;
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error("[user-overrides] persist failed:", err instanceof Error ? err.message : err);
  }
}

export function getUserOverride(sub: string): UserOverride | undefined {
  return cache[sub];
}

export function setUserOverride(sub: string, defaultClassification: Classification): UserOverride {
  const rec: UserOverride = {
    defaultClassification,
    updatedAt: new Date().toISOString(),
  };
  cache[sub] = rec;
  persist();
  return rec;
}

export function clearUserOverride(sub: string): boolean {
  if (!(sub in cache)) return false;
  delete cache[sub];
  persist();
  return true;
}
