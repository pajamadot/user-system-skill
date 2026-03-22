# User System Skill

Build a production-ready, multi-tenant user management system with fully automated E2E testing of the entire user lifecycle — registration, login, invitations, organization/workspace management, project-scoped RBAC, and email verification.

This skill is **auth-provider agnostic**. It defines the system from first principles, then shows how to implement it with specific providers.

---

## When to Use This Skill

- Building any app that needs user accounts, teams/orgs, and project-scoped access
- You need fully automated tests that verify real email delivery (verification codes, invites)
- You want a clear, repeatable recipe for the entire user management stack

---

## Part A: First Principles — What a User System Needs

### The 5 Layers

```
Layer 1: IDENTITY        — Who is this person? (auth provider or self-hosted)
Layer 2: LOCAL USER SYNC  — Mirror identity data into your DB
Layer 3: ORGANIZATION     — Group users into teams/workspaces
Layer 4: PROJECT SCOPING  — Fine-grained access within an org
Layer 5: TESTABILITY      — Prove it all works, automatically, including emails
```

### Layer 1: Identity (Authentication)

The auth layer answers: "Is this request from a real, verified user?"

**What it must do:**
- Sign up (email + password, or OAuth)
- Sign in → issue a JWT (or session)
- Email verification (OTP code or magic link)
- Password reset
- Expose a JWKS endpoint or shared secret for backend verification

**Provider options (pick one):**

| Provider | Type | Org/Team Support | Webhooks | Free Tier | Best For |
|----------|------|-----------------|----------|-----------|----------|
| **Clerk** | SaaS | Built-in orgs, invites | Yes (svix) | 10K MAU | Full-featured, fast setup |
| **Auth0** | SaaS | Organizations add-on | Yes | 7.5K MAU | Enterprise, SSO |
| **Supabase Auth** | Self-hostable | Via custom tables | Via DB triggers | 50K MAU | Already using Supabase |
| **Firebase Auth** | SaaS | Via custom claims | Via Cloud Functions | 50K MAU | Mobile-first, Google ecosystem |
| **Lucia** | Library | DIY | N/A (you own it) | Free | Full control, no vendor lock-in |
| **Better Auth** | Library | Built-in orgs | N/A (you own it) | Free | Modern TS, batteries included |

**The auth provider contract** — regardless of which you pick, your backend needs:
```
verify(token) → { userId, email, name, orgMemberships? }
```

### Layer 2: Local User Sync

Never rely solely on the auth provider's user store. Mirror users into your own DB.

**Why:** You need to foreign-key users to your own tables (projects, org_members, etc.), run queries joining user data, and avoid vendor lock-in.

**Sync strategies:**
1. **Webhook-driven** — Auth provider fires `user.created` / `user.updated` → you upsert
2. **Lazy on-request** — First authenticated API call → look up or create local user
3. **Both** (recommended) — Webhook for prompt sync, lazy as fallback for race conditions

**User table (minimal):**
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_provider_id TEXT UNIQUE,    -- e.g., clerk user ID, auth0 sub, supabase uid
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Layer 3: Organization / Workspace

**Schema:**
```sql
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  auth_provider_org_id TEXT UNIQUE, -- NULL if orgs managed locally
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE org_members (
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
```

**Roles & permissions:**
| Org Role | Manage Members | Manage Settings | Invite Users | View Content |
|----------|---------------|----------------|-------------|-------------|
| owner | Yes | Yes | Yes | Yes |
| admin | Yes | No | Yes | Yes |
| member | No | No | No | Yes |

### Layer 4: Project Scoping

**Schema:**
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT,
  name TEXT NOT NULL,
  description TEXT,
  deleted_at TIMESTAMPTZ,  -- soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, slug)
);

CREATE TABLE project_members (
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
```

**Access resolution (org role + project role → effective access):**
```
org:owner  OR org:admin  → project:admin   (implicit, always)
project:admin            → admin
project:editor           → write + read
project:viewer           → read only
org:member (no project)  → read only (if project is internal)
no org membership        → denied
```

### Layer 5: Testability

The hardest part: **testing email-dependent flows automatically**.

User registration, password reset, and invitations all send emails. To test them end-to-end without manual intervention, you need a **programmable test inbox** — a way for your test code to:
1. Generate a unique email address per test
2. Trigger the flow (sign-up, invite)
3. Poll for the email to arrive
4. Extract the verification code or link
5. Complete the flow

---

## Part B: Auth Provider Setup (Clerk Example)

> Swap this section for your chosen provider. The principles from Part A stay the same.

### Step 1: Create Clerk Application

1. Go to [clerk.com](https://clerk.com) → Create Application
2. Enable **Email + Password** sign-in method
3. Enable **Organizations** (for multi-tenant)
4. Note your keys:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_` or `pk_live_`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_` or `sk_live_`)

### Step 2: Configure Webhooks

1. Clerk Dashboard → Webhooks → Add Endpoint
2. URL: `https://your-api.com/api/webhooks/clerk`
3. Subscribe to events:
   - `user.created`, `user.updated`, `user.deleted`
   - `organization.created`, `organization.updated`, `organization.deleted`
   - `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`
   - `organizationInvitation.created`, `organizationInvitation.accepted`
4. Copy the **Signing Secret** → `CLERK_WEBHOOK_SECRET`

### Step 3: Environment Variables

```env
# === Auth (Clerk) ===
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxx
CLERK_SECRET_KEY=sk_test_xxxx
CLERK_WEBHOOK_SECRET=whsec_xxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# === Database ===
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp

# === JWT (for service-to-service tokens, optional) ===
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

# === Email Testing (pick one approach, see Part C) ===
# Option A: Cloudflare Email Routing
EMAIL_WORKER_URL=https://email-receiver.your-worker.workers.dev
CLOUDFLARE_EMAIL_ROUTING_DOMAIN=test.yourdomain.com
EMAIL_WORKER_TOKEN=your-secret-token

# Option B: Mailosaur
MAILOSAUR_API_KEY=your-api-key
MAILOSAUR_SERVER_ID=your-server-id

# Option C: Clerk Testing Tokens (no real email needed for API tests)
CLERK_TESTING_TOKEN=your-testing-token

# === E2E Test User (pre-created, for sign-in tests) ===
E2E_TEST_USER_EMAIL=test-permanent@test.yourdomain.com
E2E_TEST_USER_PASSWORD=TestPass123!
```

### Step 4: Frontend Middleware (Next.js)

```typescript
// middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)', '/sign-up(.*)', '/api/webhooks(.*)', '/'
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ['/((?!.*\\..*|_next).*)', '/', '/(api|trpc)(.*)'],
};
```

### Step 5: Backend JWT Verification

```typescript
// Verify Clerk JWT on every API request
import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

async function verifyToken(token: string) {
  // Option A: Use Clerk SDK (simplest)
  const { sub, email } = await clerk.verifyToken(token);
  return { userId: sub, email };

  // Option B: Manual JWKS verification (no vendor dependency in hot path)
  // 1. Fetch https://<clerk-domain>/.well-known/jwks.json (cache 1 hour)
  // 2. Decode JWT header → get kid
  // 3. Find matching key, verify RS256 signature
  // 4. Return claims
}
```

### Step 6: Auto-User Sync Middleware

```typescript
async function ensureLocalUser(authUser: { userId: string; email: string; name?: string }) {
  // Try by auth_provider_id first
  let user = await db.getUserByAuthProviderId(authUser.userId);
  if (user) return user;

  // Try by email (handles pre-existing accounts)
  user = await db.getUserByEmail(authUser.email);
  if (user) {
    await db.linkAuthProvider(user.id, authUser.userId);
    return user;
  }

  // Create new user + default org
  user = await db.createUser({
    authProviderId: authUser.userId,
    email: authUser.email,
    displayName: authUser.name,
  });
  const org = await db.createOrganization({
    name: `${authUser.name || authUser.email}'s Workspace`,
    ownerUserId: user.id,
  });
  await db.addOrgMember(org.id, user.id, 'owner');
  return user;
}
```

### Step 7: Webhook Handler

```typescript
import { Webhook } from 'svix';

async function handleWebhook(req: Request) {
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  const payload = wh.verify(await req.text(), Object.fromEntries(req.headers));

  switch (payload.type) {
    case 'user.created':
    case 'user.updated':
      await db.upsertUser({
        authProviderId: payload.data.id,
        email: payload.data.email_addresses[0]?.email_address,
        displayName: [payload.data.first_name, payload.data.last_name].filter(Boolean).join(' '),
        avatarUrl: payload.data.image_url,
      });
      break;
    case 'user.deleted':
      await db.softDeleteUserByAuthProviderId(payload.data.id);
      break;
    case 'organizationMembership.created':
      await db.upsertOrgMember(
        payload.data.organization.id,
        payload.data.public_user_data.user_id,
        mapClerkRole(payload.data.role)
      );
      break;
  }
}
```

---

## Part C: Automated Email Testing (Choose Your Approach)

The goal: **test real email delivery in CI** for sign-up verification, password reset, and invitations.

### Approach Comparison

| Approach | Setup Effort | Cost | Reliability | Real Email? | Best For |
|----------|-------------|------|-------------|------------|---------|
| **Cloudflare Email Routing + Worker** | Medium | Free | High | Yes, real SMTP delivery | Teams already on Cloudflare |
| **Mailosaur** | Low | $99/mo | Very High | Yes, real SMTP delivery | Teams wanting zero-ops |
| **MailSlurp** | Low | Free tier available | High | Yes | Quick start, free tier |
| **Clerk Testing Tokens** | Very Low | Free | Very High | No (bypasses email) | API-only tests, no UI |
| **Custom SMTP + IMAP** | High | Free | Medium | Yes | Self-hosted, full control |

### Approach A: Cloudflare Email Routing + Worker

**How it works:**
```
1. Test generates unique email: test-a1b2c3d4@test.yourdomain.com
2. Auth provider sends verification email to that address
3. Cloudflare Email Routing catch-all forwards to your Worker
4. Worker stores email in KV (key: recipient, value: email content, TTL: 1h)
5. Test polls Worker HTTP API for the email
6. Test extracts verification code/link and completes the flow
```

**Setup (one-time, ~30 minutes):**

1. **Add test domain to Cloudflare** (e.g., `test.yourdomain.com`)
   - Cloudflare Dashboard → Add a Site → follow DNS setup

2. **Enable Email Routing**
   - Dashboard → Email → Email Routing → Enable
   - Add catch-all rule: `*@test.yourdomain.com` → Route to Worker

3. **Deploy the email receiver worker**
   ```bash
   cd email-receiver-worker
   npm install
   npx wrangler kv namespace create TEST_EMAILS
   # Copy the KV namespace ID into wrangler.toml
   npx wrangler deploy
   ```

4. **Set env vars in your test config**
   ```env
   EMAIL_WORKER_URL=https://email-receiver.<your-subdomain>.workers.dev
   CLOUDFLARE_EMAIL_ROUTING_DOMAIN=test.yourdomain.com
   EMAIL_WORKER_TOKEN=<generate-a-random-secret>
   ```

**Worker code:** See `email-receiver-worker/` directory in this repo.

### Approach B: Mailosaur (Hosted Test Inbox)

**How it works:** Mailosaur gives you a server with an email domain (e.g., `xxx.mailosaur.net`). Any email sent to `anything@xxx.mailosaur.net` is captured and queryable via API.

**Setup (~5 minutes):**
1. Sign up at [mailosaur.com](https://mailosaur.com)
2. Create a server → note the Server ID and domain
3. Set env vars:
   ```env
   MAILOSAUR_API_KEY=your-api-key
   MAILOSAUR_SERVER_ID=your-server-id
   MAILOSAUR_DOMAIN=xxx.mailosaur.net
   ```

**Test helper:**
```typescript
import Mailosaur from 'mailosaur';

const client = new Mailosaur(process.env.MAILOSAUR_API_KEY!);
const serverId = process.env.MAILOSAUR_SERVER_ID!;

export function generateEmail(): string {
  return `test-${crypto.randomUUID().slice(0, 8)}@${process.env.MAILOSAUR_DOMAIN}`;
}

export async function waitForEmail(sentTo: string, options?: { subject?: string; timeout?: number }) {
  const message = await client.messages.get(serverId, {
    sentTo,
    subject: options?.subject,
  }, { timeout: options?.timeout || 30_000 });
  return message;
}

export function extractVerificationCode(message: any): string | null {
  const match = message.text?.body?.match(/(\d{6})/);
  return match?.[1] || null;
}

export function extractLink(message: any, pattern?: RegExp): string | null {
  const links = message.html?.links || [];
  if (pattern) return links.find((l: any) => pattern.test(l.href))?.href || null;
  return links[0]?.href || null;
}
```

### Approach C: MailSlurp (Free Tier Available)

Similar to Mailosaur but has a free tier (100 emails/mo). Setup:
```typescript
import { MailSlurp } from 'mailslurp-client';

const mailslurp = new MailSlurp({ apiKey: process.env.MAILSLURP_API_KEY! });

export async function createTestInbox() {
  const inbox = await mailslurp.createInbox();
  return { email: inbox.emailAddress, inboxId: inbox.id };
}

export async function waitForEmail(inboxId: string, timeout = 30_000) {
  const [email] = await mailslurp.waitForEmailCount(1, inboxId, timeout);
  return email;
}
```

### Approach D: Clerk Testing Tokens (API-Only, No Real Email)

For API-level tests that don't need to verify actual email delivery, Clerk provides testing tokens that bypass the UI and email flow entirely.

```typescript
import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

// Create a test user programmatically (no email sent)
const user = await clerk.users.createUser({
  emailAddress: ['test@example.com'],
  password: 'TestPass123!',
  skipPasswordChecks: true,
});

// Get a session token for API calls
// Use Clerk's __clerk_testing header or create a signed JWT
```

**When to use:** Unit/integration tests that verify your API logic, RBAC policies, and DB operations without needing real email delivery.

### Approach E: Custom SMTP Server (Self-Hosted)

Run a lightweight SMTP server in your test environment:
```typescript
// Using smtp-server + mailparser (Node.js)
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';

const emails: Map<string, any[]> = new Map();

const server = new SMTPServer({
  authOptional: true,
  onData(stream, session, callback) {
    simpleParser(stream, {}, (err, parsed) => {
      const to = parsed.to?.value?.[0]?.address;
      if (to) {
        if (!emails.has(to)) emails.set(to, []);
        emails.get(to)!.push(parsed);
      }
      callback();
    });
  },
});

server.listen(2525);
```

Configure your auth provider to use `localhost:2525` as SMTP server in test mode.

---

## Part D: E2E Test Suites (Playwright)

### Project Structure

```
tests/
  e2e/
    fixtures.ts              # Shared test fixtures (email helper, API client)
    user-registration.spec.ts
    user-signin.spec.ts
    organization-crud.spec.ts
    organization-invite.spec.ts
    project-management.spec.ts
    rbac-enforcement.spec.ts
  helpers/
    email-helper.ts          # Unified email testing interface
    auth-test-utils.ts       # Programmatic user/org creation
    api-client.ts            # Typed API client for backend calls
```

### Unified Email Helper Interface

Regardless of which email testing approach you use, wrap it behind a common interface:

```typescript
// tests/helpers/email-helper.ts

export interface TestEmail {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}

export interface EmailHelper {
  generateEmail(prefix?: string): string;
  waitForEmail(to: string, opts?: { subjectContains?: string; timeout?: number }): Promise<TestEmail>;
  extractVerificationCode(email: TestEmail): string | null;
  extractLink(email: TestEmail, pattern?: RegExp): string | null;
  cleanup(to: string): Promise<void>;
}

// Factory — pick implementation based on env
export function createEmailHelper(): EmailHelper {
  if (process.env.EMAIL_WORKER_URL) return new CloudflareEmailHelper(/* ... */);
  if (process.env.MAILOSAUR_API_KEY) return new MailosaurEmailHelper(/* ... */);
  if (process.env.MAILSLURP_API_KEY) return new MailSlurpEmailHelper(/* ... */);
  throw new Error('No email testing backend configured. Set EMAIL_WORKER_URL, MAILOSAUR_API_KEY, or MAILSLURP_API_KEY.');
}
```

### Test Fixtures

```typescript
// tests/e2e/fixtures.ts
import { test as base } from '@playwright/test';
import { createEmailHelper, type EmailHelper } from '../helpers/email-helper';
import { createApiClient, type ApiClient } from '../helpers/api-client';
import { createAuthTestUtils, type AuthTestUtils } from '../helpers/auth-test-utils';

type Fixtures = {
  emailHelper: EmailHelper;
  testEmail: string;
  api: ApiClient;
  authUtils: AuthTestUtils;
};

export const test = base.extend<Fixtures>({
  emailHelper: async ({}, use) => {
    await use(createEmailHelper());
  },

  testEmail: async ({ emailHelper }, use) => {
    const email = emailHelper.generateEmail();
    await use(email);
    await emailHelper.cleanup(email);
  },

  api: async ({}, use) => {
    await use(createApiClient(process.env.API_BASE_URL || 'http://localhost:8080'));
  },

  authUtils: async ({}, use) => {
    await use(createAuthTestUtils());
  },
});

export { expect } from '@playwright/test';
```

### Test Suite 1: User Registration

```typescript
// tests/e2e/user-registration.spec.ts
import { test, expect } from './fixtures';

test.describe('User Registration', () => {
  test('full sign-up flow with email verification', async ({ page, testEmail, emailHelper }) => {
    // 1. Go to sign-up page
    await page.goto('/sign-up');

    // 2. Enter email
    await page.getByLabel('Email').fill(testEmail);
    await page.getByRole('button', { name: /continue/i }).click();

    // 3. Wait for verification email
    const email = await emailHelper.waitForEmail(testEmail, {
      subjectContains: 'verification',
      timeout: 60_000,
    });
    expect(email).toBeTruthy();

    // 4. Extract and enter verification code
    const code = emailHelper.extractVerificationCode(email);
    expect(code).toBeTruthy();
    await page.getByLabel('Code').fill(code!);
    await page.getByRole('button', { name: /verify/i }).click();

    // 5. Set password
    await page.getByLabel('Password').fill('TestPass123!');
    await page.getByRole('button', { name: /continue/i }).click();

    // 6. Should land on dashboard/onboarding
    await expect(page).toHaveURL(/\/(onboarding|dashboard|projects)/);
  });

  test('duplicate email is rejected', async ({ page, authUtils }) => {
    const existing = await authUtils.getExistingTestUser();

    await page.goto('/sign-up');
    await page.getByLabel('Email').fill(existing.email);
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page.getByText(/already exists|already registered/i)).toBeVisible();
  });
});
```

### Test Suite 2: Organization Management

```typescript
// tests/e2e/organization-crud.spec.ts
import { test, expect } from './fixtures';

test.describe('Organization CRUD', () => {
  test('create, update, list, delete org via API', async ({ api, authUtils }) => {
    const token = await authUtils.getTestUserToken();

    // Create
    const org = await api.post('/v1/orgs', { name: 'E2E Org', slug: 'e2e-org' }, token);
    expect(org.status).toBe(201);
    const orgData = await org.json();
    expect(orgData.name).toBe('E2E Org');

    // List
    const list = await api.get('/v1/orgs', token);
    const orgs = await list.json();
    expect(orgs.some((o: any) => o.id === orgData.id)).toBe(true);

    // Update
    const updated = await api.patch(`/v1/orgs/${orgData.id}`, { name: 'Updated Org' }, token);
    expect(updated.status).toBe(200);

    // Delete
    const deleted = await api.delete(`/v1/orgs/${orgData.id}`, token);
    expect(deleted.status).toBe(200);
  });
});
```

### Test Suite 3: Invitation Flow with Real Email

```typescript
// tests/e2e/organization-invite.spec.ts
import { test, expect } from './fixtures';

test.describe('Organization Invitation', () => {
  test('invite user, verify email received, accept invite', async ({
    api, authUtils, testEmail, emailHelper
  }) => {
    const token = await authUtils.getTestUserToken();
    const orgId = await authUtils.getTestOrgId();

    // 1. Send invitation
    const invite = await api.post(`/v1/orgs/${orgId}/invites`, {
      email: testEmail,
      role: 'member',
    }, token);
    expect(invite.status).toBe(201);

    // 2. Verify email arrived
    const email = await emailHelper.waitForEmail(testEmail, {
      subjectContains: 'invite',
      timeout: 60_000,
    });
    expect(email.subject).toContain('invite');

    // 3. Extract invite link
    const inviteLink = emailHelper.extractLink(email, /invite|accept/);
    expect(inviteLink).toBeTruthy();

    // 4. (Optional) Navigate to invite link and complete sign-up
    // This creates a new user who is then a member of the org
  });
});
```

### Test Suite 4: RBAC Enforcement

```typescript
// tests/e2e/rbac-enforcement.spec.ts
import { test, expect } from './fixtures';

test.describe('RBAC Enforcement', () => {
  test('owner can manage members, member cannot', async ({ api, authUtils }) => {
    const ownerToken = await authUtils.getTestUserToken('owner');
    const memberToken = await authUtils.getTestUserToken('member');
    const orgId = await authUtils.getTestOrgId();

    // Owner can list members
    const ownerList = await api.get(`/v1/orgs/${orgId}/members`, ownerToken);
    expect(ownerList.status).toBe(200);

    // Member can list members (read access)
    const memberList = await api.get(`/v1/orgs/${orgId}/members`, memberToken);
    expect(memberList.status).toBe(200);

    // Member cannot add members
    const memberAdd = await api.post(`/v1/orgs/${orgId}/members`, {
      userId: 'someone', role: 'member'
    }, memberToken);
    expect(memberAdd.status).toBe(403);
  });

  test('project editor can write but not admin', async ({ api, authUtils }) => {
    const editorToken = await authUtils.getTestUserToken('editor');
    const projectId = await authUtils.getTestProjectId();

    // Can update project content
    const write = await api.patch(`/v1/projects/${projectId}`, { description: 'updated' }, editorToken);
    expect(write.status).toBe(200);

    // Cannot manage project members
    const admin = await api.post(`/v1/projects/${projectId}/members`, {
      userId: 'someone', role: 'viewer'
    }, editorToken);
    expect(admin.status).toBe(403);
  });

  test('viewer has read-only access', async ({ api, authUtils }) => {
    const viewerToken = await authUtils.getTestUserToken('viewer');
    const projectId = await authUtils.getTestProjectId();

    // Can read
    const read = await api.get(`/v1/projects/${projectId}`, viewerToken);
    expect(read.status).toBe(200);

    // Cannot write
    const write = await api.patch(`/v1/projects/${projectId}`, { name: 'nope' }, viewerToken);
    expect(write.status).toBe(403);

    // Cannot delete
    const del = await api.delete(`/v1/projects/${projectId}`, viewerToken);
    expect(del.status).toBe(403);
  });
});
```

---

## Part E: API Routes Reference

### Auth

| Method | Path | Auth Required | Description |
|--------|------|:---:|-------------|
| GET | `/v1/auth/profile` | Yes | Current user profile |
| POST | `/v1/auth/token` | Yes | Exchange auth JWT for scoped service token |
| POST | `/v1/auth/onboarding` | Yes | Create first org + project after sign-up |
| POST | `/api/webhooks/auth` | No (signature verified) | Auth provider webhook receiver |

### Organizations

| Method | Path | Min Role | Description |
|--------|------|:---:|-------------|
| POST | `/v1/orgs` | authenticated | Create org (caller becomes owner) |
| GET | `/v1/orgs` | authenticated | List caller's orgs |
| GET | `/v1/orgs/:id` | member | Get org |
| PATCH | `/v1/orgs/:id` | owner | Update org |
| DELETE | `/v1/orgs/:id` | owner | Delete org |
| GET | `/v1/orgs/:id/members` | member | List members |
| POST | `/v1/orgs/:id/members` | admin | Add member |
| PATCH | `/v1/orgs/:id/members/:uid` | admin | Update role |
| DELETE | `/v1/orgs/:id/members/:uid` | admin | Remove member |
| POST | `/v1/orgs/:id/invites` | admin | Send email invite |
| GET | `/v1/orgs/:id/invites` | admin | List pending invites |

### Projects

| Method | Path | Min Role | Description |
|--------|------|:---:|-------------|
| POST | `/v1/projects` | org:member | Create project in org |
| GET | `/v1/projects` | authenticated | List caller's projects |
| GET | `/v1/projects/:id` | viewer | Get project |
| PATCH | `/v1/projects/:id` | editor | Update project |
| DELETE | `/v1/projects/:id` | admin | Soft-delete project |
| GET | `/v1/projects/:id/members` | viewer | List project members |
| POST | `/v1/projects/:id/members` | admin | Add member |
| PATCH | `/v1/projects/:id/members/:uid` | admin | Update role |
| DELETE | `/v1/projects/:id/members/:uid` | admin | Remove member |

---

## Part F: Implementation Checklist

### Phase 1: Auth Foundation (~2-4 hours)
- [ ] Choose auth provider (see Part A comparison table)
- [ ] Create auth provider application, get API keys
- [ ] Set up environment variables (copy from `.env.example`)
- [ ] Frontend: install provider SDK, add sign-in/sign-up pages
- [ ] Frontend: add auth middleware (protect routes)
- [ ] Backend: implement JWT verification
- [ ] Backend: implement auto-user sync middleware
- [ ] Backend: implement webhook endpoint
- [ ] Verify: can sign up, sign in, and make authenticated API calls

### Phase 2: Multi-Tenancy (~4-8 hours)
- [ ] Run database migrations (users, orgs, org_members, projects, project_members)
- [ ] Implement org CRUD API routes
- [ ] Implement org member management routes
- [ ] Implement org invitation flow
- [ ] Implement project CRUD API routes
- [ ] Implement project member management routes
- [ ] Implement RBAC policy functions
- [ ] Wire role checks into all protected endpoints
- [ ] Verify: full org + project lifecycle works manually

### Phase 3: Automated Testing (~4-8 hours)
- [ ] Choose email testing approach (see Part C comparison table)
- [ ] Set up email testing backend (deploy worker / create Mailosaur account / etc.)
- [ ] Implement `EmailHelper` interface for chosen approach
- [ ] Create Playwright test fixtures
- [ ] Write user registration E2E tests
- [ ] Write sign-in E2E tests
- [ ] Write org CRUD E2E tests
- [ ] Write invitation flow E2E tests (with real email)
- [ ] Write project management E2E tests
- [ ] Write RBAC enforcement E2E tests
- [ ] Verify: all tests pass in CI

---

## Part H: MCP Server Authentication

MCP (Model Context Protocol) servers expose tools that LLMs call on behalf of users. The core challenge: **the LLM is not the user** — it acts as a delegate. Your auth system must propagate user identity and permissions through the MCP layer without giving the LLM unbounded access.

### The Problem

```
User (browser) → Frontend → LLM Agent → MCP Server → Your Backend API
                                ↑
                          Who is "the caller" here?
                          What permissions does it have?
```

The LLM doesn't have its own identity. It acts on behalf of a user, within a specific project/org context. The MCP server needs to:
1. Know **which user** the LLM is acting for
2. Know **which project/org** the call is scoped to
3. Enforce **tool-level permissions** (not all tools for all users)
4. Use a token that **expires quickly** and has **narrow scope**

### Auth Flow: User-Delegated MCP Tokens

```
1. User signs in → gets Clerk JWT (broad, long-lived)

2. Frontend exchanges Clerk JWT for MCP service token:
   POST /v1/auth/token
   Authorization: Bearer <clerk_jwt>
   Body: { "audience": "mcp", "scopes": ["tools:read", "tools:write"], "project_id": "..." }
   Response: { "token": "<mcp_service_jwt>", "expires_at": "..." }

3. Frontend passes MCP token to LLM agent context

4. LLM calls MCP server with:
   Authorization: Bearer <mcp_service_jwt>

5. MCP server verifies token, extracts user_id + project_id + scopes

6. MCP server calls backend API with same token (or mints a further-scoped token)
```

**Key principle: each hop narrows the scope.** The Clerk JWT can do anything the user can. The MCP token can only call tools within a specific project. A downstream file-worker token can only read/write files in that project.

### MCP Service Token (JWT Claims)

```json
{
  "sub": "user_abc123",
  "tenant_id": "org_xyz789",
  "project_id": "proj_456",
  "aud": "mcp",
  "scopes": ["tools:read", "tools:write", "files:read"],
  "iss": "your-backend",
  "iat": 1711100000,
  "exp": 1711100900
}
```

- **Short-lived**: 15 minutes max (MCP calls are transactional, not sessions)
- **Project-scoped**: cannot access other projects even if user has access
- **Scope-limited**: only the permissions the agent needs, not all user permissions

### Tool-Level Permission Mapping

Map each MCP tool to the minimum required permission:

```typescript
const TOOL_PERMISSIONS: Record<string, string[]> = {
  // Read-only tools
  'list_files':       ['files:read'],
  'get_file':         ['files:read'],
  'search':           ['project:read'],
  'get_project_info': ['project:read'],

  // Write tools
  'create_file':      ['files:write'],
  'update_file':      ['files:write'],
  'delete_file':      ['files:write', 'files:delete'],

  // Admin tools
  'manage_members':   ['project:admin'],
  'update_settings':  ['project:admin'],
};

function checkToolPermission(tool: string, tokenScopes: string[]): boolean {
  const required = TOOL_PERMISSIONS[tool];
  if (!required) return false; // Unknown tool = deny
  return required.every(scope => tokenScopes.includes(scope));
}
```

### MCP Server Middleware

```typescript
// mcp-server/src/auth.ts
import jwt from 'jsonwebtoken';

interface McpAuthContext {
  userId: string;
  tenantId: string;
  projectId: string | null;
  scopes: string[];
}

export function verifyMcpToken(token: string): McpAuthContext {
  const payload = jwt.verify(token, process.env.JWT_PUBLIC_KEY!, {
    algorithms: ['RS256'],
    audience: 'mcp',
    issuer: 'your-backend',
  }) as any;

  return {
    userId: payload.sub,
    tenantId: payload.tenant_id,
    projectId: payload.project_id || null,
    scopes: payload.scopes || [],
  };
}

// In tool handler:
async function handleToolCall(toolName: string, args: any, token: string) {
  const auth = verifyMcpToken(token);

  if (!checkToolPermission(toolName, auth.scopes)) {
    throw new Error(`Permission denied: ${toolName} requires ${TOOL_PERMISSIONS[toolName]}`);
  }

  // Execute tool with user context
  return await executeTool(toolName, args, {
    userId: auth.userId,
    tenantId: auth.tenantId,
    projectId: auth.projectId,
  });
}
```

### MCP Transport Auth

MCP supports multiple transports. Auth works differently for each:

| Transport | Auth Mechanism | Notes |
|-----------|---------------|-------|
| **stdio** (local) | Env var with token | `bearer_token_env_var` in MCP config |
| **SSE** (HTTP stream) | Bearer token in initial request | Set in `Authorization` header |
| **WebSocket** | Token in connection handshake | Pass in query param or first message |
| **Streamable HTTP** | Bearer per request | Standard `Authorization: Bearer` header |

For remote MCP servers, always use HTTPS. For local stdio servers, the token in env is sufficient since the process is sandboxed.

### Downstream Token Chain

When an MCP tool needs to call another service (file storage, database, external API), it should exchange the MCP token for a further-scoped token:

```
MCP token (scopes: tools:read, tools:write, files:read)
  ↓ exchange at /v1/auth/token
File-worker token (scopes: files:read, audience: file-worker, project_id: proj_456)
```

Never pass the user's original Clerk JWT to downstream services. Each service gets the minimum token it needs.

### Testing MCP Auth

```typescript
// Test: MCP tool call with valid token succeeds
test('authenticated tool call succeeds', async () => {
  const token = await mintTestMcpToken({
    userId: 'test-user',
    projectId: 'test-project',
    scopes: ['tools:read', 'files:read'],
  });

  const res = await mcpClient.callTool('list_files', { path: '/' }, token);
  expect(res.status).toBe(200);
});

// Test: MCP tool call without permission is denied
test('tool call without required scope is denied', async () => {
  const token = await mintTestMcpToken({
    userId: 'test-user',
    projectId: 'test-project',
    scopes: ['tools:read'], // missing files:write
  });

  const res = await mcpClient.callTool('create_file', { path: '/test.txt' }, token);
  expect(res.status).toBe(403);
});

// Test: MCP token for wrong project is denied
test('tool call with wrong project scope is denied', async () => {
  const token = await mintTestMcpToken({
    userId: 'test-user',
    projectId: 'other-project',
    scopes: ['tools:read', 'files:read'],
  });

  const res = await mcpClient.callTool('list_files', { path: '/', projectId: 'test-project' }, token);
  expect(res.status).toBe(403);
});

// Test: expired MCP token is rejected
test('expired token is rejected', async () => {
  const token = await mintTestMcpToken({
    userId: 'test-user',
    scopes: ['tools:read'],
    expiresInSeconds: -1, // already expired
  });

  const res = await mcpClient.callTool('list_files', { path: '/' }, token);
  expect(res.status).toBe(401);
});
```

---

## Part I: CLI OAuth

Command-line tools and headless agents can't open a browser popup for OAuth. They need flows designed for devices without a browser, or where the user authenticates in a separate browser session.

### The Problem

```
CLI tool running in terminal
  → Needs to make authenticated API calls
  → User can't click an OAuth consent screen inside the terminal
  → Token must be stored securely on disk
  → Token must refresh without user interaction
```

### Three CLI Auth Approaches

| Approach | User Experience | Security | Complexity | Best For |
|----------|:---:|:---:|:---:|---------|
| **Device Code Flow** | User visits URL, enters code | High | Medium | Public CLIs, multi-platform |
| **PKCE + Localhost Redirect** | Browser opens, auto-redirects back | High | Medium | Desktop CLIs with browser access |
| **API Key / Personal Token** | User copies token from dashboard | Medium | Low | Scripts, CI/CD, headless |

### Approach 1: Device Code Flow (RFC 8628)

Best for CLIs that can't guarantee a local browser. Works on SSH sessions, remote servers, containers.

```
1. CLI requests device code:
   POST /oauth/device/code
   Body: { client_id: "cli-app", scope: "read write" }
   Response: {
     device_code: "ABCD-1234",
     user_code: "FGHJ-5678",
     verification_uri: "https://yourapp.com/device",
     expires_in: 900,
     interval: 5
   }

2. CLI shows user:
   "Visit https://yourapp.com/device and enter code: FGHJ-5678"

3. User opens URL in any browser, signs in, enters code

4. CLI polls for token:
   POST /oauth/token
   Body: { grant_type: "device_code", device_code: "ABCD-1234", client_id: "cli-app" }
   Response (pending): { error: "authorization_pending" }
   Response (success): { access_token: "...", refresh_token: "...", expires_in: 3600 }

5. CLI stores token and uses it for API calls
```

**Implementation:**

```typescript
// cli/src/auth/device-flow.ts

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string; // URI with code pre-filled
  expires_in: number;
  interval: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export async function deviceCodeLogin(authBaseUrl: string, clientId: string): Promise<TokenResponse> {
  // Step 1: Request device code
  const codeRes = await fetch(`${authBaseUrl}/oauth/device/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, scope: 'read write' }),
  });
  const deviceCode: DeviceCodeResponse = await codeRes.json();

  // Step 2: Show user instructions
  console.log(`\nTo authenticate, visit:\n  ${deviceCode.verification_uri}\n`);
  console.log(`And enter code: ${deviceCode.user_code}\n`);

  // Try to open browser automatically (optional, best-effort)
  if (deviceCode.verification_uri_complete) {
    try {
      const open = (await import('open')).default;
      await open(deviceCode.verification_uri_complete);
      console.log('Browser opened automatically. Waiting for authorization...\n');
    } catch {
      // Browser didn't open — user will do it manually
    }
  }

  // Step 3: Poll for token
  const deadline = Date.now() + deviceCode.expires_in * 1000;
  const interval = (deviceCode.interval || 5) * 1000;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, interval));

    const tokenRes = await fetch(`${authBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode.device_code,
        client_id: clientId,
      }),
    });

    if (tokenRes.ok) {
      return await tokenRes.json();
    }

    const error = await tokenRes.json();
    if (error.error === 'authorization_pending') continue;
    if (error.error === 'slow_down') {
      await new Promise(r => setTimeout(r, 5000)); // back off
      continue;
    }
    throw new Error(`Auth failed: ${error.error_description || error.error}`);
  }

  throw new Error('Device code expired. Please try again.');
}
```

### Approach 2: PKCE + Localhost Redirect (RFC 7636)

Best for desktop CLIs where the user has a local browser. Spins up a temporary local HTTP server to catch the OAuth redirect.

```
1. CLI generates PKCE code_verifier + code_challenge
2. CLI starts temporary HTTP server on localhost:PORT
3. CLI opens browser:
   https://auth-provider.com/authorize?
     client_id=cli-app&
     redirect_uri=http://localhost:PORT/callback&
     response_type=code&
     code_challenge=...&
     code_challenge_method=S256&
     scope=read+write

4. User signs in and consents in browser

5. Auth provider redirects to localhost:PORT/callback?code=AUTH_CODE

6. CLI catches the redirect, exchanges code for token:
   POST /oauth/token
   Body: { grant_type: authorization_code, code: AUTH_CODE, code_verifier: ... }

7. CLI shuts down temporary server, stores token
```

**Implementation:**

```typescript
// cli/src/auth/pkce-flow.ts
import http from 'http';
import crypto from 'crypto';

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export async function pkceLogin(
  authorizeUrl: string,
  tokenUrl: string,
  clientId: string,
): Promise<TokenResponse> {
  const { verifier, challenge } = generatePKCE();
  const port = await findFreePort(); // Find an available port
  const redirectUri = `http://localhost:${port}/callback`;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${port}`);
      if (url.pathname !== '/callback') return;

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication failed</h1><p>You can close this tab.</p>');
        server.close();
        reject(new Error(`Auth error: ${error}`));
        return;
      }

      // Exchange code for token
      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
          client_id: clientId,
        }),
      });

      const token: TokenResponse = await tokenRes.json();
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Authenticated!</h1><p>You can close this tab and return to the CLI.</p>');
      server.close();
      resolve(token);
    });

    server.listen(port, () => {
      const authUrl = `${authorizeUrl}?` + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        scope: 'read write',
      }).toString();

      console.log(`Opening browser for authentication...`);
      import('open').then(m => m.default(authUrl)).catch(() => {
        console.log(`Open this URL in your browser:\n  ${authUrl}\n`);
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => { server.close(); reject(new Error('Auth timed out')); }, 300_000);
  });
}
```

### Approach 3: API Keys / Personal Access Tokens

Simplest approach. User creates a token in the web dashboard, pastes it into the CLI.

```typescript
// cli/src/auth/api-key.ts
export async function apiKeyLogin(): Promise<string> {
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise(resolve => {
    rl.question('Paste your API key (from dashboard → Settings → API Keys):\n> ', (key) => {
      rl.close();
      resolve(key.trim());
    });
  });
}
```

Store API keys as long-lived tokens in the database:

```sql
CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- "My CLI token"
  token_hash TEXT NOT NULL,     -- SHA-256 of the token (never store plaintext)
  scopes TEXT[] NOT NULL,       -- ['read', 'write']
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,       -- NULL = never expires
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Token Storage

CLI tokens must be stored securely on disk. Never in plaintext config files.

```typescript
// cli/src/auth/token-store.ts
import fs from 'fs';
import path from 'path';
import os from 'os';

interface StoredAuth {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix timestamp
}

const TOKEN_DIR = path.join(os.homedir(), '.config', 'your-cli');
const TOKEN_FILE = path.join(TOKEN_DIR, 'auth.json');

export function saveToken(auth: StoredAuth): void {
  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(auth), { mode: 0o600 });
}

export function loadToken(): StoredAuth | null {
  try {
    const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try { fs.unlinkSync(TOKEN_FILE); } catch {}
}

export function isTokenExpired(auth: StoredAuth): boolean {
  // Refresh 5 minutes before expiry
  return Date.now() > (auth.expires_at - 300) * 1000;
}
```

### Token Refresh

```typescript
// cli/src/auth/refresh.ts
export async function refreshAccessToken(
  tokenUrl: string,
  clientId: string,
  refreshToken: string,
): Promise<TokenResponse> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!res.ok) {
    throw new Error('Refresh failed — please sign in again: yourctl auth login');
  }
  return res.json();
}
```

### Unified CLI Auth (Putting It Together)

```typescript
// cli/src/auth/index.ts
export async function getAuthToken(): Promise<string> {
  // 1. Check for stored token
  const stored = loadToken();
  if (stored && !isTokenExpired(stored)) {
    return stored.access_token;
  }

  // 2. Try refresh
  if (stored?.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(TOKEN_URL, CLIENT_ID, stored.refresh_token);
      saveToken({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || stored.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      });
      return refreshed.access_token;
    } catch {
      // Refresh failed — fall through to re-auth
    }
  }

  // 3. Check for API key in env (CI/CD use case)
  if (process.env.YOUR_API_KEY) {
    return process.env.YOUR_API_KEY;
  }

  // 4. Interactive login required
  throw new Error('Not authenticated. Run: yourctl auth login');
}
```

### CLI Auth with Clerk

Clerk doesn't natively support device code flow, but you can implement it using Clerk's Backend API:

```typescript
// Backend: POST /v1/auth/device/code
async function createDeviceCode(clientId: string) {
  const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // e.g., "A1B2-C3D4"
  const deviceCode = crypto.randomBytes(32).toString('hex');

  // Store in Redis/DB with TTL
  await redis.setex(`device:${deviceCode}`, 900, JSON.stringify({
    user_code: code,
    client_id: clientId,
    status: 'pending',  // pending → approved → used
    user_id: null,
  }));

  return {
    device_code: deviceCode,
    user_code: code,
    verification_uri: `${APP_URL}/device`,
    expires_in: 900,
    interval: 5,
  };
}

// Frontend: /device page
// User signs in with Clerk, enters code, page calls:
// POST /v1/auth/device/approve { user_code: "A1B2-C3D4" }
// Backend sets status → approved, stores user_id from Clerk session

// Backend: POST /v1/auth/device/token
// CLI polls this. When status is approved, mint a service JWT for the CLI.
```

### Comparison: When to Use Which

```
Is this a public-facing CLI that end users install?
├── YES
│   ├── Users will always have a local browser?
│   │   ├── YES → PKCE + localhost redirect (smoothest UX)
│   │   └── NO  → Device code flow (works over SSH, in containers)
│   └──
└── NO (internal tool, scripts, CI/CD)
    ├── Interactive (human runs it)?
    │   ├── YES → PKCE or device code
    │   └── NO  → API key via env var (YOUR_API_KEY=...)
    └──
```

---

## Part G: Gotchas & Patterns

**Email normalization:** Always `email.trim().toLowerCase()` before comparison or storage.

**Race condition on first login:** Webhook and first API request may arrive simultaneously. Use `INSERT ... ON CONFLICT DO UPDATE` (upsert) with the auth_provider_id unique constraint.

**Webhook ordering:** `user.created` webhook may arrive *after* the user's first API call. The auto-sync middleware handles this — it creates the user on-demand, and the webhook upserts.

**Soft deletes:** Always soft-delete projects and orgs. Hard deletes require cascading cleanup of files, data, and external resources.

**JWKS caching:** Cache the auth provider's JWKS for 1 hour. This avoids a network call on every request.

**Test isolation:** Generate unique emails per test (`test-<uuid>@domain`). Clean up test users/orgs in `afterAll`. Never share state between parallel test workers.

**Rate limits:** Clerk rate-limits user creation to ~20/second. In CI with parallel tests, use a pool of pre-created test users or serialize user creation.

**Invite acceptance by existing users:** When an existing user accepts an org invitation, the flow differs from a new user: they don't need to sign up — they sign in, then the invitation is auto-accepted. Handle both paths:
- New user: invite link → sign-up → auto-join org on account creation
- Existing user: invite link → sign-in → `organizationMembership.created` webhook fires → upsert local org_member
  Your invite-accept handler must check whether the invitee already has an account (by email) and branch accordingly.

**Clerk org ↔ local org sync:** If using Clerk Organizations, keep `clerk_org_id` in your local `organizations` table. On invitation accept, the webhook creates the local org membership. If managing orgs locally only (not via Clerk), leave `auth_provider_org_id` NULL and handle invitations yourself.
