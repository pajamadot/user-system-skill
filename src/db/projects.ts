import { sql } from "./client";
import type { Project, ProjectMember, ProjectRole } from "../types";

// ─── Project CRUD ───────────────────────────────────────────────────

export async function createProject(data: {
  orgId: string;
  name: string;
  slug?: string;
  description?: string;
}): Promise<Project> {
  const [project] = await sql<Project[]>`
    INSERT INTO projects (org_id, name, slug, description)
    VALUES (${data.orgId}, ${data.name}, ${data.slug ?? null}, ${data.description ?? null})
    RETURNING *
  `;
  return project;
}

export async function getProjectById(id: string): Promise<Project | null> {
  const [project] = await sql<Project[]>`SELECT * FROM projects WHERE id = ${id} AND deleted_at IS NULL`;
  return project ?? null;
}

export async function listProjectsForUser(userId: string): Promise<Project[]> {
  return sql<Project[]>`
    SELECT DISTINCT p.* FROM projects p
    LEFT JOIN org_members om ON om.org_id = p.org_id AND om.user_id = ${userId}
    LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ${userId}
    WHERE p.deleted_at IS NULL AND (om.user_id IS NOT NULL OR pm.user_id IS NOT NULL)
    ORDER BY p.created_at DESC
  `;
}

export async function listProjectsInOrg(orgId: string): Promise<Project[]> {
  return sql<Project[]>`
    SELECT * FROM projects WHERE org_id = ${orgId} AND deleted_at IS NULL ORDER BY created_at DESC
  `;
}

export async function updateProject(id: string, data: { name?: string; slug?: string; description?: string }): Promise<Project | null> {
  const [project] = await sql<Project[]>`
    UPDATE projects SET
      name = COALESCE(${data.name ?? null}, name),
      slug = COALESCE(${data.slug ?? null}, slug),
      description = COALESCE(${data.description ?? null}, description),
      updated_at = NOW()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  return project ?? null;
}

export async function softDeleteProject(id: string): Promise<boolean> {
  const result = await sql`UPDATE projects SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`;
  return result.count > 0;
}

// ─── Project Members ────────────────────────────────────────────────

export async function addProjectMember(projectId: string, userId: string, role: ProjectRole, invitedBy?: string): Promise<ProjectMember> {
  const [member] = await sql<ProjectMember[]>`
    INSERT INTO project_members (project_id, user_id, role, invited_by_user_id)
    VALUES (${projectId}, ${userId}, ${role}, ${invitedBy ?? null})
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
    RETURNING *
  `;
  return member;
}

export async function getProjectMember(projectId: string, userId: string): Promise<ProjectMember | null> {
  const [member] = await sql<ProjectMember[]>`
    SELECT * FROM project_members WHERE project_id = ${projectId} AND user_id = ${userId}
  `;
  return member ?? null;
}

export async function listProjectMembers(projectId: string): Promise<(ProjectMember & { email: string; display_name: string | null })[]> {
  return sql`
    SELECT pm.*, u.email, u.display_name FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ${projectId}
    ORDER BY pm.created_at
  `;
}

export async function updateProjectMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<ProjectMember | null> {
  const [member] = await sql<ProjectMember[]>`
    UPDATE project_members SET role = ${role}, updated_at = NOW()
    WHERE project_id = ${projectId} AND user_id = ${userId}
    RETURNING *
  `;
  return member ?? null;
}

export async function removeProjectMember(projectId: string, userId: string): Promise<boolean> {
  const result = await sql`DELETE FROM project_members WHERE project_id = ${projectId} AND user_id = ${userId}`;
  return result.count > 0;
}
