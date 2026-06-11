import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ManifestSource {
  name: string;
  url: string;
  coverage: string;
  bestUse: string;
  cacheKey: string;
}

export interface ManifestCategory {
  label: string;
  dir: string;
  sources: ManifestSource[];
}

export interface Manifest {
  version: string;
  sourceCsv: string;
  categories: Record<string, ManifestCategory>;
}

const MANIFEST_PATH = path.join(process.cwd(), "agent-resources", "manifest.json");
const USER_SOURCES_PATH = path.join(process.cwd(), "data", "user-sources.json");
let cache: Manifest | null = null;

interface UserSourceFile {
  cacheKey: string;
  name: string;
  url: string;
  coverage: string;
  bestUse: string;
  category: string;
}

export function loadManifest(): Manifest {
  if (cache) return cache;
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  const base = JSON.parse(raw) as Manifest;
  if (existsSync(USER_SOURCES_PATH)) {
    try {
      const userRaw = readFileSync(USER_SOURCES_PATH, "utf-8");
      const list = JSON.parse(userRaw) as UserSourceFile[];
      for (const u of list) {
        const cat = base.categories[u.category] ?? {
          label: u.category,
          dir: `agent-resources/${u.category}`,
          sources: [],
        };
        if (!cat.sources.find((s) => s.cacheKey === u.cacheKey)) {
          cat.sources.push({
            name: u.name,
            url: u.url,
            coverage: u.coverage,
            bestUse: u.bestUse,
            cacheKey: u.cacheKey,
          });
        }
        base.categories[u.category] = cat;
      }
    } catch {
      // ignore malformed user file
    }
  }
  cache = base;
  return cache;
}

export function invalidateManifestCache(): void {
  cache = null;
}

export function categoryKeys(): string[] {
  return Object.keys(loadManifest().categories);
}

export function findCategory(slug: string): ManifestCategory | undefined {
  return loadManifest().categories[slug];
}

export function findSourceByCacheKey(
  slug: string,
): { category: string; source: ManifestSource } | undefined {
  const m = loadManifest();
  for (const [catSlug, cat] of Object.entries(m.categories)) {
    const s = cat.sources.find((x) => x.cacheKey === slug);
    if (s) return { category: catSlug, source: s };
  }
  return undefined;
}

export function searchManifest(query: string): { category: string; source: ManifestSource }[] {
  const q = query.toLowerCase();
  const out: { category: string; source: ManifestSource }[] = [];
  for (const [catSlug, cat] of Object.entries(loadManifest().categories)) {
    for (const s of cat.sources) {
      if (
        s.name.toLowerCase().includes(q) ||
        s.coverage.toLowerCase().includes(q) ||
        s.bestUse.toLowerCase().includes(q)
      ) {
        out.push({ category: catSlug, source: s });
      }
    }
  }
  return out;
}
