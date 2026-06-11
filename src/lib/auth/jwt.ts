import type { AuthUser, JwtClaims } from "./types";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlEncodeStr(s: string): string {
  return b64urlEncode(ENCODER.encode(s));
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const norm = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.JWT_SECRET ?? "dev-only-jwt-secret-change-me-min-32-chars";
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const TTL_SECONDS = 60 * 60 * 8;

export async function signSession(user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: JwtClaims = { ...user, iat: now, exp: now + TTL_SECONDS };
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64urlEncodeStr(JSON.stringify(header));
  const payloadB64 = b64urlEncodeStr(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(signingInput));
  return `${signingInput}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(token: string): Promise<JwtClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await getKey();
  const sigBytes = b64urlDecode(sigB64);
  const sigBuf = sigBytes.buffer.slice(
    sigBytes.byteOffset,
    sigBytes.byteOffset + sigBytes.byteLength,
  ) as ArrayBuffer;
  const valid = await crypto.subtle.verify("HMAC", key, sigBuf, ENCODER.encode(signingInput));
  if (!valid) return null;
  try {
    const claims = JSON.parse(DECODER.decode(b64urlDecode(payloadB64))) as JwtClaims;
    if (typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "ci_session";
export const SESSION_MAX_AGE = TTL_SECONDS;
