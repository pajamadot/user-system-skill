/**
 * User Sign-In E2E Tests
 *
 * Tests sign-in flows: email+password, session persistence, and error cases.
 */

import { test, expect } from "./fixtures";

test.describe("User Sign-In", () => {
  test("sign in with valid email and password", async ({ page }) => {
    const email = process.env.E2E_TEST_USER_EMAIL;
    const password = process.env.E2E_TEST_USER_PASSWORD;
    if (!email || !password) { test.skip(); return; }

    await page.goto("/sign-in");
    await page.getByLabel(/email|identifier/i).fill(email);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /continue|sign in/i }).click();

    await expect(page).toHaveURL(/\/(dashboard|projects)/);
  });

  test("sign in with wrong password shows error", async ({ page }) => {
    const email = process.env.E2E_TEST_USER_EMAIL;
    if (!email) { test.skip(); return; }

    await page.goto("/sign-in");
    await page.getByLabel(/email|identifier/i).fill(email);
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel(/password/i).fill("WrongPassword999!");
    await page.getByRole("button", { name: /continue|sign in/i }).click();

    await expect(
      page.getByText(/incorrect|invalid|wrong|failed/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("sign in with non-existent email shows error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email|identifier/i).fill("nonexistent-user-xyz@example.com");
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(
      page.getByText(/not found|no account|doesn't exist|couldn't find/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("authenticated session persists across page navigations", async ({ page }) => {
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

    // Navigate to another protected page — should stay authenticated
    await page.goto("/projects");
    await expect(page).not.toHaveURL(/sign-in/);
  });
});
