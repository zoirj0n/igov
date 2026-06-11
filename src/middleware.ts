import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/oidc",
  "/api/auth/providers",
  "/api/health",
  "/api/internal/access-log",
];
const ADMIN_PATHS = ["/admin", "/api/admin"];
/**
 * GET paths under /api/admin/* that are intentionally readable by any logged-in
 * user (provider chip, freshness widget, etc.). Mutating verbs still admin-only
 * — enforced by the route handler.
 */
const ADMIN_READABLE_GET_PATHS = ["/api/admin/llm"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAdmin(pathname: string): boolean {
  return ADMIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function genNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/=+$/, "");
}

function applySecurityHeaders(res: NextResponse, nonce: string, isDev: boolean): void {
  res.headers.set("x-nonce", nonce);

  const scriptSrc = isDev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob:`,
    `media-src 'self' blob:`,
    `connect-src 'self'`,
    `worker-src 'self' blob:`,
    `form-action 'self'`,
    "upgrade-insecure-requests",
  ].join("; ");

  res.headers.set("content-security-policy", csp);
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // microphone=(self): the voice assistant (chat dock + agent dictation) captures
  // audio first-party; camera and geolocation stay fully denied.
  res.headers.set("permissions-policy", "camera=(), microphone=(self), geolocation=()");
  res.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
}

function emitAccessLog(req: NextRequest, reqId: string, actorHint: string): void {
  const url = req.nextUrl;
  // Skip the noisy internal forwarder + Next internals
  if (
    url.pathname.startsWith("/_next") ||
    url.pathname.startsWith("/api/internal/access-log") ||
    url.pathname.startsWith("/icon.svg") ||
    url.pathname.startsWith("/favicon")
  )
    return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    kind: "access",
    reqId,
    method: req.method,
    path: url.pathname + (url.search || ""),
    actorHint,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "—",
    ua: (req.headers.get("user-agent") ?? "").slice(0, 40),
    referer: req.headers.get("referer") ?? undefined,
  });
  console.log(line);
  if (process.env.ACCESS_LOG_FORWARD === "true") {
    const forwardUrl = new URL("/api/internal/access-log", url.origin);
    fetch(forwardUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: line,
    }).catch(() => {});
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = genNonce();
  const isDev = process.env.NODE_ENV !== "production";
  const reqId = globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}`;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", reqId);

  if (isPublic(pathname)) {
    emitAccessLog(req, reqId, "public");
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("x-request-id", reqId);
    applySecurityHeaders(res, nonce, isDev);
    return res;
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifySession(token) : null;
  emitAccessLog(req, reqId, claims?.sub ?? "anon");

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      applySecurityHeaders(res, nonce, isDev);
      return res;
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res, nonce, isDev);
    return res;
  }

  const isReadableAdminGet =
    req.method === "GET" && ADMIN_READABLE_GET_PATHS.some((p) => pathname === p);

  if (isAdmin(pathname) && claims.role !== "admin" && !isReadableAdminGet) {
    if (pathname.startsWith("/api/")) {
      const res = NextResponse.json({ error: "forbidden" }, { status: 403 });
      applySecurityHeaders(res, nonce, isDev);
      return res;
    }
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    const res = NextResponse.redirect(url);
    applySecurityHeaders(res, nonce, isDev);
    return res;
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("x-user-sub", claims.sub);
  res.headers.set("x-user-role", claims.role);
  res.headers.set("x-user-clearance", claims.clearance);
  res.headers.set("x-request-id", reqId);
  applySecurityHeaders(res, nonce, isDev);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.well-known|apple-touch-icon.*|icons/.*|screenshots/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|avif)$).*)",
  ],
};
