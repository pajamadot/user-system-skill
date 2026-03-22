// ─── Database Row Types ─────────────────────────────────────────────

export interface User {
  id: string;
  auth_provider_id: string | null;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface Organization {
  id: string;
  auth_provider_org_id: string | null;
  slug: string | null;
  name: string;
  owner_user_id: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export type OrgRole = "owner" | "admin" | "member";

export interface OrgMember {
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: Date;
}

export interface Project {
  id: string;
  org_id: string;
  slug: string | null;
  name: string;
  description: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date | null;
}

export type ProjectRole = "admin" | "editor" | "viewer";

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  invited_by_user_id: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export interface ApiToken {
  id: string;
  user_id: string;
  org_id: string | null;
  name: string;
  token_prefix: string;
  token_hash: string;
  scopes: string[];
  last_used_at: Date | null;
  last_used_ip: string | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

export type DeviceCodeStatus = "pending" | "approved" | "used" | "expired";

export interface DeviceCode {
  device_code: string;
  user_code: string;
  client_id: string;
  scopes: string[];
  status: DeviceCodeStatus;
  user_id: string | null;
  expires_at: Date;
  created_at: Date;
}

// ─── Auth Context ───────────────────────────────────────────────────

export interface AuthContext {
  userId: string;
  email: string;
  displayName: string | null;
  authProviderId: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  authProviderId: string | null;
}

export interface ServiceTokenPayload {
  sub: string;
  tenant_id: string;
  project_id?: string;
  aud: string;
  scopes: string[];
  iss: string;
  iat: number;
  exp: number;
}

// ─── API Request/Response Types ─────────────────────────────────────

export interface CreateOrgInput {
  name: string;
  slug?: string;
}

export interface UpdateOrgInput {
  name?: string;
  slug?: string;
}

export interface CreateProjectInput {
  org_id: string;
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  slug?: string;
  description?: string;
}

export interface AddMemberInput {
  user_id: string;
  role: string;
}

export interface CreateTokenInput {
  name: string;
  scopes: string[];
  org_id?: string;
  expires_in_days?: number;
}

export interface TokenExchangeInput {
  audience: string;
  scopes: string[];
  project_id?: string;
}

export interface OnboardingInput {
  org_name: string;
  project_name?: string;
}

// ─── Access Level ───────────────────────────────────────────────────

export type AccessLevel = "admin" | "write" | "read" | "none";
