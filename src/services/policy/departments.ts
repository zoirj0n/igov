import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Classification, Department } from "@/types";

const STORE_PATH = path.join(process.cwd(), "data", "departments.json");

const UNASSIGNED_ID = "dept-unassigned";

function seed(): Department[] {
  return [
    {
      id: UNASSIGNED_ID,
      name: "Unassigned",
      createdAt: new Date(0).toISOString(),
      createdBy: "system",
    },
  ];
}

declare global {
  // eslint-disable-next-line no-var
  var __ciDepartments: Department[] | undefined;
}

function loadFromDisk(): Department[] {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { departments?: Department[] };
    if (Array.isArray(parsed.departments)) return parsed.departments;
  } catch {
    // miss
  }
  return seed();
}

let cache: Department[] = globalThis.__ciDepartments ?? loadFromDisk();
if (!globalThis.__ciDepartments) globalThis.__ciDepartments = cache;

function persist(): void {
  globalThis.__ciDepartments = cache;
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify({ departments: cache }, null, 2), "utf-8");
  } catch (err) {
    console.error("[departments] persist failed:", err instanceof Error ? err.message : err);
  }
}

export function listDepartments(): Department[] {
  return cache.slice();
}

export function getDepartment(id: string): Department | undefined {
  return cache.find((d) => d.id === id);
}

export function getDepartmentByName(name: string): Department | undefined {
  const lower = name.trim().toLowerCase();
  return cache.find((d) => d.name.toLowerCase() === lower);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export interface CreateDeptInput {
  name: string;
  parentId?: string;
  defaultClassification?: Classification;
  createdBy: string;
}

export function createDepartment(input: CreateDeptInput): Department {
  const existing = getDepartmentByName(input.name);
  if (existing) return existing;
  let id = `dept-${slugify(input.name)}`;
  if (!id || id === "dept-") id = `dept-${Date.now()}`;
  let suffix = 1;
  while (cache.some((d) => d.id === id)) {
    suffix += 1;
    id = `dept-${slugify(input.name)}-${suffix}`;
  }
  const rec: Department = {
    id,
    name: input.name.trim(),
    parentId: input.parentId,
    defaultClassification: input.defaultClassification,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };
  cache.push(rec);
  persist();
  return rec;
}

export interface UpdateDeptInput {
  name?: string;
  parentId?: string | null;
  defaultClassification?: Classification | null;
}

export function updateDepartment(id: string, patch: UpdateDeptInput): Department | null {
  const idx = cache.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const cur = cache[idx]!;
  const next: Department = {
    ...cur,
    name: patch.name?.trim() || cur.name,
    parentId: patch.parentId === null ? undefined : (patch.parentId ?? cur.parentId),
    defaultClassification:
      patch.defaultClassification === null
        ? undefined
        : (patch.defaultClassification ?? cur.defaultClassification),
  };
  cache[idx] = next;
  persist();
  return next;
}

export function deleteDepartment(id: string): boolean {
  if (id === UNASSIGNED_ID) return false;
  const before = cache.length;
  cache = cache.filter((d) => d.id !== id);
  if (cache.length === before) return false;
  persist();
  return true;
}

export function upsertDepartmentByName(name: string, createdBy: string): Department {
  return getDepartmentByName(name) ?? createDepartment({ name, createdBy });
}

export function getUnassignedId(): string {
  return UNASSIGNED_ID;
}
