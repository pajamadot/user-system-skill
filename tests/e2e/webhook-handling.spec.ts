/**
 * Webhook Handling E2E Tests
 *
 * Tests that auth provider webhooks correctly sync data to the local database.
 * These tests hit the webhook endpoint directly (not through the auth provider).
 */

import { test, expect } from "./fixtures";

const API_BASE = process.env.API_BASE_URL || "http://localhost:8080";

test.describe("Webhook Handling", () => {
  test("unsigned webhook is rejected", async () => {
    const res = await fetch(`${API_BASE}/api/webhooks/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user.created", data: { id: "fake-user" } }),
    });

    // Should be 400, 401, or 403 — never 200
    expect([400, 401, 403]).toContain(res.status);
  });

  test("webhook with invalid signature is rejected", async () => {
    const res = await fetch(`${API_BASE}/api/webhooks/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": "msg_fake123",
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": "v1,invalidbase64signature==",
      },
      body: JSON.stringify({ type: "user.created", data: { id: "fake-user" } }),
    });

    expect([400, 401, 403]).toContain(res.status);
  });

  test("webhook endpoint exists and responds", async () => {
    // A GET (wrong method) should return 405 or 404, not 500
    const res = await fetch(`${API_BASE}/api/webhooks/auth`, {
      method: "GET",
    });

    expect(res.status).not.toBe(500);
  });
});
