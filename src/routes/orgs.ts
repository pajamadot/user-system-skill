import { Hono } from "hono";
import type { Env } from "../middleware/auth";
import * as orgsDb from "../db/orgs";
import { canManageOrgMembers, canManageOrgSettings, canDeleteOrg } from "../services/rbac";
import type { OrgRole } from "../types";

const orgs = new Hono<Env>();

// POST /v1/orgs
orgs.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name: string; slug?: string }>();
  if (!body.name) return c.json({ error: "name is required" }, 400);

  const org = await orgsDb.createOrganization({
    name: body.name,
    slug: body.slug,
    ownerUserId: user.id,
  });
  await orgsDb.addOrgMember(org.id, user.id, "owner");

  return c.json(org, 201);
});

// GET /v1/orgs
orgs.get("/", async (c) => {
  const user = c.get("user");
  const list = await orgsDb.listOrganizationsForUser(user.id);
  return c.json(list);
});

// GET /v1/orgs/:id
orgs.get("/:id", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member) return c.json({ error: "Not a member of this organization" }, 403);

  const org = await orgsDb.getOrganizationById(orgId);
  if (!org) return c.json({ error: "Organization not found" }, 404);

  return c.json(org);
});

// PATCH /v1/orgs/:id
orgs.patch("/:id", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");
  const body = await c.req.json<{ name?: string; slug?: string }>();

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member || !canManageOrgSettings(member.role)) {
    return c.json({ error: "Only the owner can update organization settings" }, 403);
  }

  const org = await orgsDb.updateOrganization(orgId, body);
  if (!org) return c.json({ error: "Organization not found" }, 404);

  return c.json(org);
});

// DELETE /v1/orgs/:id
orgs.delete("/:id", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member || !canDeleteOrg(member.role)) {
    return c.json({ error: "Only the owner can delete the organization" }, 403);
  }

  const ok = await orgsDb.deleteOrganization(orgId);
  if (!ok) return c.json({ error: "Organization not found" }, 404);

  return c.json({ message: "Organization deleted" });
});

// ─── Members ────────────────────────────────────────────────────────

// GET /v1/orgs/:id/members
orgs.get("/:id/members", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member) return c.json({ error: "Not a member of this organization" }, 403);

  const members = await orgsDb.listOrgMembers(orgId);
  return c.json(members);
});

// POST /v1/orgs/:id/members
orgs.post("/:id/members", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");
  const body = await c.req.json<{ user_id: string; role: OrgRole }>();

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member || !canManageOrgMembers(member.role)) {
    return c.json({ error: "Insufficient permissions to manage members" }, 403);
  }

  if (!body.user_id || !body.role) {
    return c.json({ error: "user_id and role are required" }, 400);
  }

  const newMember = await orgsDb.addOrgMember(orgId, body.user_id, body.role);
  return c.json(newMember, 201);
});

// PATCH /v1/orgs/:id/members/:userId
orgs.patch("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");
  const targetUserId = c.req.param("userId");
  const body = await c.req.json<{ role: OrgRole }>();

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member || !canManageOrgMembers(member.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Prevent demoting last owner
  const target = await orgsDb.getOrgMember(orgId, targetUserId);
  if (target?.role === "owner" && body.role !== "owner") {
    const ownerCount = await orgsDb.getOrgOwnerCount(orgId);
    if (ownerCount <= 1) {
      return c.json({ error: "Cannot demote the last owner. Transfer ownership first." }, 400);
    }
  }

  const updated = await orgsDb.updateOrgMemberRole(orgId, targetUserId, body.role);
  if (!updated) return c.json({ error: "Member not found" }, 404);

  return c.json(updated);
});

// DELETE /v1/orgs/:id/members/:userId
orgs.delete("/:id/members/:userId", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");
  const targetUserId = c.req.param("userId");

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member || !canManageOrgMembers(member.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Prevent removing last owner
  const target = await orgsDb.getOrgMember(orgId, targetUserId);
  if (target?.role === "owner") {
    const ownerCount = await orgsDb.getOrgOwnerCount(orgId);
    if (ownerCount <= 1) {
      return c.json({ error: "Cannot remove the last owner. Transfer ownership first." }, 400);
    }
  }

  const ok = await orgsDb.removeOrgMember(orgId, targetUserId);
  if (!ok) return c.json({ error: "Member not found" }, 404);

  return c.json({ message: "Member removed" });
});

// ─── Invites (placeholder — delegates to Clerk Organizations API) ──

orgs.post("/:id/invites", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");
  const body = await c.req.json<{ email: string; role: string }>();

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member || !canManageOrgMembers(member.role)) {
    return c.json({ error: "Insufficient permissions to invite" }, 403);
  }

  // In production: call Clerk Organizations API to create invitation
  // const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  // const invitation = await clerk.organizations.createOrganizationInvitation(...)
  // For now, return a placeholder

  return c.json({
    id: `inv_${Date.now()}`,
    email: body.email,
    role: body.role,
    status: "pending",
    message: "Invitation created (wire up Clerk Organizations API for production)",
  }, 201);
});

orgs.get("/:id/invites", async (c) => {
  const user = c.get("user");
  const orgId = c.req.param("id");

  const member = await orgsDb.getOrgMember(orgId, user.id);
  if (!member || !canManageOrgMembers(member.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // In production: call Clerk Organizations API to list invitations
  return c.json([]);
});

export default orgs;
