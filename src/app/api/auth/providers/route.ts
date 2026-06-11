import { configuredProviders } from "@/lib/auth/oidc";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const list = configuredProviders().map((p) => ({ key: p.key, label: p.label }));
  return NextResponse.json({ providers: list, stubLoginEnabled: true });
}
