import { getCurrentUser } from "@/lib/auth/server";
import { CLEARANCE_RANK } from "@/lib/auth/types";
import { logAudit } from "@/services/audit";
import { resolveDefaultClassification } from "@/services/policy/resolver";
import {
  clearUserOverride,
  getUserOverride,
  setUserOverride,
} from "@/services/policy/user-overrides";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutSchema = z.object({
  defaultClassification: z.enum(["public", "internal", "confidential", "secret"]),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const resolved = resolveDefaultClassification(user);
  const override = getUserOverride(user.sub);
  return NextResponse.json({
    resolved,
    override: override ?? null,
    clearance: user.clearance,
    departmentId: user.departmentId,
    departmentSource: user.departmentSource ?? null,
  });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = PutSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const requested = parsed.data.defaultClassification;
  if (CLEARANCE_RANK[requested] > CLEARANCE_RANK[user.clearance]) {
    logAudit(user, "user.preferences.denied", "user", {
      meta: { reason: "exceeds clearance", requested, clearance: user.clearance },
    });
    return NextResponse.json(
      {
        error: `cannot set default to "${requested}" — exceeds your clearance "${user.clearance}"`,
      },
      { status: 403 },
    );
  }
  const before = getUserOverride(user.sub);
  const rec = setUserOverride(user.sub, requested);
  logAudit(user, "user.preferences.set", "user", {
    meta: {
      from: before?.defaultClassification ?? null,
      to: rec.defaultClassification,
    },
  });
  const resolved = resolveDefaultClassification(user);
  return NextResponse.json({ resolved, override: rec, clearance: user.clearance });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const before = getUserOverride(user.sub);
  const removed = clearUserOverride(user.sub);
  if (removed) {
    logAudit(user, "user.preferences.cleared", "user", {
      meta: { from: before?.defaultClassification ?? null },
    });
  }
  const resolved = resolveDefaultClassification(user);
  return NextResponse.json({ resolved, override: null, clearance: user.clearance });
}
