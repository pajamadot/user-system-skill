/**
 * RBAC Enforcement E2E Tests
 *
 * Verifies that role-based access control is correctly enforced
 * at both the organization and project levels.
 */

import { test, expect } from "./fixtures";

test.describe("RBAC — Organization Level", () => {
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let orgId: string;

  test.beforeAll(async ({ authUtils }) => {
    ownerToken = await authUtils.getTestUserToken("owner");
    adminToken = await authUtils.getTestUserToken("admin");
    memberToken = await authUtils.getTestUserToken("member");
    orgId = await authUtils.getTestOrgId();
  });

  test("owner can manage org settings", async ({ api }) => {
    const res = await api.patch(`/v1/orgs/${orgId}`, { name: "Owner Updated" }, ownerToken);
    expect(res.status).toBe(200);
  });

  test("admin can manage members", async ({ api }) => {
    const res = await api.get(`/v1/orgs/${orgId}/members`, adminToken);
    expect(res.status).toBe(200);
  });

  test("admin cannot delete org", async ({ api }) => {
    const res = await api.delete(`/v1/orgs/${orgId}`, adminToken);
    expect(res.status).toBe(403);
  });

  test("member can list members (read)", async ({ api }) => {
    const res = await api.get(`/v1/orgs/${orgId}/members`, memberToken);
    expect(res.status).toBe(200);
  });

  test("member cannot add members", async ({ api }) => {
    const res = await api.post(
      `/v1/orgs/${orgId}/members`,
      { userId: "someone", role: "member" },
      memberToken,
    );
    expect(res.status).toBe(403);
  });

  test("member cannot update org", async ({ api }) => {
    const res = await api.patch(`/v1/orgs/${orgId}`, { name: "Nope" }, memberToken);
    expect(res.status).toBe(403);
  });
});

test.describe("RBAC — Project Level", () => {
  let adminToken: string;
  let editorToken: string;
  let viewerToken: string;
  let projectId: string;

  test.beforeAll(async ({ authUtils }) => {
    adminToken = await authUtils.getTestUserToken("admin");
    editorToken = await authUtils.getTestUserToken("editor");
    viewerToken = await authUtils.getTestUserToken("viewer");
    projectId = await authUtils.getTestProjectId();
  });

  // Admin
  test("admin can manage project members", async ({ api }) => {
    const res = await api.post(
      `/v1/projects/${projectId}/members`,
      { userId: "someone", role: "viewer" },
      adminToken,
    );
    expect([200, 201]).toContain(res.status);
  });

  // Editor
  test("editor can update project", async ({ api }) => {
    const res = await api.patch(
      `/v1/projects/${projectId}`,
      { description: "editor updated" },
      editorToken,
    );
    expect(res.status).toBe(200);
  });

  test("editor cannot manage members", async ({ api }) => {
    const res = await api.post(
      `/v1/projects/${projectId}/members`,
      { userId: "someone", role: "viewer" },
      editorToken,
    );
    expect(res.status).toBe(403);
  });

  test("editor cannot delete project", async ({ api }) => {
    const res = await api.delete(`/v1/projects/${projectId}`, editorToken);
    expect(res.status).toBe(403);
  });

  // Viewer
  test("viewer can read project", async ({ api }) => {
    const res = await api.get(`/v1/projects/${projectId}`, viewerToken);
    expect(res.status).toBe(200);
  });

  test("viewer cannot update project", async ({ api }) => {
    const res = await api.patch(
      `/v1/projects/${projectId}`,
      { name: "nope" },
      viewerToken,
    );
    expect(res.status).toBe(403);
  });

  test("viewer cannot delete project", async ({ api }) => {
    const res = await api.delete(`/v1/projects/${projectId}`, viewerToken);
    expect(res.status).toBe(403);
  });

  // Unauthenticated
  test("unauthenticated request is rejected", async ({ api }) => {
    const res = await api.get(`/v1/projects/${projectId}`);
    expect(res.status).toBe(401);
  });
});
