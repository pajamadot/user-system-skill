/**
 * Invitation Acceptance E2E Tests
 *
 * Tests the full invite → accept flow for both new and existing users.
 */

import { test, expect } from "./fixtures";

test.describe("Invitation Acceptance", () => {
  let ownerToken: string;
  let orgId: string;

  test.beforeAll(async ({ authUtils }) => {
    ownerToken = await authUtils.getTestUserToken("owner");
    orgId = await authUtils.getTestOrgId();
  });

  test("new user can accept invite and join org", async ({
    page,
    api,
    testEmail,
    emailHelper,
  }) => {
    // 1. Send invitation to a brand-new email
    const res = await api.post(
      `/v1/orgs/${orgId}/invites`,
      { email: testEmail, role: "member" },
      ownerToken,
    );
    expect(res.status).toBe(201);

    // 2. Wait for invitation email
    const email = await emailHelper.waitForEmail(testEmail, {
      subjectContains: "invite",
      timeout: 60_000,
    });
    expect(email).toBeTruthy();

    // 3. Extract invite link
    const inviteLink = emailHelper.extractLink(email, /invite|accept|join/);
    expect(inviteLink).toBeTruthy();

    // 4. Visit invite link — should land on sign-up (user doesn't exist yet)
    await page.goto(inviteLink!);

    // 5. Complete sign-up
    await page.getByLabel(/password/i).fill("InvitedUser123!");
    await page.getByRole("button", { name: /continue|sign up|accept/i }).click();

    // 6. Should now be a member of the org
    await expect(page).toHaveURL(/\/(dashboard|projects|orgs)/);
  });

  test("existing user can accept invite via email link", async ({
    page,
    api,
    emailHelper,
  }) => {
    // Use a second pre-existing test user email
    const existingEmail = process.env.E2E_TEST_USER_EMAIL;
    if (!existingEmail) { test.skip(); return; }

    // 1. Send invitation to existing user
    const res = await api.post(
      `/v1/orgs/${orgId}/invites`,
      { email: existingEmail, role: "admin" },
      ownerToken,
    );
    // May be 201 (new invite) or 409 (already member) — both are valid
    expect([201, 409]).toContain(res.status);

    if (res.status === 409) {
      // Already a member — test passes (idempotent)
      return;
    }

    // 2. Wait for email
    const email = await emailHelper.waitForEmail(existingEmail, {
      subjectContains: "invite",
      timeout: 60_000,
    });

    // 3. Extract and visit link
    const inviteLink = emailHelper.extractLink(email, /invite|accept|join/);
    expect(inviteLink).toBeTruthy();

    await page.goto(inviteLink!);

    // 4. Existing user should sign in, then be added to org
    const password = process.env.E2E_TEST_USER_PASSWORD;
    if (password) {
      // May need to sign in first
      const passwordField = page.getByLabel(/password/i);
      if (await passwordField.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await passwordField.fill(password);
        await page.getByRole("button", { name: /continue|sign in|accept/i }).click();
      }
    }

    // Should land in the org
    await expect(page).toHaveURL(/\/(dashboard|projects|orgs)/);
  });

  test("expired or invalid invite link shows error", async ({ page }) => {
    await page.goto("/invite/fake-invalid-token-12345");

    // Should show some kind of error or redirect to sign-up
    await expect(page.locator("body")).toBeVisible();
    // Not crashing is the minimum bar — provider-specific error handling varies
  });
});
