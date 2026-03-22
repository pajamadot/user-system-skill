import { sql } from "./client";
import type { Organization, OrgMember, OrgRole } from "../types";

// ─── Organization CRUD ──────────────────────────────────────────────

export async function createOrganization(data: {
  name: string;
  slug?: string;
  ownerUserId: string;
  authProviderOrgId?: string;
}): Promise<Organization> {
  const [org] = await sql<Organization[]>`
    INSERT INTO organizations (name, slug, owner_user_id, auth_provider_org_id)
    VALUES (${data.name}, ${data.slug ?? null}, ${data.ownerUserId}, ${data.authProviderOrgId ?? null})
    RETURNING *
  `;
  return org;
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const [org] = await sql<Organization[]>`SELECT * FROM organizations WHERE id = ${id}`;
  return org ?? null;
}

export async function listOrganizationsForUser(userId: string): Promise<Organization[]> {
  return sql<Organization[]>`
    SELECT o.* FROM organizations o
    JOIN org_members om ON om.org_id = o.id
    WHERE om.user_id = ${userId}
    ORDER BY o.created_at DESC
  `;
}

export async function updateOrganization(id: string, data: { name?: string; slug?: string }): Promise<Organization | null> {
  const [org] = await sql<Organization[]>`
    UPDATE organizations SET
      name = COALESCE(${data.name ?? null}, name),
      slug = COALESCE(${data.slug ?? null}, slug),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return org ?? null;
}

export async function deleteOrganization(id: string): Promise<boolean> {
  const result = await sql`DELETE FROM organizations WHERE id = ${id}`;
  return result.count > 0;
}

// ─── Organization Members ───────────────────────────────────────────

export async function addOrgMember(orgId: string, userId: string, role: OrgRole): Promise<OrgMember> {
  const [member] = await sql<OrgMember[]>`
    INSERT INTO org_members (org_id, user_id, role)
    VALUES (${orgId}, ${userId}, ${role})
    ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
    RETURNING *
  `;
  return member;
}

export async function getOrgMember(orgId: string, userId: string): Promise<OrgMember | null> {
  const [member] = await sql<OrgMember[]>`
    SELECT * FROM org_members WHERE org_id = ${orgId} AND user_id = ${userId}
  `;
  return member ?? null;
}

export async function listOrgMembers(orgId: string): Promise<(OrgMember & { email: string; display_name: string | null })[]> {
  return sql`
    SELECT om.*, u.email, u.display_name FROM org_members om
    JOIN users u ON u.id = om.user_id
    WHERE om.org_id = ${orgId}
    ORDER BY om.created_at
  `;
}

export async function updateOrgMemberRole(orgId: string, userId: string, role: OrgRole): Promise<OrgMember | null> {
  const [member] = await sql<OrgMember[]>`
    UPDATE org_members SET role = ${role} WHERE org_id = ${orgId} AND user_id = ${userId} RETURNING *
  `;
  return member ?? null;
}

export async function removeOrgMember(orgId: string, userId: string): Promise<boolean> {
  const result = await sql`DELETE FROM org_members WHERE org_id = ${orgId} AND user_id = ${userId}`;
  return result.count > 0;
}

export async function getOrgOwnerCount(orgId: string): Promise<number> {
  const [row] = await sql<[{ count: string }]>`
    SELECT COUNT(*) as count FROM org_members WHERE org_id = ${orgId} AND role = 'owner'
  `;
  return parseInt(row.count, 10);
}
