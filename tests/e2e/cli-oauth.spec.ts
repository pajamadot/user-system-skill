/**
 * CLI OAuth E2E Tests
 *
 * Tests the device code flow, API token management, and token refresh
 * for CLI / headless authentication.
 */

import { test, expect } from "./fixtures";

const API_BASE = process.env.API_BASE_URL || "http://localhost:8080";

test.describe("Device Code Flow", () => {
  test("request device code returns user_code and verification_uri", async () => {
    const res = await fetch(`${API_BASE}/v1/auth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "test-cli", scope: "read write" }),
    });

    // 200 if implemented, 404 if not yet
    if (res.status === 404) { test.skip(true, "Device code endpoint not implemented"); return; }

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.device_code).toBeTruthy();
    expect(data.user_code).toBeTruthy();
    expect(data.verification_uri).toBeTruthy();
    expect(data.expires_in).toBeGreaterThan(0);
    expect(data.interval).toBeGreaterThan(0);

    // User code should be human-readable format
    expect(data.user_code).toMatch(/^[A-Z0-9-]{4,12}$/);
  });

  test("polling before approval returns authorization_pending", async () => {
    // First, request a device code
    const codeRes = await fetch(`${API_BASE}/v1/auth/device/code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "test-cli", scope: "read" }),
    });

    if (codeRes.status === 404) { test.skip(true, "Device code endpoint not implemented"); return; }

    const { device_code } = await codeRes.json();

    // Poll for token — should be pending
    const tokenRes = await fetch(`${API_BASE}/v1/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code,
        client_id: "test-cli",
      }),
    });

    expect(tokenRes.status).toBe(400);
    const error = await tokenRes.json();
    expect(error.error).toBe("authorization_pending");
  });

  test("expired device code is rejected", async () => {
    const tokenRes = await fetch(`${API_BASE}/v1/auth/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: "nonexistent-expired-code",
        client_id: "test-cli",
      }),
    });

    if (tokenRes.status === 404) { test.skip(true, "Device code endpoint not implemented"); return; }

    expect([400, 401]).toContain(tokenRes.status);
    const error = await tokenRes.json();
    expect(["expired_token", "invalid_grant"]).toContain(error.error);
  });
});

test.describe("API Token Management", () => {
  let authToken: string;

  test.beforeAll(async ({ authUtils }) => {
    authToken = await authUtils.getTestUserToken();
  });

  test("create API token", async ({ api }) => {
    const res = await api.post(
      "/v1/auth/tokens",
      { name: "E2E Test Token", scopes: ["read", "write"] },
      authToken,
    );

    // 201 if implemented, 404 if not yet
    if (res.status === 404) { test.skip(true, "API token endpoint not implemented"); return; }

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.token).toBeTruthy(); // Full token (shown only once)
    expect(data.id).toBeTruthy();
    expect(data.name).toBe("E2E Test Token");
    expect(data.token_prefix).toBeTruthy(); // e.g., "sk_live_a1b2"
  });

  test("list API tokens (does not expose full token)", async ({ api }) => {
    const res = await api.get("/v1/auth/tokens", authToken);
    if (res.status === 404) { test.skip(true, "API token endpoint not implemented"); return; }

    expect(res.status).toBe(200);
    const tokens = await res.json();
    expect(Array.isArray(tokens)).toBe(true);

    // Full token should never appear in list
    for (const t of tokens) {
      expect(t.token).toBeUndefined();
      expect(t.token_hash).toBeUndefined();
      expect(t.token_prefix).toBeTruthy();
    }
  });

  test("authenticate with API token", async ({ api }) => {
    // Create a token first
    const createRes = await api.post(
      "/v1/auth/tokens",
      { name: "Auth Test Token", scopes: ["read"] },
      authToken,
    );
    if (createRes.status === 404) { test.skip(true, "API token endpoint not implemented"); return; }

    const { token: apiKey } = await createRes.json();

    // Use it to call a protected endpoint
    const profileRes = await api.get("/v1/auth/profile", apiKey);
    expect(profileRes.status).toBe(200);
  });

  test("revoke API token", async ({ api }) => {
    // Create
    const createRes = await api.post(
      "/v1/auth/tokens",
      { name: "Revoke Test", scopes: ["read"] },
      authToken,
    );
    if (createRes.status === 404) { test.skip(true, "API token endpoint not implemented"); return; }

    const { id, token: apiKey } = await createRes.json();

    // Revoke
    const revokeRes = await api.delete(`/v1/auth/tokens/${id}`, authToken);
    expect(revokeRes.status).toBe(200);

    // Verify revoked token no longer works
    const profileRes = await api.get("/v1/auth/profile", apiKey);
    expect(profileRes.status).toBe(401);
  });

  test("API token respects scope limits", async ({ api }) => {
    // Create read-only token
    const createRes = await api.post(
      "/v1/auth/tokens",
      { name: "Read Only", scopes: ["read"] },
      authToken,
    );
    if (createRes.status === 404) { test.skip(true, "API token endpoint not implemented"); return; }

    const { token: readToken } = await createRes.json();

    // Read should work
    const readRes = await api.get("/v1/orgs", readToken);
    expect(readRes.status).toBe(200);

    // Write should be denied
    const writeRes = await api.post("/v1/orgs", { name: "Nope" }, readToken);
    expect(writeRes.status).toBe(403);
  });
});

test.describe("Token Refresh", () => {
  test("refresh token returns new access token", async () => {
    // This depends on your auth provider's refresh mechanism
    // Clerk uses session tokens that auto-refresh; other providers use refresh_token grant
    const refreshToken = process.env.E2E_TEST_REFRESH_TOKEN;
    if (!refreshToken) { test.skip(true, "E2E_TEST_REFRESH_TOKEN not set"); return; }

    const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (res.status === 404) { test.skip(true, "Refresh endpoint not implemented"); return; }

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.access_token).toBeTruthy();
    expect(data.expires_in).toBeGreaterThan(0);
  });
});
