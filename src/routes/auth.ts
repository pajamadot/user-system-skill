import { Hono } from "hono";
import type { Env } from "../middleware/auth";
import { mintServiceJWT } from "../services/auth";
import * as orgsDb from "../db/orgs";
import * as projectsDb from "../db/projects";
import * as tokensDb from "../db/tokens";

const auth = new Hono<Env>();

// GET /v1/auth/profile
auth.get("/profile", (c) => {
  const user = c.get("user");
  return c.json({
    user_id: user.id,
    email: user.email,
    display_name: user.displayName,
  });
});

// POST /v1/auth/token — exchange Clerk JWT for scoped service token
auth.post("/token", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ audience: string; scopes: string[]; project_id?: string }>();

  if (!body.audience || !body.scopes?.length) {
    return c.json({ error: "audience and scopes are required" }, 400);
  }

  // If project_id specified, verify user has access
  if (body.project_id) {
    const project = await projectsDb.getProjectById(body.project_id);
    if (!project) return c.json({ error: "Project not found" }, 404);

    const orgMember = await orgsDb.getOrgMember(project.org_id, user.id);
    if (!orgMember) return c.json({ error: "Not a member of this project's organization" }, 403);
  }

  // Find user's first org as tenant_id
  const orgs = await orgsDb.listOrganizationsForUser(user.id);
  const tenantId = orgs[0]?.id || user.id;

  const token = mintServiceJWT({
    userId: user.id,
    tenantId,
    audience: body.audience,
    scopes: body.scopes,
    projectId: body.project_id,
  });

  const expiry = parseInt(process.env.JWT_EXPIRY_SECONDS || "900", 10);

  return c.json({
    token,
    token_type: "Bearer",
    expires_at: new Date(Date.now() + expiry * 1000).toISOString(),
  });
});

// POST /v1/auth/onboarding
auth.post("/onboarding", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ org_name: string; project_name?: string }>();

  if (!body.org_name) return c.json({ error: "org_name is required" }, 400);

  const org = await orgsDb.createOrganization({
    name: body.org_name,
    ownerUserId: user.id,
  });
  await orgsDb.addOrgMember(org.id, user.id, "owner");

  let project = null;
  if (body.project_name) {
    project = await projectsDb.createProject({
      orgId: org.id,
      name: body.project_name,
    });
  }

  return c.json({
    tenant_id: org.id,
    user_id: user.id,
    project_id: project?.id || null,
    message: "Onboarding complete",
  }, 201);
});

// ─── API Token Management ───────────────────────────────────────────

// POST /v1/auth/tokens
auth.post("/tokens", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ name: string; scopes: string[]; org_id?: string; expires_in_days?: number }>();

  if (!body.name || !body.scopes?.length) {
    return c.json({ error: "name and scopes are required" }, 400);
  }

  const { row, plainToken } = await tokensDb.createApiToken({
    userId: user.id,
    orgId: body.org_id,
    name: body.name,
    scopes: body.scopes,
    expiresInDays: body.expires_in_days,
  });

  return c.json({
    id: row.id,
    name: row.name,
    token_prefix: row.token_prefix,
    token: plainToken, // Only shown once
    scopes: row.scopes,
    expires_at: row.expires_at,
    created_at: row.created_at,
  }, 201);
});

// GET /v1/auth/tokens
auth.get("/tokens", async (c) => {
  const user = c.get("user");
  const tokens = await tokensDb.listApiTokensForUser(user.id);
  return c.json(tokens);
});

// DELETE /v1/auth/tokens/:id
auth.delete("/tokens/:id", async (c) => {
  const user = c.get("user");
  const ok = await tokensDb.revokeApiToken(c.req.param("id"), user.id);
  if (!ok) return c.json({ error: "Token not found or already revoked" }, 404);
  return c.json({ message: "Token revoked" });
});

// ─── Device Code Flow ───────────────────────────────────────────────

// POST /v1/auth/device/code (no auth required)
auth.post("/device/code", async (c) => {
  const body = await c.req.json<{ client_id: string; scope?: string }>();
  if (!body.client_id) return c.json({ error: "client_id is required" }, 400);

  const scopes = body.scope?.split(" ") || ["read"];
  const dc = await tokensDb.createDeviceCode(body.client_id, scopes);

  return c.json({
    device_code: dc.device_code,
    user_code: dc.user_code,
    verification_uri: `${process.env.APP_URL || "http://localhost:3000"}/device`,
    verification_uri_complete: `${process.env.APP_URL || "http://localhost:3000"}/device?code=${dc.user_code}`,
    expires_in: 900,
    interval: 5,
  });
});

// POST /v1/auth/device/approve (requires auth — user approves in browser)
auth.post("/device/approve", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{ user_code: string }>();
  if (!body.user_code) return c.json({ error: "user_code is required" }, 400);

  const ok = await tokensDb.approveDeviceCode(body.user_code, user.id);
  if (!ok) return c.json({ error: "Invalid or expired code" }, 400);

  return c.json({ message: "Device authorized" });
});

// POST /v1/auth/device/token (no auth — CLI polls this)
auth.post("/device/token", async (c) => {
  const body = await c.req.json<{ grant_type: string; device_code: string; client_id: string }>();

  const dc = await tokensDb.getDeviceCode(body.device_code);
  if (!dc || dc.client_id !== body.client_id) {
    return c.json({ error: "invalid_grant", error_description: "Invalid device code" }, 400);
  }

  if (dc.expires_at < new Date()) {
    return c.json({ error: "expired_token", error_description: "Device code expired" }, 400);
  }

  if (dc.status === "pending") {
    return c.json({ error: "authorization_pending" }, 400);
  }

  if (dc.status === "used") {
    return c.json({ error: "invalid_grant", error_description: "Code already used" }, 400);
  }

  if (dc.status === "approved" && dc.user_id) {
    await tokensDb.markDeviceCodeUsed(body.device_code);

    // Mint an API token for the CLI
    const { row, plainToken } = await tokensDb.createApiToken({
      userId: dc.user_id,
      name: `CLI (${dc.client_id})`,
      scopes: dc.scopes,
    });

    return c.json({
      access_token: plainToken,
      token_type: "Bearer",
      expires_in: row.expires_at ? Math.floor((row.expires_at.getTime() - Date.now()) / 1000) : null,
      scope: dc.scopes.join(" "),
    });
  }

  return c.json({ error: "server_error" }, 500);
});

export default auth;
