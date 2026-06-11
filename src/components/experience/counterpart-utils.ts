import type { CounterpartProfile } from "@/services/agent/state";

export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .slice(0, 2)
      .join("") || "?"
  );
}

export function photoProxySrc(p: CounterpartProfile): string | undefined {
  if (!p.photoUrl) return undefined;
  if (p.photoUrl.startsWith("/")) return p.photoUrl;
  return `/api/agent/counterpart-photo?src=${encodeURIComponent(p.photoUrl)}`;
}
