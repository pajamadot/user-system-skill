import { sql } from "./client";
import type { User } from "../types";

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`;
  return user ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE email = ${email.trim().toLowerCase()}`;
  return user ?? null;
}

export async function getUserByAuthProviderId(authProviderId: string): Promise<User | null> {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE auth_provider_id = ${authProviderId}`;
  return user ?? null;
}

export async function upsertUser(data: {
  authProviderId: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<User> {
  const email = data.email.trim().toLowerCase();
  const [user] = await sql<User[]>`
    INSERT INTO users (auth_provider_id, email, display_name, avatar_url)
    VALUES (${data.authProviderId}, ${email}, ${data.displayName ?? null}, ${data.avatarUrl ?? null})
    ON CONFLICT (auth_provider_id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
      updated_at = NOW()
    RETURNING *
  `;
  return user;
}

export async function linkAuthProvider(userId: string, authProviderId: string): Promise<void> {
  await sql`UPDATE users SET auth_provider_id = ${authProviderId}, updated_at = NOW() WHERE id = ${userId}`;
}

export async function softDeleteUserByAuthProviderId(authProviderId: string): Promise<void> {
  // We don't hard-delete — just unlink the auth provider
  await sql`UPDATE users SET auth_provider_id = NULL, updated_at = NOW() WHERE auth_provider_id = ${authProviderId}`;
}
