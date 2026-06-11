"use client";

import { useEffect, useState } from "react";

export type Role = "viewer" | "analyst" | "lead" | "executive" | "admin";
export type Clearance = "public" | "internal" | "confidential" | "secret";

export interface ClientUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
  clearance: Clearance;
}

export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  analyst: 1,
  lead: 2,
  executive: 3,
  admin: 4,
};

export const CLEARANCE_RANK: Record<Clearance, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  secret: 3,
};

export function hasRole(user: ClientUser | null, min: Role): boolean {
  if (!user) return false;
  return ROLE_RANK[user.role] >= ROLE_RANK[min];
}

export function hasClearance(user: ClientUser | null, min: Clearance): boolean {
  if (!user) return false;
  return CLEARANCE_RANK[user.clearance] >= CLEARANCE_RANK[min];
}

export { landingFor } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __ciAuthCache: { ts: number; user: ClientUser | null } | undefined;
}

const TTL_MS = 30_000;

export function useAuthedUser(): { user: ClientUser | null; loading: boolean } {
  const cached = typeof window !== "undefined" ? globalThis.__ciAuthCache : undefined;
  const fresh = cached && Date.now() - cached.ts < TTL_MS ? cached.user : undefined;
  const [user, setUser] = useState<ClientUser | null>(fresh ?? null);
  const [loading, setLoading] = useState(fresh === undefined);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (globalThis.__ciAuthCache && Date.now() - globalThis.__ciAuthCache.ts < TTL_MS) {
      setUser(globalThis.__ciAuthCache.user);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/auth/me")
      .then(async (r) => (r.ok ? r.json() : { user: null }))
      .then((d: { user: ClientUser | null }) => {
        globalThis.__ciAuthCache = { ts: Date.now(), user: d.user };
        if (!cancelled) {
          setUser(d.user);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}
