import { CLEARANCE_RANK, ROLE_RANK, canRead, hasRole } from "@/lib/auth/types";
import type { AuthUser } from "@/lib/auth/types";
import { describe, expect, it } from "vitest";

function user(clearance: AuthUser["clearance"], role: AuthUser["role"] = "analyst"): AuthUser {
  return { sub: "x", email: "x@x.ae", name: "X", role, clearance };
}

describe("clearance gating", () => {
  it("internal can read internal + public", () => {
    const u = user("internal");
    expect(canRead(u, "public")).toBe(true);
    expect(canRead(u, "internal")).toBe(true);
    expect(canRead(u, "confidential")).toBe(false);
    expect(canRead(u, "secret")).toBe(false);
  });

  it("confidential can read up to confidential", () => {
    const u = user("confidential");
    expect(canRead(u, "public")).toBe(true);
    expect(canRead(u, "internal")).toBe(true);
    expect(canRead(u, "confidential")).toBe(true);
    expect(canRead(u, "secret")).toBe(false);
  });

  it("secret reads everything", () => {
    const u = user("secret");
    expect(canRead(u, "public")).toBe(true);
    expect(canRead(u, "internal")).toBe(true);
    expect(canRead(u, "confidential")).toBe(true);
    expect(canRead(u, "secret")).toBe(true);
  });

  it("public reads only public", () => {
    const u = user("public");
    expect(canRead(u, "public")).toBe(true);
    expect(canRead(u, "internal")).toBe(false);
  });
});

describe("role hierarchy", () => {
  it("admin >= all roles", () => {
    const u = user("internal", "admin");
    expect(hasRole(u, "viewer")).toBe(true);
    expect(hasRole(u, "lead")).toBe(true);
    expect(hasRole(u, "executive")).toBe(true);
    expect(hasRole(u, "admin")).toBe(true);
  });
  it("viewer < everything but viewer", () => {
    const u = user("public", "viewer");
    expect(hasRole(u, "viewer")).toBe(true);
    expect(hasRole(u, "analyst")).toBe(false);
    expect(hasRole(u, "admin")).toBe(false);
  });
  it("rank ordering", () => {
    expect(CLEARANCE_RANK.secret).toBeGreaterThan(CLEARANCE_RANK.confidential);
    expect(CLEARANCE_RANK.confidential).toBeGreaterThan(CLEARANCE_RANK.internal);
    expect(CLEARANCE_RANK.internal).toBeGreaterThan(CLEARANCE_RANK.public);
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.executive);
  });
});
