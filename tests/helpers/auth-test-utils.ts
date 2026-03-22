/**
 * Auth Testing Utilities
 *
 * Programmatic user/org management for E2E tests.
 * Currently implements the Clerk provider. Add other providers as needed.
 */

export interface AuthTestUtils {
  /** Create a test user programmatically (bypasses UI) */
  createTestUser(email: string, password: string): Promise<{ id: string; email: string }>;

  /** Delete a test user (cleanup) */
  deleteTestUser(userId: string): Promise<void>;

  /** Get a JWT token for a test user (for API calls) */
  getTestUserToken(role?: string): Promise<string>;

  /** Get the pre-created persistent test user */
  getExistingTestUser(): Promise<{ id: string; email: string }>;

  /** Get or create a test organization */
  getTestOrgId(): Promise<string>;

  /** Get or create a test project */
  getTestProjectId(): Promise<string>;

  /** Create an organization via the auth provider */
  createTestOrg(name: string, creatorUserId: string): Promise<{ id: string; name: string }>;

  /** Send an org invitation via the auth provider */
  sendOrgInvite(orgId: string, email: string, role: string): Promise<{ id: string }>;
}

// ─── Clerk Implementation ───────────────────────────────────────────

export class ClerkAuthTestUtils implements AuthTestUtils {
  private clerk: any;

  constructor(secretKey: string) {
    const { createClerkClient } = require("@clerk/backend");
    this.clerk = createClerkClient({ secretKey });
  }

  async createTestUser(
    email: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const user = await this.clerk.users.createUser({
      emailAddress: [email],
      password,
      skipPasswordChecks: true,
    });
    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || email,
    };
  }

  async deleteTestUser(userId: string): Promise<void> {
    await this.clerk.users.deleteUser(userId);
  }

  async getTestUserToken(_role?: string): Promise<string> {
    // For E2E tests, the simplest approach is:
    // 1. Use a pre-created test user
    // 2. Sign in via Clerk frontend in a Playwright setup step
    // 3. Extract the session token from cookies
    //
    // For API-only tests, you can use Clerk's Backend API:
    // - Create a user, then use clerk.sessions to get a token
    //
    // This is intentionally left as a hook — implement based on your flow
    throw new Error(
      "getTestUserToken: Implement based on your auth flow.\n" +
        "See tests/e2e/setup/ for Playwright-based auth setup examples.",
    );
  }

  async getExistingTestUser(): Promise<{ id: string; email: string }> {
    const email = process.env.E2E_TEST_USER_EMAIL;
    if (!email) throw new Error("E2E_TEST_USER_EMAIL not set");

    const users = await this.clerk.users.getUserList({
      emailAddress: [email],
    });
    if (users.data.length === 0) throw new Error(`Test user ${email} not found in Clerk`);

    return {
      id: users.data[0].id,
      email: users.data[0].emailAddresses[0]?.emailAddress || email,
    };
  }

  async getTestOrgId(): Promise<string> {
    // Look for an existing test org or create one
    const user = await this.getExistingTestUser();
    const orgs = await this.clerk.organizations.getOrganizationList();
    const testOrg = orgs.data.find(
      (o: any) => o.name === "E2E Test Org" || o.slug === "e2e-test-org",
    );

    if (testOrg) return testOrg.id;

    const created = await this.createTestOrg("E2E Test Org", user.id);
    return created.id;
  }

  async getTestProjectId(): Promise<string> {
    // Projects are managed in your local DB, not Clerk.
    // Use your API client to create a test project.
    throw new Error(
      "getTestProjectId: Use apiClient.post('/v1/projects', ...) to create a test project.",
    );
  }

  async createTestOrg(
    name: string,
    creatorUserId: string,
  ): Promise<{ id: string; name: string }> {
    const org = await this.clerk.organizations.createOrganization({
      name,
      createdBy: creatorUserId,
    });
    return { id: org.id, name: org.name };
  }

  async sendOrgInvite(
    orgId: string,
    email: string,
    role: string,
  ): Promise<{ id: string }> {
    const clerkRole = role === "admin" ? "org:admin" : "org:member";
    const invitation =
      await this.clerk.organizations.createOrganizationInvitation({
        organizationId: orgId,
        emailAddress: email,
        role: clerkRole,
        inviterUserId: "system",
      });
    return { id: invitation.id };
  }
}

// ─── Factory ────────────────────────────────────────────────────────

export function createAuthTestUtils(): AuthTestUtils {
  if (process.env.CLERK_SECRET_KEY) {
    return new ClerkAuthTestUtils(process.env.CLERK_SECRET_KEY);
  }

  // Add other providers here:
  // if (process.env.AUTH0_MANAGEMENT_TOKEN) return new Auth0TestUtils(...);
  // if (process.env.SUPABASE_SERVICE_KEY) return new SupabaseTestUtils(...);

  throw new Error(
    "No auth provider configured for testing.\n" +
      "Set CLERK_SECRET_KEY (or your provider's key) in the environment.",
  );
}
