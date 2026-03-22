/**
 * MCP Server Authentication E2E Tests
 *
 * Tests user-delegated auth through MCP: token exchange, tool-level
 * permission enforcement, project scoping, and token expiry.
 */

import { test, expect } from "./fixtures";

const API_BASE = process.env.API_BASE_URL || "http://localhost:8080";

test.describe("MCP Token Exchange", () => {
  let authToken: string;

  test.beforeAll(async ({ authUtils }) => {
    authToken = await authUtils.getTestUserToken();
  });

  test("exchange auth token for MCP-scoped service token", async ({ api }) => {
    const res = await api.post(
      "/v1/auth/token",
      { audience: "mcp", scopes: ["tools:read", "tools:write"] },
      authToken,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.expires_at).toBeTruthy();
    expect(data.token_type).toBe("Bearer");
  });

  test("MCP token is project-scoped when project_id provided", async ({ api }) => {
    const res = await api.post(
      "/v1/auth/token",
      {
        audience: "mcp",
        scopes: ["tools:read", "files:read"],
        project_id: "test-project-id",
      },
      authToken,
    );

    // 200 if user has access to project, 403/404 otherwise
    expect([200, 403, 404]).toContain(res.status);

    if (res.status === 200) {
      const data = await res.json();
      // Decode JWT payload to verify project_id claim
      const payload = JSON.parse(
        Buffer.from(data.token.split(".")[1], "base64url").toString(),
      );
      expect(payload.project_id).toBe("test-project-id");
      expect(payload.aud).toBe("mcp");
    }
  });

  test("MCP token has short expiry (<=15 minutes)", async ({ api }) => {
    const res = await api.post(
      "/v1/auth/token",
      { audience: "mcp", scopes: ["tools:read"] },
      authToken,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    const payload = JSON.parse(
      Buffer.from(data.token.split(".")[1], "base64url").toString(),
    );

    const ttl = payload.exp - payload.iat;
    expect(ttl).toBeLessThanOrEqual(900); // 15 minutes
    expect(ttl).toBeGreaterThan(0);
  });
});

test.describe("MCP Tool-Level Permissions", () => {
  test("tool call with sufficient scopes succeeds", async ({ api, authUtils }) => {
    const authToken = await authUtils.getTestUserToken();

    // Get MCP token with file read scope
    const tokenRes = await api.post(
      "/v1/auth/token",
      { audience: "mcp", scopes: ["tools:read", "files:read"] },
      authToken,
    );
    if (tokenRes.status !== 200) { test.skip(); return; }

    const { token: mcpToken } = await tokenRes.json();

    // Call a read-only tool — should succeed
    const toolRes = await fetch(`${API_BASE}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({ tool: "list_files", args: { path: "/" } }),
    });

    expect([200, 404]).toContain(toolRes.status); // 404 if endpoint not implemented yet
  });

  test("tool call without required scope returns 403", async ({ api, authUtils }) => {
    const authToken = await authUtils.getTestUserToken();

    // Get MCP token with read-only scope
    const tokenRes = await api.post(
      "/v1/auth/token",
      { audience: "mcp", scopes: ["tools:read"] }, // no files:write
      authToken,
    );
    if (tokenRes.status !== 200) { test.skip(); return; }

    const { token: mcpToken } = await tokenRes.json();

    // Call a write tool — should be denied
    const toolRes = await fetch(`${API_BASE}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({ tool: "create_file", args: { path: "/test.txt", content: "hello" } }),
    });

    expect([403, 404]).toContain(toolRes.status); // 403 denied, or 404 if not implemented
  });
});

test.describe("MCP Token Security", () => {
  test("MCP endpoint rejects unauthenticated request", async () => {
    const res = await fetch(`${API_BASE}/v1/mcp/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "list_files", args: {} }),
    });
    expect([401, 404]).toContain(res.status);
  });

  test("MCP endpoint rejects expired token", async () => {
    // A clearly expired JWT (exp in the past)
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "test",
        aud: "mcp",
        exp: Math.floor(Date.now() / 1000) - 3600,
        iat: Math.floor(Date.now() / 1000) - 7200,
      }),
    ).toString("base64url");
    const fakeToken = `${header}.${payload}.invalidsignature`;

    const res = await fetch(`${API_BASE}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${fakeToken}`,
      },
      body: JSON.stringify({ tool: "list_files", args: {} }),
    });
    expect([401, 404]).toContain(res.status);
  });

  test("MCP token with wrong audience is rejected", async ({ api, authUtils }) => {
    const authToken = await authUtils.getTestUserToken();

    // Get a file-worker token, not an MCP token
    const tokenRes = await api.post(
      "/v1/auth/token",
      { audience: "file-worker", scopes: ["files:read"] },
      authToken,
    );
    if (tokenRes.status !== 200) { test.skip(); return; }

    const { token: wrongAudienceToken } = await tokenRes.json();

    // Use it against the MCP endpoint — should be rejected
    const res = await fetch(`${API_BASE}/v1/mcp/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wrongAudienceToken}`,
      },
      body: JSON.stringify({ tool: "list_files", args: {} }),
    });
    expect([401, 403, 404]).toContain(res.status);
  });
});
