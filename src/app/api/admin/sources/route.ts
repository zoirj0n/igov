import { getCurrentUser } from "@/lib/auth/server";
import { loadManifest, searchManifest } from "@/lib/sources/manifest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const category = url.searchParams.get("category");

  if (q) {
    return NextResponse.json({ query: q, matches: searchManifest(q) });
  }
  const manifest = loadManifest();
  if (category) {
    const cat = manifest.categories[category];
    if (!cat) return NextResponse.json({ error: "unknown category" }, { status: 404 });
    return NextResponse.json({ category, ...cat });
  }
  return NextResponse.json(manifest);
}
