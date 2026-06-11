import {
  NEXT_COOKIE,
  NONCE_COOKIE,
  PROVIDER_COOKIE,
  type ProviderKey,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  configuredProviders,
  discover,
  genRandomB64,
  getProvider,
  pkceChallenge,
} from "@/lib/auth/oidc";
import { logAudit } from "@/services/audit";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return "/dashboard";
  return raw;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const providerKey = (url.searchParams.get("provider") ?? "") as ProviderKey;
  const next = safeNext(url.searchParams.get("next"));

  const provider = getProvider(providerKey);
  if (!provider) {
    const available = configuredProviders().map((p) => p.key);
    logAudit(null, "auth.oidc.start.misconfigured", "session", {
      meta: { requested: providerKey, available },
    });
    return NextResponse.json(
      {
        error: `OIDC provider not configured: ${providerKey}`,
        availableProviders: available,
        hint: "Set UAE_PASS_* / ENTRA_* env vars to enable OIDC. Stub login remains at /login.",
      },
      { status: 400 },
    );
  }

  try {
    const doc = await discover(provider);
    const state = genRandomB64(24);
    const nonce = genRandomB64(24);
    const verifier = genRandomB64(48);
    const challenge = await pkceChallenge(verifier);

    const authUrl = new URL(doc.authorization_endpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", provider.clientId);
    authUrl.searchParams.set("redirect_uri", provider.redirectUri);
    authUrl.searchParams.set("scope", provider.scope);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    logAudit(null, "auth.oidc.start", "session", {
      meta: { provider: provider.key },
    });

    const res = NextResponse.redirect(authUrl.toString());
    const proto =
      req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    const secure = proto === "https";
    const opts = { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: 600 };
    res.cookies.set(STATE_COOKIE, state, opts);
    res.cookies.set(NONCE_COOKIE, nonce, opts);
    res.cookies.set(VERIFIER_COOKIE, verifier, opts);
    res.cookies.set(PROVIDER_COOKIE, provider.key, opts);
    res.cookies.set(NEXT_COOKIE, next, opts);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logAudit(null, "auth.oidc.start.error", "session", {
      meta: { provider: providerKey, error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
