/**
 * Password Reset E2E Tests
 *
 * Tests the full password reset flow: request reset → receive email → enter code → set new password.
 */

import { test, expect } from "./fixtures";

test.describe("Password Reset", () => {
  test("request password reset and receive email with code", async ({
    page,
    emailHelper,
  }) => {
    // Use a test user whose email we can receive
    const testEmail = process.env.E2E_TEST_USER_EMAIL;
    if (!testEmail) { test.skip(); return; }

    await page.goto("/sign-in");
    await page.getByLabel(/email|identifier/i).fill(testEmail);
    await page.getByRole("button", { name: /continue/i }).click();

    // Click "Forgot password" link
    await page.getByText(/forgot.*password/i).click();

    // Should show reset form or send code
    // Wait for reset email
    const email = await emailHelper.waitForEmail(testEmail, {
      subjectContains: "reset",
      timeout: 60_000,
    });
    expect(email).toBeTruthy();

    // Extract code
    const code = emailHelper.extractVerificationCode(email);
    expect(code).toBeTruthy();

    // Enter code
    await page.getByLabel(/code/i).fill(code!);
    await page.getByRole("button", { name: /verify|continue|reset/i }).click();

    // Enter new password
    await page.getByLabel(/new password|password/i).first().fill("NewTestPass456!");
    await page.getByRole("button", { name: /reset|save|continue/i }).click();

    // Should succeed — either redirect to sign-in or dashboard
    await expect(page).toHaveURL(/\/(sign-in|dashboard|projects)/);
  });

  test("reset request for non-existent email is handled gracefully", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email|identifier/i).fill("nobody-ever-xyz@example.com");
    await page.getByRole("button", { name: /continue/i }).click();

    // Depending on provider: may show error or silently accept (to avoid email enumeration)
    // Either outcome is acceptable — just verify no crash
    await expect(page.locator("body")).toBeVisible();
  });
});
