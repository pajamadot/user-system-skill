import { Hono } from "hono";
import type { Env } from "../middleware/auth";
import * as projectsDb from "../db/projects";
import * as orgsDb from "../db/orgs";
import { canWriteProject, canDeleteProject, canManageProjectMembers, getProjectAccessLevel } from "../services/rbac";
import type { ProjectRole } from "../types";

const projects = new Hono<Env>();

// POST /v1/projects
projects.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ org_id: string; name: string; slug?: string; description?: string }>();

  if (!body.org_id || !body.name) {
    return c.json({ error: "org_id and name are required" }, 400);
  }

  const orgMember = await orgsDb.getOrgMember(body.org_id, user.id);
  if (!orgMember) return c.json({ error: "Not a member of this organization" }, 403);

  const project = await projectsDb.createProject({
    orgId: body.org_id,
    name: body.name,
    slug: body.slug,
    description: body.description,
  });

  // Creator becomes project admin
  await projectsDb.addProjectMember(project.id, user.id, "admin");

  return c.json(project, 201);
});

// GET /v1/projects
projects.get("/", async (c) => {
  const user = c.get("user");
  const list = await projectsDb.listProjectsForUser(user.id);
  return c.json(list);
});

// GET /v1/projects/:id
projects.get("/:id", async (c) => {
  const user = c.get("user");
  const project = await projectsDb.getProjectById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
  const projMember = await projectsDb.getProjectMember(project.id, user.id);
  const access = getProjectAccessLevel(orgMember?.role ?? null, projMember?.role ?? null);

  if (access === "none") return c.json({ error: "Access denied" }, 403);

  return c.json(project);
});

// PATCH /v1/projects/:id
projects.patch("/:id", async (c) => {
  const user = c.get("user");
  const project = await projectsDb.getProjectById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
  const projMember = await projectsDb.getProjectMember(project.id, user.id);

  if (!canWriteProject(orgMember?.role ?? null, projMember?.role ?? null)) {
    return c.json({ error: "Insufficient permissions to update this project" }, 403);
  }

  const body = await c.req.json<{ name?: string; slug?: string; description?: string }>();
  const updated = await projectsDb.updateProject(project.id, body);
  return c.json(updated);
});

// DELETE /v1/projects/:id
projects.delete("/:id", async (c) => {
  const user = c.get("user");
  const project = await projectsDb.getProjectById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
  const projMember = await projectsDb.getProjectMember(project.id, user.id);

  if (!canDeleteProject(orgMember?.role ?? null, projMember?.role ?? null)) {
    return c.json({ error: "Insufficient permissions to delete this project" }, 403);
  }

  await projectsDb.softDeleteProject(project.id);
  return c.json({ message: "Project deleted" });
});

// ─── Project Members ────────────────────────────────────────────────

projects.get("/:id/members", async (c) => {
  const user = c.get("user");
  const project = await projectsDb.getProjectById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
  const projMember = await projectsDb.getProjectMember(project.id, user.id);
  const access = getProjectAccessLevel(orgMember?.role ?? null, projMember?.role ?? null);
  if (access === "none") return c.json({ error: "Access denied" }, 403);

  const members = await projectsDb.listProjectMembers(project.id);
  return c.json(members);
});

projects.post("/:id/members", async (c) => {
  const user = c.get("user");
  const project = await projectsDb.getProjectById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
  const projMember = await projectsDb.getProjectMember(project.id, user.id);

  if (!canManageProjectMembers(orgMember?.role ?? null, projMember?.role ?? null)) {
    return c.json({ error: "Insufficient permissions to manage project members" }, 403);
  }

  const body = await c.req.json<{ user_id: string; role: ProjectRole }>();
  if (!body.user_id || !body.role) return c.json({ error: "user_id and role are required" }, 400);

  const member = await projectsDb.addProjectMember(project.id, body.user_id, body.role, user.id);
  return c.json(member, 201);
});

projects.patch("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const project = await projectsDb.getProjectById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
  const projMember = await projectsDb.getProjectMember(project.id, user.id);

  if (!canManageProjectMembers(orgMember?.role ?? null, projMember?.role ?? null)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const body = await c.req.json<{ role: ProjectRole }>();
  const updated = await projectsDb.updateProjectMemberRole(project.id, c.req.param("userId"), body.role);
  if (!updated) return c.json({ error: "Member not found" }, 404);

  return c.json(updated);
});

projects.delete("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const project = await projectsDb.getProjectById(c.req.param("id"));
  if (!project) return c.json({ error: "Project not found" }, 404);

  const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
  const projMember = await projectsDb.getProjectMember(project.id, user.id);

  if (!canManageProjectMembers(orgMember?.role ?? null, projMember?.role ?? null)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const ok = await projectsDb.removeProjectMember(project.id, c.req.param("userId"));
  if (!ok) return c.json({ error: "Member not found" }, 404);

  return c.json({ message: "Member removed" });
});

export default projects;
