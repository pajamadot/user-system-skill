/**
 * Session Management E2E Tests
 *
 * Tests session lifecycle: creation, persistence, expiration, and revocation.
 */

import { test, expect } from "./fixtures";

test.describe("Session Management", () => {
  test("authenticated API call succeeds with valid token", async ({ api, authUtils }) => {
    const token = await authUtils.getTestUserToken();
    const res = await api.get("/v1/auth/profile", token);
    expect(res.status).toBe(200);

    const profile = await res.json();
    expect(profile.email).toBeTruthy();
    expect(profile.user_id || profile.id).toBeTruthy();
  });

  test("API call without token returns 401", async ({ api }) => {
    const res = await api.get("/v1/auth/profile");
    expect(res.status).toBe(401);
  });

  test("API call with expired/invalid token returns 401", async ({ api }) => {
    const res = await api.get("/v1/auth/profile", "invalid.jwt.token");
    expect(res.status).toBe(401);
  });

  test("API call with malformed Authorization header returns 401", async () => {
    const baseUrl = process.env.API_BASE_URL || "http://localhost:8080";
    const res = await fetch(`${baseUrl}/v1/auth/profile`, {
      headers: { Authorization: "NotBearer something" },
    });
    expect(res.status).toBe(401);
  });

  test("sign out clears session (browser)", async ({ page }) => {
    const email = process.env.E2E_TEST_USER_EMAIL;
    const password = process.env.E2E_TEST_USER_PASSWORD;
    if (!email || !password) { test.skip(); return; }

    // Sign in
    await page.goto("/sign-in");
    await page.getByLabel(/email|identifier/i).fill(email);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /continue|sign in/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|projects)/);

    // Sign out — look for user menu or sign out button
    const userButton = page.locator('[class*="userButton"], [data-testid="user-button"], button:has-text("account")');
    if (await userButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await userButton.first().click();
      await page.getByText(/sign out|log out/i).click();
    }

    // After sign out, navigating to protected page should redirect to sign-in
    await page.goto("/projects");
    await expect(page).toHaveURL(/sign-in/);
  });
});
