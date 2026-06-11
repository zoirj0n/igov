import type { ApiResponse } from "../types";

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    return { ok: false, status: res.status, error: await res.text() };
  }

  return { ok: true, status: res.status, data: (await res.json()) as T };
}
