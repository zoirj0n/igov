import { getCurrentUser } from "@/lib/auth/server";
import { isValidIso3 } from "@/lib/data/iso-countries";
import { fetchCountryFacts } from "@/services/live/countryFacts";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ iso3: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { iso3 } = await ctx.params;
  const code = iso3.toUpperCase();
  if (!isValidIso3(code)) return NextResponse.json({ error: "unknown iso3" }, { status: 404 });
  const facts = await fetchCountryFacts(code);
  if (!facts) return NextResponse.json({ error: "no facts available" }, { status: 404 });
  return NextResponse.json({ facts });
}
