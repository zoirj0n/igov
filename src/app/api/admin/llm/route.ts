import { getCurrentUser } from "@/lib/auth/server";
import { logAudit } from "@/services/audit";
import {
  defaultModelFor,
  getLlmConfig,
  getProvider,
  setClassMap,
  setLlmConfig,
} from "@/services/llm";
import { resetLlmConfig, setOffline } from "@/services/llm/config";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ProviderEnum = z.enum(["anthropic", "openrouter", "local"]);

const BodySchema = z.union([
  z.object({
    provider: ProviderEnum,
    model: z.string().min(1).max(120).optional(),
  }),
  z.object({
    classMap: z.object({
      public: ProviderEnum.optional(),
      internal: ProviderEnum.optional(),
      confidential: ProviderEnum.optional(),
      secret: ProviderEnum.optional(),
    }),
  }),
  z.object({ offline: z.boolean() }),
]);

function describe(provider: "anthropic" | "openrouter" | "local") {
  const impl = getProvider(provider);
  return {
    name: provider,
    available: impl.available(),
    unavailableReason: impl.available() ? null : impl.unavailableReason(),
    defaultModel: defaultModelFor(provider),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const cfg = getLlmConfig();
  return NextResponse.json({
    current: cfg,
    providers: [describe("anthropic"), describe("openrouter"), describe("local")],
  });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const before = getLlmConfig();
  let next;
  if ("classMap" in parsed.data) {
    next = setClassMap(parsed.data.classMap, user.email);
    logAudit(user, "llm.config.classmap", "settings", {
      meta: {
        from: before.classMap ?? {},
        to: next.classMap ?? {},
      },
    });
  } else if ("offline" in parsed.data) {
    next = setOffline(parsed.data.offline, user.email);
    logAudit(user, "llm.config.offline", "settings", {
      meta: {
        from: before.offline ?? false,
        to: next.offline ?? false,
        currentProvider: next.provider,
      },
    });
  } else {
    next = setLlmConfig(parsed.data.provider, parsed.data.model, user.email);
    logAudit(user, "llm.config.switch", "settings", {
      meta: {
        from: { provider: before.provider, model: before.model },
        to: { provider: next.provider, model: next.model },
      },
    });
  }
  return NextResponse.json({ current: next });
}

/** Reset to the environment default (drops the persisted override). */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "forbidden: admin only" }, { status: 403 });

  const before = getLlmConfig();
  const next = resetLlmConfig();
  logAudit(user, "llm.config.reset", "settings", {
    meta: {
      from: { provider: before.provider, model: before.model },
      to: { provider: next.provider, model: next.model },
    },
  });
  return NextResponse.json({ current: next });
}
