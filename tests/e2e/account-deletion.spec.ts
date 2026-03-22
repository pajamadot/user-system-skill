/**
 * Account Deletion E2E Tests
 *
 * Tests GDPR-compliant account deletion flows.
 */

import { test, expect } from "./fixtures";

test.describe("Account Deletion", () => {
  test("user can request account deletion via API", async ({
    api,
    authUtils,
    testEmail,
    emailHelper,
  }) => {
    // 1. Create a test user
    const password = "DeleteMe123!";
    const user = await authUtils.createTestUser(testEmail, password);

    // TODO: Get a token for this user (provider-specific)
    // const token = await authUtils.getTokenForUser(user.id);

    // 2. Request account deletion
    // const res = await api.delete("/v1/auth/account", token);
    // expect(res.status).toBe(200);

    // 3. Verify user cannot sign in anymore
    // const signInRes = await api.post("/v1/auth/signin", { email: testEmail, password });
    // expect(signInRes.status).toBe(401);

    // 4. Cleanup: delete from auth provider
    await authUtils.deleteTestUser(user.id);

    // Mark as pending implementation
    test.skip(true, "Account deletion endpoint not yet implemented — see META.md priority #3");
  });

  test("deleting account removes user from all orgs", async ({ authUtils }) => {
    // This test verifies cascading cleanup when a user is deleted
    // The user should be removed from org_members and project_members

    // Implementation depends on whether deletion is:
    // a) Soft delete (set deleted_at, keep memberships for audit)
    // b) Hard delete (CASCADE removes memberships)

    test.skip(true, "Account deletion endpoint not yet implemented");
  });
});
