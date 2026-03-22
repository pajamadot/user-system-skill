/**
 * Organization Invitation E2E Tests
 *
 * Tests the full invitation flow: send invite → verify email → extract link.
 * Requires an email testing backend (see SKILL.md Part C).
 */

import { test, expect } from "./fixtures";

test.describe("Organization Invitation", () => {
  let token: string;
  let orgId: string;

  test.beforeAll(async ({ authUtils }) => {
    token = await authUtils.getTestUserToken();
    orgId = await authUtils.getTestOrgId();
  });

  test("send invitation and verify email delivery", async ({
    api,
    testEmail,
    emailHelper,
  }) => {
    // Send invitation
    const res = await api.post(
      `/v1/orgs/${orgId}/invites`,
      { email: testEmail, role: "member" },
      token,
    );
    expect(res.status).toBe(201);

    // Wait for invitation email
    const email = await emailHelper.waitForEmail(testEmail, {
      subjectContains: "invite",
      timeout: 60_000,
    });
    expect(email).toBeTruthy();
    expect(email.subject.toLowerCase()).toContain("invite");

    // Extract invite/accept link
    const link = emailHelper.extractLink(email, /invite|accept|join/);
    expect(link).toBeTruthy();
  });

  test("list pending invitations", async ({ api, testEmail }) => {
    // Create an invite first
    await api.post(
      `/v1/orgs/${orgId}/invites`,
      { email: testEmail, role: "member" },
      token,
    );

    // List invites
    const res = await api.get(`/v1/orgs/${orgId}/invites`, token);
    expect(res.status).toBe(200);

    const invites = await res.json();
    expect(invites.length).toBeGreaterThan(0);
  });

  test("non-admin cannot send invitations", async ({ api, testEmail, authUtils }) => {
    const memberToken = await authUtils.getTestUserToken("member");

    const res = await api.post(
      `/v1/orgs/${orgId}/invites`,
      { email: testEmail, role: "member" },
      memberToken,
    );
    expect(res.status).toBe(403);
  });
});
