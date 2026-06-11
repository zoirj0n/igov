import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ManifestSource } from "./manifest";

export interface UserSource extends ManifestSource {
  category: string;
  addedBy: string;
  addedAt: string;
  origin: "url" | "upload";
  localPath?: string;
}

const STORE_PATH = path.join(process.cwd(), "data", "user-sources.json");

let cache: UserSource[] | null = null;

export async function loadUserSources(): Promise<UserSource[]> {
  if (cache !== null) return cache;
  try {
    const raw = await readFile(STORE_PATH, "utf-8");
    cache = JSON.parse(raw) as UserSource[];
  } catch {
    cache = [];
  }
  return cache;
}

export async function appendUserSource(entry: UserSource): Promise<void> {
  const current = await loadUserSources();
  current.push(entry);
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(current, null, 2), "utf-8");
  cache = current;
}

export function clearUserSourcesCache(): void {
  cache = null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
