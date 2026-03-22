import jwt from "jsonwebtoken";
import type { ServiceTokenPayload } from "../types";

// ─── JWKS Cache ─────────────────────────────────────────────────────

interface JWKSCache {
  keys: any[];
  fetchedAt: number;
}

let jwksCache: JWKSCache | null = null;
const JWKS_CACHE_TTL = 3600_000; // 1 hour

async function getJWKS(): Promise<any[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL) {
    return jwksCache.keys;
  }

  const jwksUrl = process.env.CLERK_JWKS_URL;
  if (!jwksUrl) throw new Error("CLERK_JWKS_URL not configured");

  const res = await fetch(jwksUrl);
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);

  const data = (await res.json()) as { keys: any[] };
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

// ─── Clerk JWT Verification ─────────────────────────────────────────

export async function verifyClerkJWT(token: string): Promise<{
  sub: string;
  email?: string;
  name?: string;
  [key: string]: any;
}> {
  // Decode header to find kid
  const headerB64 = token.split(".")[0];
  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());

  const keys = await getJWKS();
  const key = keys.find((k: any) => k.kid === header.kid);
  if (!key) throw new Error("No matching key found in JWKS");

  // Convert JWK to PEM
  const { createPublicKey } = await import("crypto");
  const publicKey = createPublicKey({ key, format: "jwk" });

  const payload = jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
  }) as any;

  return payload;
}

// ─── Service JWT Minting ────────────────────────────────────────────

const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY;
const JWT_PUBLIC_KEY = process.env.JWT_PUBLIC_KEY;
const JWT_EXPIRY = parseInt(process.env.JWT_EXPIRY_SECONDS || "900", 10);

export function mintServiceJWT(data: {
  userId: string;
  tenantId: string;
  audience: string;
  scopes: string[];
  projectId?: string;
}): string {
  if (!JWT_PRIVATE_KEY) throw new Error("JWT_PRIVATE_KEY not configured");

  const payload: Omit<ServiceTokenPayload, "iat" | "exp"> = {
    sub: data.userId,
    tenant_id: data.tenantId,
    aud: data.audience,
    scopes: data.scopes,
    iss: "user-system",
    ...(data.projectId && { project_id: data.projectId }),
  };

  return jwt.sign(payload, JWT_PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: JWT_EXPIRY,
  });
}

export function verifyServiceJWT(token: string, expectedAudience?: string): ServiceTokenPayload {
  // In test mode, accept HMAC-signed service JWTs too
  const isTest = process.env.NODE_ENV === "test";
  const testSecret = process.env.TEST_JWT_SECRET || "test-secret-do-not-use-in-production";

  if (isTest) {
    try {
      const payload = jwt.verify(token, testSecret, {
        algorithms: ["HS256"],
        ...(expectedAudience && { audience: expectedAudience }),
      }) as ServiceTokenPayload;
      return payload;
    } catch {
      // Fall through to RS256
    }
  }

  if (!JWT_PUBLIC_KEY) throw new Error("JWT_PUBLIC_KEY not configured");

  const payload = jwt.verify(token, JWT_PUBLIC_KEY, {
    algorithms: ["RS256"],
    ...(expectedAudience && { audience: expectedAudience }),
  }) as ServiceTokenPayload;

  return payload;
}

// ─── Test JWT (HMAC, for integration tests without Clerk) ───────────

const TEST_JWT_SECRET = process.env.TEST_JWT_SECRET || "test-secret-do-not-use-in-production";

export function mintTestJWT(data: { sub: string; email: string; name?: string }): string {
  return jwt.sign(
    { sub: data.sub, email: data.email, name: data.name || null, iss: "test" },
    TEST_JWT_SECRET,
    { algorithm: "HS256", expiresIn: "1h" },
  );
}

export function verifyTestJWT(token: string): { sub: string; email: string; name?: string } {
  return jwt.verify(token, TEST_JWT_SECRET, { algorithms: ["HS256"] }) as any;
}

export function mintTestServiceJWT(data: {
  sub: string;
  tenantId: string;
  audience: string;
  scopes: string[];
  projectId?: string;
  expiresIn?: number;
}): string {
  return jwt.sign(
    {
      sub: data.sub,
      tenant_id: data.tenantId,
      aud: data.audience,
      scopes: data.scopes,
      iss: "user-system",
      ...(data.projectId && { project_id: data.projectId }),
    },
    TEST_JWT_SECRET,
    { algorithm: "HS256", expiresIn: data.expiresIn || 900 },
  );
}
