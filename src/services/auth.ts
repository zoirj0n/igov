import type { User } from "../types";
import { apiFetch } from "./api";

export async function getCurrentUser(): Promise<User | null> {
  const res = await apiFetch<User>("/auth/me");
  return res.ok ? (res.data ?? null) : null;
}

export async function logout(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}

export function loginUrl(provider: "uae-pass" | "entra"): string {
  return `/auth/${provider}/start`;
}
