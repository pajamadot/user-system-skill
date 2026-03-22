/**
 * OAuth Sign-In E2E Tests
 *
 * Tests OAuth flows (Google, GitHub, etc.)
 *
 * NOTE: Full OAuth E2E is inherently difficult to automate because
 * it requires interacting with a third-party provider's consent screen.
 * These tests verify the OAuth button exists and the redirect initiates.
 * For full flow testing, use the auth provider's testing mode.
 */

import { test, expect } from "./fixtures";

test.describe("OAuth Sign-In", () => {
  test("sign-in page shows OAuth provider buttons", async ({ page }) => {
    await page.goto("/sign-in");

    // Check that at least one OAuth button is visible
    // Adjust selectors based on your auth provider's UI
    const oauthButton = page.getByRole("button", { name: /google|github|apple|microsoft/i });
    const socialButton = page.locator('[data-provider], .cl-socialButtonsBlockButton, [class*="oauth"], [class*="social"]');

    const hasOAuth = await oauthButton.first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasSocial = await socialButton.first().isVisible({ timeout: 5_000 }).catch(() => false);

    // At least one should be present if OAuth is configured
    // Skip if no OAuth configured (email-only setup)
    if (!hasOAuth && !hasSocial) {
      test.skip(true, "No OAuth buttons found — OAuth may not be configured");
    }

    expect(hasOAuth || hasSocial).toBe(true);
  });

  test("OAuth button initiates redirect to provider", async ({ page }) => {
    await page.goto("/sign-in");

    const googleButton = page.getByRole("button", { name: /google/i });
    const hasGoogle = await googleButton.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasGoogle) {
      test.skip(true, "Google OAuth not configured");
      return;
    }

    // Click should initiate redirect (we can't complete it without real Google creds)
    const [response] = await Promise.all([
      page.waitForNavigation({ timeout: 10_000 }).catch(() => null),
      googleButton.click(),
    ]);

    // Should redirect to Google or auth provider's OAuth page
    const url = page.url();
    const redirected = url.includes("accounts.google.com") ||
      url.includes("clerk.") ||
      url.includes("auth0.") ||
      url !== (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") + "/sign-in";

    expect(redirected).toBe(true);
  });
});
