/**
 * Playwright Test Fixtures
 *
 * Extends the base Playwright test with email helper, API client,
 * and auth utilities. Every test gets a unique test email address
 * that is automatically cleaned up after the test.
 */

import { test as base } from "@playwright/test";
import { createEmailHelper, type EmailHelper } from "../helpers/email-helper";
import { createApiClient, type ApiClient } from "../helpers/api-client";
import {
  createAuthTestUtils,
  type AuthTestUtils,
} from "../helpers/auth-test-utils";

type UserSystemFixtures = {
  emailHelper: EmailHelper;
  testEmail: string;
  api: ApiClient;
  authUtils: AuthTestUtils;
};

export const test = base.extend<UserSystemFixtures>({
  emailHelper: async ({}, use) => {
    await use(createEmailHelper());
  },

  testEmail: async ({ emailHelper }, use) => {
    const email = emailHelper.generateEmail();
    await use(email);
    await emailHelper.cleanup(email);
  },

  api: async ({}, use) => {
    const baseUrl = process.env.API_BASE_URL || "http://localhost:8080";
    await use(createApiClient(baseUrl));
  },

  authUtils: async ({}, use) => {
    await use(createAuthTestUtils());
  },
});

export { expect } from "@playwright/test";
