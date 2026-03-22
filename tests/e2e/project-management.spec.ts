/**
 * Project Management E2E Tests
 *
 * Tests project CRUD and member management within an organization.
 */

import { test, expect } from "./fixtures";

test.describe("Project Management", () => {
  let token: string;
  let orgId: string;

  test.beforeAll(async ({ authUtils }) => {
    token = await authUtils.getTestUserToken();
    orgId = await authUtils.getTestOrgId();
  });

  test("create project in organization", async ({ api }) => {
    const slug = `test-project-${Date.now()}`;
    const res = await api.post(
      "/v1/projects",
      { orgId, name: "Test Project", slug },
      token,
    );
    expect(res.status).toBe(201);

    const project = await res.json();
    expect(project.name).toBe("Test Project");
    expect(project.slug).toBe(slug);
  });

  test("list projects includes created project", async ({ api }) => {
    const slug = `list-project-${Date.now()}`;
    await api.post(
      "/v1/projects",
      { orgId, name: "List Test", slug },
      token,
    );

    const res = await api.get("/v1/projects", token);
    expect(res.status).toBe(200);

    const projects = await res.json();
    expect(projects.some((p: any) => p.slug === slug)).toBe(true);
  });

  test("update project", async ({ api }) => {
    const slug = `update-project-${Date.now()}`;
    const created = await (
      await api.post("/v1/projects", { orgId, name: "Before", slug }, token)
    ).json();

    const res = await api.patch(
      `/v1/projects/${created.id}`,
      { name: "After", description: "Updated description" },
      token,
    );
    expect(res.status).toBe(200);
  });

  test("soft-delete project hides it from list", async ({ api }) => {
    const slug = `delete-project-${Date.now()}`;
    const created = await (
      await api.post("/v1/projects", { orgId, name: "To Delete", slug }, token)
    ).json();

    const res = await api.delete(`/v1/projects/${created.id}`, token);
    expect(res.status).toBe(200);

    const list = await (await api.get("/v1/projects", token)).json();
    expect(list.some((p: any) => p.id === created.id)).toBe(false);
  });

  test("add and remove project member", async ({ api }) => {
    const slug = `member-project-${Date.now()}`;
    const project = await (
      await api.post("/v1/projects", { orgId, name: "Member Test", slug }, token)
    ).json();

    // Add member
    const addRes = await api.post(
      `/v1/projects/${project.id}/members`,
      { userId: "test-member-id", role: "editor" },
      token,
    );
    expect(addRes.status).toBe(201);

    // List members
    const listRes = await api.get(`/v1/projects/${project.id}/members`, token);
    expect(listRes.status).toBe(200);

    // Remove member
    const removeRes = await api.delete(
      `/v1/projects/${project.id}/members/test-member-id`,
      token,
    );
    expect(removeRes.status).toBe(200);
  });
});
