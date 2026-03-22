import type { OrgRole, ProjectRole, AccessLevel } from "../types";

// ─── Organization Policies ──────────────────────────────────────────

export function canManageOrgSettings(role: OrgRole): boolean {
  return role === "owner";
}

export function canManageOrgMembers(role: OrgRole): boolean {
  return role === "owner" || role === "admin";
}

export function canDeleteOrg(role: OrgRole): boolean {
  return role === "owner";
}

// ─── Project Policies ───────────────────────────────────────────────

export function canManageProjectMembers(
  orgRole: OrgRole | null,
  projectRole: ProjectRole | null,
): boolean {
  if (orgRole === "owner" || orgRole === "admin") return true;
  return projectRole === "admin";
}

export function canWriteProject(
  orgRole: OrgRole | null,
  projectRole: ProjectRole | null,
): boolean {
  if (orgRole === "owner" || orgRole === "admin") return true;
  return projectRole === "admin" || projectRole === "editor";
}

export function canDeleteProject(
  orgRole: OrgRole | null,
  projectRole: ProjectRole | null,
): boolean {
  if (orgRole === "owner" || orgRole === "admin") return true;
  return projectRole === "admin";
}

export function getProjectAccessLevel(
  orgRole: OrgRole | null,
  projectRole: ProjectRole | null,
): AccessLevel {
  if (orgRole === "owner" || orgRole === "admin") return "admin";
  if (projectRole === "admin") return "admin";
  if (projectRole === "editor") return "write";
  if (projectRole === "viewer" || orgRole === "member") return "read";
  return "none";
}

// ─── MCP Tool Permissions ───────────────────────────────────────────

const TOOL_PERMISSIONS: Record<string, string[]> = {
  list_files: ["files:read"],
  get_file: ["files:read"],
  search: ["project:read"],
  get_project_info: ["project:read"],
  create_file: ["files:write"],
  update_file: ["files:write"],
  delete_file: ["files:write", "files:delete"],
  manage_members: ["project:admin"],
  update_settings: ["project:admin"],
};

export function checkToolPermission(tool: string, tokenScopes: string[]): boolean {
  const required = TOOL_PERMISSIONS[tool];
  if (!required) return false; // Unknown tool = deny
  return required.every((scope) => tokenScopes.includes(scope));
}

// ─── API Token Scope Checks ─────────────────────────────────────────

export function hasScope(tokenScopes: string[], requiredScope: string): boolean {
  return tokenScopes.includes(requiredScope) || tokenScopes.includes("admin");
}

export function canReadWithScopes(scopes: string[]): boolean {
  return hasScope(scopes, "read") || hasScope(scopes, "write");
}

export function canWriteWithScopes(scopes: string[]): boolean {
  return hasScope(scopes, "write");
}
