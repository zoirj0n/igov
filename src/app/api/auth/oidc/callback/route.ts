import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/auth/jwt";
import {
  NEXT_COOKIE,
  NONCE_COOKIE,
  PROVIDER_COOKIE,
  type ProviderKey,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  exchangeCode,
  getProvider,
  mapClaimsToUser,
  verifyIdToken,
} from "@/lib/auth/oidc";
import { logAudit } from "@/services/audit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeNext(raw: string | undefined): string {
  if (!raw) return "/dashboard";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/login") || raw.startsWith("/api/")) return "/dashboard";
  return raw;
}

function clearOidcCookies(res: NextResponse): void {
  for (const k of [STATE_COOKIE, NONCE_COOKIE, VERIFIER_COOKIE, PROVIDER_COOKIE, NEXT_COOKIE]) {
    res.cookies.set(k, "", { httpOnly: true, path: "/", maxAge: 0 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const providerKey = (url.searchParams.get("provider") ?? "") as ProviderKey;

  const jar = await cookies();
  const expectedState = jar.get(STATE_COOKIE)?.value;
  const expectedNonce = jar.get(NONCE_COOKIE)?.value;
  const codeVerifier = jar.get(VERIFIER_COOKIE)?.value;
  const cookieProvider = jar.get(PROVIDER_COOKIE)?.value as ProviderKey | undefined;
  const next = safeNext(jar.get(NEXT_COOKIE)?.value);

  if (error) {
    logAudit(null, "auth.oidc.callback.idp_error", "session", {
      meta: { provider: providerKey, error },
    });
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, req.url),
    );
    clearOidcCookies(res);
    return res;
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    logAudit(null, "auth.oidc.callback.bad_state", "session", { meta: { provider: providerKey } });
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }

  if (providerKey !== cookieProvider) {
    logAudit(null, "auth.oidc.callback.provider_mismatch", "session", {
      meta: { url: providerKey, cookie: cookieProvider },
    });
    return NextResponse.json({ error: "provider mismatch" }, { status: 400 });
  }

  const provider = getProvider(providerKey);
  if (!provider) {
    return NextResponse.json({ error: `unknown provider: ${providerKey}` }, { status: 400 });
  }
  if (!codeVerifier) {
    return NextResponse.json({ error: "missing PKCE verifier" }, { status: 400 });
  }

  try {
    const tokens = await exchangeCode(provider, code, codeVerifier);
    const claims = await verifyIdToken(tokens.id_token, provider, expectedNonce);
    const user = mapClaimsToUser(claims, provider);
    const session = await signSession(user);

    logAudit(user, "auth.oidc.callback.ok", "session", {
      resourceId: user.sub,
      meta: { provider: provider.key },
    });

    const res = NextResponse.redirect(new URL(next, req.url));
    const proto =
      req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    const secure = proto === "https";
    res.cookies.set(SESSION_COOKIE, session, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    clearOidcCookies(res);
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "callback failed";
    logAudit(null, "auth.oidc.callback.error", "session", {
      meta: { provider: providerKey, error: message },
    });
    const res = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, req.url),
    );
    clearOidcCookies(res);
    return res;
  }
}
