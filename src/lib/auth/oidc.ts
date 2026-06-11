import type { AuthUser, Clearance, Role } from "./types";

export type ProviderKey = "uae-pass" | "entra";

export interface OidcProvider {
  key: ProviderKey;
  label: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  redirectUri: string;
}

interface DiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  issuer: string;
  end_session_endpoint?: string;
}

interface Jwk {
  kty: string;
  kid: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  x?: string;
  y?: string;
  crv?: string;
}

const DISCOVERY_CACHE = new Map<string, { ts: number; doc: DiscoveryDocument }>();
const JWKS_CACHE = new Map<string, { ts: number; keys: Jwk[] }>();
const TTL_MS = 60 * 60 * 1000;

export function configuredProviders(): OidcProvider[] {
  const out: OidcProvider[] = [];
  const baseRedirect = process.env.OIDC_REDIRECT_BASE_URL ?? "http://localhost:3001";
  if (
    process.env.UAE_PASS_CLIENT_ID &&
    process.env.UAE_PASS_CLIENT_SECRET &&
    process.env.UAE_PASS_ISSUER
  ) {
    out.push({
      key: "uae-pass",
      label: "UAE PASS",
      issuer: process.env.UAE_PASS_ISSUER,
      clientId: process.env.UAE_PASS_CLIENT_ID,
      clientSecret: process.env.UAE_PASS_CLIENT_SECRET,
      scope: process.env.UAE_PASS_SCOPE ?? "openid profile email urn:uae:digitalid:profile:general",
      redirectUri: `${baseRedirect}/api/auth/oidc/callback?provider=uae-pass`,
    });
  }
  if (
    process.env.ENTRA_CLIENT_ID &&
    process.env.ENTRA_CLIENT_SECRET &&
    process.env.ENTRA_TENANT_ID
  ) {
    out.push({
      key: "entra",
      label: "Microsoft Entra",
      issuer: `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0`,
      clientId: process.env.ENTRA_CLIENT_ID,
      clientSecret: process.env.ENTRA_CLIENT_SECRET,
      scope: process.env.ENTRA_SCOPE ?? "openid profile email offline_access",
      redirectUri: `${baseRedirect}/api/auth/oidc/callback?provider=entra`,
    });
  }
  return out;
}

export function getProvider(key: ProviderKey): OidcProvider | undefined {
  return configuredProviders().find((p) => p.key === key);
}

export async function discover(provider: OidcProvider): Promise<DiscoveryDocument> {
  const cached = DISCOVERY_CACHE.get(provider.issuer);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.doc;
  const url = `${provider.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const doc = (await res.json()) as DiscoveryDocument;
  DISCOVERY_CACHE.set(provider.issuer, { ts: Date.now(), doc });
  return doc;
}

async function getJwks(jwksUri: string): Promise<Jwk[]> {
  const cached = JWKS_CACHE.get(jwksUri);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.keys;
  const res = await fetch(jwksUri, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const json = (await res.json()) as { keys?: Jwk[] };
  const keys = json.keys ?? [];
  JWKS_CACHE.set(jwksUri, { ts: Date.now(), keys });
  return keys;
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const norm = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function genRandomB64(byteLength: number): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return b64urlEncode(buf);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", ENCODER.encode(verifier));
  return b64urlEncode(new Uint8Array(hash));
}

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  roles?: string[];
  groups?: string[];
  amr?: string[];
  [key: string]: unknown;
}

export async function verifyIdToken(
  idToken: string,
  provider: OidcProvider,
  expectedNonce?: string,
): Promise<IdTokenClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const header = JSON.parse(DECODER.decode(b64urlDecode(headerB64))) as {
    kid?: string;
    alg?: string;
  };
  if (header.alg !== "RS256") throw new Error(`unsupported alg: ${header.alg}`);

  const doc = await discover(provider);
  const keys = await getJwks(doc.jwks_uri);
  const jwk = keys.find((k) => k.kid === header.kid) ?? keys[0];
  if (!jwk) throw new Error("no matching JWK");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const data = ENCODER.encode(`${headerB64}.${payloadB64}`);
  const sigBytes = b64urlDecode(sigB64);
  const sigBuf = sigBytes.buffer.slice(
    sigBytes.byteOffset,
    sigBytes.byteOffset + sigBytes.byteLength,
  ) as ArrayBuffer;
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBuf, data);
  if (!valid) throw new Error("invalid id_token signature");

  const claims = JSON.parse(DECODER.decode(b64urlDecode(payloadB64))) as IdTokenClaims;
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) throw new Error("id_token expired");
  if (claims.iss !== provider.issuer && claims.iss !== doc.issuer) {
    throw new Error(`issuer mismatch: ${claims.iss}`);
  }
  const audOk = Array.isArray(claims.aud)
    ? claims.aud.includes(provider.clientId)
    : claims.aud === provider.clientId;
  if (!audOk) throw new Error(`audience mismatch: ${JSON.stringify(claims.aud)}`);
  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw new Error("nonce mismatch");
  }
  return claims;
}

export interface TokenResponse {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

export async function exchangeCode(
  provider: OidcProvider,
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const doc = await discover(provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: provider.redirectUri,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code_verifier: codeVerifier,
  });
  const res = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`token exchange ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

export function mapClaimsToUser(claims: IdTokenClaims, _provider: OidcProvider): AuthUser {
  const email =
    (claims.email as string | undefined) ?? (claims.preferred_username as string | undefined) ?? "";
  const name =
    (claims.name as string | undefined) ??
    [claims.given_name, claims.family_name].filter(Boolean).join(" ").trim() ??
    email.split("@")[0] ??
    "OIDC User";
  const role = claimsToRole(claims);
  const clearance = claimsToClearance(claims);
  const user: AuthUser = {
    sub: claims.sub,
    email,
    name: name.length > 0 ? name : "OIDC User",
    role,
    clearance,
  };
  const deptInfo = applyDepartmentFromClaims(claims, user);
  if (deptInfo) {
    user.departmentId = deptInfo.id;
    user.departmentSource = "sso";
  }
  return user;
}

function applyDepartmentFromClaims(
  claims: IdTokenClaims,
  user: AuthUser,
): { id: string; raw: string } | null {
  const raw = readDeptClaim(claims);
  if (!raw) return null;
  try {
    type DepartmentsModule = typeof import("@/services/policy/departments");
    type UserDeptModule = typeof import("@/services/policy/user-departments");
    const { upsertDepartmentByName } =
      require("@/services/policy/departments") as DepartmentsModule;
    const { recordSsoDepartment } = require("@/services/policy/user-departments") as UserDeptModule;
    const dept = upsertDepartmentByName(raw, `sso:${user.email}`);
    const rec = recordSsoDepartment(user.sub, dept.id, `sso:${user.email}`);
    return { id: rec.departmentId, raw };
  } catch (err) {
    console.error("[oidc] dept upsert failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

function readDeptClaim(claims: IdTokenClaims): string | null {
  const keys = ["department", "dept", "department_id", "org_unit"] as const;
  for (const k of keys) {
    const v = (claims as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function claimsToRole(claims: IdTokenClaims): Role {
  const roles = (claims.roles as string[] | undefined) ?? [];
  const groups = (claims.groups as string[] | undefined) ?? [];
  const all = [...roles, ...groups].map((s) => s.toLowerCase());
  if (all.some((r) => r.includes("admin"))) return "admin";
  if (all.some((r) => r.includes("executive") || r.includes("minister"))) return "executive";
  if (all.some((r) => r.includes("lead") || r.includes("manager"))) return "lead";
  if (all.some((r) => r.includes("analyst"))) return "analyst";
  return "viewer";
}

function claimsToClearance(claims: IdTokenClaims): Clearance {
  const tag = (claims as { clearance?: string }).clearance;
  if (tag === "public" || tag === "internal" || tag === "confidential" || tag === "secret")
    return tag;
  return "internal";
}

export const STATE_COOKIE = "ci_oidc_state";
export const VERIFIER_COOKIE = "ci_oidc_verifier";
export const NONCE_COOKIE = "ci_oidc_nonce";
export const PROVIDER_COOKIE = "ci_oidc_provider";
export const NEXT_COOKIE = "ci_oidc_next";
