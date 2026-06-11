export type Role = "viewer" | "analyst" | "lead" | "executive" | "admin";
export type Clearance = "public" | "internal" | "confidential" | "secret";

export type DepartmentSource = "sso" | "admin";

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
  clearance: Clearance;
  departmentId?: string;
  departmentSource?: DepartmentSource;
}

export interface JwtClaims extends AuthUser {
  iat: number;
  exp: number;
}

export const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  analyst: 1,
  lead: 2,
  executive: 3,
  admin: 4,
};

export const CLEARANCE_RANK: Record<Clearance, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  secret: 3,
};

export function canRead(user: AuthUser, required: Clearance): boolean {
  return CLEARANCE_RANK[user.clearance] >= CLEARANCE_RANK[required];
}

/** Where each role lands after sign-in (no deep link): executives go straight
 *  to the Strategic Advisor — their one-command surface; everyone else gets
 *  the dashboard. */
export function landingFor(role: Role | undefined): string {
  return role === "executive" ? "/agent" : "/dashboard";
}

export function hasRole(user: AuthUser, required: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[required];
}
