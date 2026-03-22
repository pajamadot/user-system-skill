/**
 * Organization CRUD E2E Tests
 *
 * Tests creating, listing, updating, and deleting organizations via the API.
 */

import { test, expect } from "./fixtures";

test.describe("Organization CRUD", () => {
  let token: string;

  test.beforeAll(async ({ authUtils }) => {
    token = await authUtils.getTestUserToken();
  });

  test("create organization", async ({ api }) => {
    const slug = `test-org-${Date.now()}`;
    const res = await api.post("/v1/orgs", { name: "Test Org", slug }, token);
    expect(res.status).toBe(201);

    const org = await res.json();
    expect(org.name).toBe("Test Org");
    expect(org.slug).toBe(slug);
  });

  test("list organizations includes created org", async ({ api }) => {
    const slug = `list-test-${Date.now()}`;
    await api.post("/v1/orgs", { name: "List Test Org", slug }, token);

    const res = await api.get("/v1/orgs", token);
    expect(res.status).toBe(200);

    const orgs = await res.json();
    expect(orgs.some((o: any) => o.slug === slug)).toBe(true);
  });

  test("update organization name", async ({ api }) => {
    const slug = `update-test-${Date.now()}`;
    const created = await (
      await api.post("/v1/orgs", { name: "Before", slug }, token)
    ).json();

    const res = await api.patch(
      `/v1/orgs/${created.id}`,
      { name: "After" },
      token,
    );
    expect(res.status).toBe(200);

    const fetched = await (await api.get(`/v1/orgs/${created.id}`, token)).json();
    expect(fetched.name).toBe("After");
  });

  test("delete organization", async ({ api }) => {
    const slug = `delete-test-${Date.now()}`;
    const created = await (
      await api.post("/v1/orgs", { name: "To Delete", slug }, token)
    ).json();

    const res = await api.delete(`/v1/orgs/${created.id}`, token);
    expect(res.status).toBe(200);

    // Should no longer appear in list
    const list = await (await api.get("/v1/orgs", token)).json();
    expect(list.some((o: any) => o.id === created.id)).toBe(false);
  });
});
