/**
 * User Registration E2E Tests
 *
 * Tests the full sign-up flow including real email verification.
 * Requires an email testing backend (see SKILL.md Part C).
 */

import { test, expect } from "./fixtures";

test.describe("User Registration", () => {
  test("new user can sign up with email verification", async ({
    page,
    testEmail,
    emailHelper,
  }) => {
    // Navigate to sign-up
    await page.goto("/sign-up");

    // Enter email address
    await page.getByLabel(/email/i).fill(testEmail);
    await page.getByRole("button", { name: /continue/i }).click();

    // Wait for verification email to arrive
    const email = await emailHelper.waitForEmail(testEmail, {
      subjectContains: "verification",
      timeout: 60_000,
    });
    expect(email).toBeTruthy();
    expect(email.subject.toLowerCase()).toContain("verif");

    // Extract 6-digit code from email
    const code = emailHelper.extractVerificationCode(email);
    expect(code).toBeTruthy();
    expect(code).toMatch(/^\d{6}$/);

    // Enter verification code
    await page.getByLabel(/code/i).fill(code!);
    await page.getByRole("button", { name: /verify/i }).click();

    // Set password
    await page.getByLabel(/password/i).fill("TestPass123!");
    await page.getByRole("button", { name: /continue/i }).click();

    // Should redirect to onboarding or dashboard
    await expect(page).toHaveURL(/\/(onboarding|dashboard|projects)/);
  });

  test("existing user can sign in with email and password", async ({
    page,
  }) => {
    const email = process.env.E2E_TEST_USER_EMAIL;
    const password = process.env.E2E_TEST_USER_PASSWORD;
    if (!email || !password) {
      test.skip();
      return;
    }

    await page.goto("/sign-in");
    await page.getByLabel(/email|identifier/i).fill(email);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /continue|sign in/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|projects)/);
  });

  test("sign-up with already-used email is rejected", async ({
    page,
    authUtils,
  }) => {
    const existing = await authUtils.getExistingTestUser();

    await page.goto("/sign-up");
    await page.getByLabel(/email/i).fill(existing.email);
    await page.getByRole("button", { name: /continue/i }).click();

    // Should show error
    await expect(
      page.getByText(/already exists|already registered|already in use/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});
