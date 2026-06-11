import type { AuthUser } from "./types";

interface SeedUser extends AuthUser {
  password: string;
}

export const SEED_USERS: SeedUser[] = [
  {
    sub: "u-1",
    email: "analyst@example.ae",
    password: "demo",
    name: "Aisha Al Falasi",
    role: "analyst",
    clearance: "internal",
  },
  {
    sub: "u-2",
    email: "lead@example.ae",
    password: "demo",
    name: "Layla Mansoori",
    role: "lead",
    clearance: "confidential",
  },
  {
    sub: "u-3",
    email: "exec@example.ae",
    password: "demo",
    name: "H.E. Khalifa",
    role: "executive",
    clearance: "secret",
  },
  {
    sub: "u-4",
    email: "admin@example.ae",
    password: "demo",
    name: "Operator One",
    role: "admin",
    clearance: "secret",
  },
];

export function authenticate(email: string, password: string): AuthUser | null {
  const u = SEED_USERS.find(
    (s) => s.email.toLowerCase() === email.toLowerCase() && s.password === password,
  );
  if (!u) return null;
  const { password: _pw, ...safe } = u;
  return safe;
}
