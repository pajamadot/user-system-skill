import crypto from "crypto";
import { sql } from "./client";
import type { ApiToken, DeviceCode } from "../types";

// ─── API Tokens ─────────────────────────────────────────────────────

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const token = `sk_${crypto.randomBytes(32).toString("base64url")}`;
  const prefix = token.slice(0, 12);
  const hash = hashToken(token);
  return { token, prefix, hash };
}

export async function createApiToken(data: {
  userId: string;
  orgId?: string;
  name: string;
  scopes: string[];
  expiresInDays?: number;
}): Promise<{ row: ApiToken; plainToken: string }> {
  const { token, prefix, hash } = generateApiToken();
  const expiresAt = data.expiresInDays
    ? new Date(Date.now() + data.expiresInDays * 86400_000)
    : null;

  const [row] = await sql<ApiToken[]>`
    INSERT INTO api_tokens (user_id, org_id, name, token_prefix, token_hash, scopes, expires_at)
    VALUES (${data.userId}, ${data.orgId ?? null}, ${data.name}, ${prefix}, ${hash}, ${sql.array(data.scopes)}, ${expiresAt})
    RETURNING *
  `;
  return { row, plainToken: token };
}

export async function validateApiToken(token: string): Promise<ApiToken | null> {
  const hash = hashToken(token);
  const prefix = token.slice(0, 12);

  const [row] = await sql<ApiToken[]>`
    SELECT * FROM api_tokens
    WHERE token_prefix = ${prefix} AND token_hash = ${hash}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  if (!row) return null;

  // Update last_used_at
  await sql`UPDATE api_tokens SET last_used_at = NOW() WHERE id = ${row.id}`;
  return row;
}

export async function listApiTokensForUser(userId: string): Promise<Omit<ApiToken, "token_hash">[]> {
  return sql`
    SELECT id, user_id, org_id, name, token_prefix, scopes, last_used_at, last_used_ip, expires_at, revoked_at, created_at
    FROM api_tokens WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
}

export async function revokeApiToken(id: string, userId: string): Promise<boolean> {
  const result = await sql`
    UPDATE api_tokens SET revoked_at = NOW() WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL
  `;
  return result.count > 0;
}

// ─── Device Codes ───────────────────────────────────────────────────

export async function createDeviceCode(clientId: string, scopes: string[]): Promise<DeviceCode> {
  const deviceCode = crypto.randomBytes(32).toString("hex");
  const userCode = crypto.randomBytes(4).toString("hex").toUpperCase().replace(/(.{4})(.{4})/, "$1-$2");
  const expiresAt = new Date(Date.now() + 900_000); // 15 minutes

  const [row] = await sql<DeviceCode[]>`
    INSERT INTO device_codes (device_code, user_code, client_id, scopes, expires_at)
    VALUES (${deviceCode}, ${userCode}, ${clientId}, ${sql.array(scopes)}, ${expiresAt})
    RETURNING *
  `;
  return row;
}

export async function getDeviceCode(deviceCode: string): Promise<DeviceCode | null> {
  const [row] = await sql<DeviceCode[]>`SELECT * FROM device_codes WHERE device_code = ${deviceCode}`;
  return row ?? null;
}

export async function getDeviceCodeByUserCode(userCode: string): Promise<DeviceCode | null> {
  const [row] = await sql<DeviceCode[]>`SELECT * FROM device_codes WHERE user_code = ${userCode} AND status = 'pending'`;
  return row ?? null;
}

export async function approveDeviceCode(userCode: string, userId: string): Promise<boolean> {
  const result = await sql`
    UPDATE device_codes SET status = 'approved', user_id = ${userId}
    WHERE user_code = ${userCode} AND status = 'pending' AND expires_at > NOW()
  `;
  return result.count > 0;
}

export async function markDeviceCodeUsed(deviceCode: string): Promise<boolean> {
  const result = await sql`
    UPDATE device_codes SET status = 'used' WHERE device_code = ${deviceCode} AND status = 'approved'
  `;
  return result.count > 0;
}
