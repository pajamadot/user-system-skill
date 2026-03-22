/**
 * Token Exchange E2E Tests
 *
 * Tests exchanging an auth JWT for scoped service tokens.
 */

import { test, expect } from "./fixtures";

test.describe("Token Exchange", () => {
  let authToken: string;

  test.beforeAll(async ({ authUtils }) => {
    authToken = await authUtils.getTestUserToken();
  });

  test("exchange auth token for service token with audience", async ({ api }) => {
    const res = await api.post(
      "/v1/auth/token",
      { audience: "file-worker", scopes: ["files:read"] },
      authToken,
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.token).toBeTruthy();
    expect(data.expires_at).toBeTruthy();
    expect(data.token_type).toBe("Bearer");
  });

  test("exchange without auth token is rejected", async ({ api }) => {
    const res = await api.post("/v1/auth/token", {
      audience: "file-worker",
      scopes: ["files:read"],
    });
    expect(res.status).toBe(401);
  });

  test("exchange with project scope", async ({ api }) => {
    const res = await api.post(
      "/v1/auth/token",
      {
        audience: "mcp-service",
        scopes: ["project:read", "project:write"],
        project_id: "test-project-id",
      },
      authToken,
    );

    // 200 if project exists and user has access, 403/404 otherwise
    expect([200, 403, 404]).toContain(res.status);
  });
});
