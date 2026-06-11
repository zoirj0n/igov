import { signSession, verifySession } from "@/lib/auth/jwt";
import type { AuthUser } from "@/lib/auth/types";
import { describe, expect, it } from "vitest";

const sample: AuthUser = {
  sub: "u-test",
  email: "test@example.ae",
  name: "Test User",
  role: "analyst",
  clearance: "internal",
};

describe("jwt round-trip", () => {
  it("signs then verifies", async () => {
    const token = await signSession(sample);
    expect(token.split(".").length).toBe(3);
    const claims = await verifySession(token);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe(sample.sub);
    expect(claims?.email).toBe(sample.email);
    expect(claims?.role).toBe(sample.role);
    expect(claims?.clearance).toBe(sample.clearance);
    expect(typeof claims?.iat).toBe("number");
    expect(typeof claims?.exp).toBe("number");
    expect((claims?.exp ?? 0) - (claims?.iat ?? 0)).toBeGreaterThan(60 * 60);
  });

  it("rejects tampered signature", async () => {
    const token = await signSession(sample);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.AAAA${(parts[2] ?? "").slice(4)}`;
    const claims = await verifySession(tampered);
    expect(claims).toBeNull();
  });

  it("rejects malformed token", async () => {
    expect(await verifySession("not.a.jwt")).toBeNull();
    expect(await verifySession("noperiods")).toBeNull();
    expect(await verifySession("")).toBeNull();
  });

  it("rejects modified payload", async () => {
    const token = await signSession(sample);
    const parts = token.split(".");
    const evil = { ...sample, role: "admin" };
    const evilB64 = Buffer.from(JSON.stringify({ ...evil, iat: 1, exp: 9_999_999_999 })).toString(
      "base64url",
    );
    const tampered = `${parts[0]}.${evilB64}.${parts[2]}`;
    const claims = await verifySession(tampered);
    expect(claims).toBeNull();
  });
});
