import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { verifyClerkJWT } from "../services/auth";
import { validateApiToken } from "../db/tokens";
import * as usersDb from "../db/users";
import * as orgsDb from "../db/orgs";
import type { CurrentUser } from "../types";

// Hono env bindings
export type Env = {
  Variables: {
    user: CurrentUser;
  };
};

/**
 * Auth middleware: verifies Bearer token (Clerk JWT or API key),
 * auto-syncs user to local DB, attaches user context.
 */
export const authMiddleware = createMiddleware<Env>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  // Try API key first (starts with sk_)
  if (token.startsWith("sk_")) {
    const apiToken = await validateApiToken(token);
    if (!apiToken) return c.json({ error: "Invalid or expired API key" }, 401);

    const user = await usersDb.getUserById(apiToken.user_id);
    if (!user) return c.json({ error: "User not found" }, 401);

    c.set("user", {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      authProviderId: user.auth_provider_id,
    });
    return next();
  }

  // Otherwise, verify as Clerk JWT
  try {
    const claims = await verifyClerkJWT(token);
    const currentUser = await ensureLocalUser({
      authProviderId: claims.sub,
      email: claims.email || claims.sub,
      displayName: claims.name || null,
    });

    c.set("user", currentUser);
    return next();
  } catch (err: any) {
    return c.json({ error: "Invalid token", detail: err.message }, 401);
  }
});

/**
 * Auto-sync: ensure auth provider user exists locally.
 * Handles: first login, email-based linking, new user creation.
 */
async function ensureLocalUser(data: {
  authProviderId: string;
  email: string;
  displayName: string | null;
}): Promise<CurrentUser> {
  // 1. Try by auth_provider_id
  let user = await usersDb.getUserByAuthProviderId(data.authProviderId);
  if (user) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      authProviderId: user.auth_provider_id,
    };
  }

  // 2. Try by email (pre-existing account)
  user = await usersDb.getUserByEmail(data.email);
  if (user) {
    await usersDb.linkAuthProvider(user.id, data.authProviderId);
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      authProviderId: data.authProviderId,
    };
  }

  // 3. Create new user + default org
  user = await usersDb.upsertUser({
    authProviderId: data.authProviderId,
    email: data.email,
    displayName: data.displayName,
  });

  const org = await orgsDb.createOrganization({
    name: `${data.displayName || data.email}'s Workspace`,
    ownerUserId: user.id,
  });
  await orgsDb.addOrgMember(org.id, user.id, "owner");

  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    authProviderId: user.auth_provider_id,
  };
}
