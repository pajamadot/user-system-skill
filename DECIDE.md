# Decision Trees — Choose Your Stack

Use these decision trees when starting a new project with this skill. Answer the questions, follow the arrows.

---

## Decision 1: Auth Provider

```
Do you need SSO/SAML for enterprise customers?
├── YES → Auth0 (best enterprise SSO support)
└── NO
    ├── Do you want zero-ops, fastest setup?
    │   ├── YES
    │   │   ├── Need built-in org/team management?
    │   │   │   ├── YES → Clerk (orgs + invites built-in)
    │   │   │   └── NO → Firebase Auth (simplest, wide SDK support)
    │   │   └──
    │   └── NO
    │       ├── Already using Supabase for DB?
    │       │   ├── YES → Supabase Auth (integrated, free tier generous)
    │       │   └── NO
    │       │       ├── Want full control, no vendor lock-in?
    │       │       │   ├── YES
    │       │       │   │   ├── TypeScript project?
    │       │       │   │   │   ├── YES → Better Auth (modern TS, built-in orgs)
    │       │       │   │   │   └── NO → Lucia (lightweight, any language)
    │       │       │   │   └──
    │       │       │   └── NO → Clerk (best DX for most projects)
    │       │       └──
    │       └──
    └──
```

### Quick Comparison

| Factor | Clerk | Auth0 | Supabase Auth | Firebase Auth | Better Auth | Lucia |
|--------|:-----:|:-----:|:------------:|:------------:|:-----------:|:-----:|
| Setup time | 10min | 30min | 15min | 15min | 30min | 1-2hr |
| Org/team support | Built-in | Add-on | DIY | DIY | Built-in | DIY |
| Free tier | 10K MAU | 7.5K MAU | 50K MAU | 50K MAU | Unlimited | Unlimited |
| Self-hostable | No | No | Yes | No | Yes | Yes |
| Webhooks | Svix | Yes | DB triggers | Cloud Fn | Custom | N/A |
| SDK quality | Excellent | Good | Good | Good | Good | Minimal |
| Lock-in risk | Medium | Medium | Low | Medium | None | None |

---

## Decision 2: Email Testing Approach

```
Do you need to test REAL email delivery in CI?
├── YES
│   ├── Already on Cloudflare?
│   │   ├── YES → Cloudflare Email Routing + Worker (free, you own it)
│   │   └── NO
│   │       ├── Want zero setup?
│   │       │   ├── YES
│   │       │   │   ├── Have budget ($99/mo)?
│   │       │   │   │   ├── YES → Mailosaur (most reliable, best API)
│   │       │   │   │   └── NO → MailSlurp free tier (100 emails/mo)
│   │       │   │   └──
│   │       │   └── NO → Custom SMTP server in Docker (self-hosted)
│   │       └──
│   └──
└── NO
    ├── Testing API logic only?
    │   └── YES → Clerk Testing Tokens (bypass email entirely)
    └── Testing UI but mocking email?
        └── YES → Mock the email helper interface in fixtures
```

### Quick Comparison

| Factor | CF Email + Worker | Mailosaur | MailSlurp | Clerk Testing | Custom SMTP |
|--------|:----------------:|:---------:|:---------:|:-------------:|:-----------:|
| Real email? | Yes | Yes | Yes | No | Yes |
| Setup | 30min | 5min | 5min | 2min | 1hr |
| Cost | Free | $99/mo | Free (100/mo) | Free | Free |
| CI-friendly | Yes | Yes | Yes | Yes | Yes (Docker) |
| Reliability | High | Very high | High | Very high | Medium |
| Email latency | 5-15s | 3-10s | 3-10s | 0s (no email) | <1s |

---

## Decision 3: Database Strategy

```
Single-tenant (each user gets isolated data)?
├── YES
│   ├── Want DB-level isolation?
│   │   ├── YES → PostgreSQL RLS (use schema/002_rls_policies.sql)
│   │   └── NO → Application-level filtering (WHERE org_id = ?)
│   └──
└── NO (multi-tenant, shared data between orgs)
    └── Use application-level access control only
        (RLS doesn't help when data is intentionally shared)
```

---

## Decision 4: Role System

```
Are 3 org roles (owner/admin/member) + 3 project roles (admin/editor/viewer) enough?
├── YES → Use the fixed CHECK constraint schema (simpler, safer)
└── NO
    ├── Need 1-2 more roles?
    │   └── Add them to the CHECK constraint, keep it fixed
    └── Need dynamic/custom roles?
        └── Switch to a permissions-based model:
            - Add `permissions JSONB` column to member tables
            - Check permissions directly, not roles
            - Roles become named presets that set permissions
```

---

## Decision 5: When to Run the Meta-Evaluation

```
Just shipped a feature using this skill?
├── YES → Run self-eval, note friction points
│         npx tsx tests/meta/self-eval.ts
└── NO
    ├── Auth provider had an incident?
    │   └── YES → Run assumption tests
    │             npx tsx tests/meta/assumption-tests.ts
    └── Starting a new quarter?
        └── YES → Full review of META.md lenses A, B, C
                  Update evolution priorities
```

---

## Decision 6: MCP Server Auth Strategy

```
Does your MCP server run locally (stdio) or remotely (HTTP/SSE)?
├── LOCAL (stdio)
│   ├── Is the MCP server calling your backend API?
│   │   ├── YES → Pass user's service token via env var
│   │   │         (bearer_token_env_var in MCP config)
│   │   │         Backend validates JWT audience = "mcp"
│   │   └── NO → No auth needed (process-level isolation is sufficient)
│   └──
└── REMOTE (HTTP/SSE/WebSocket)
    ├── Does the LLM act on behalf of a specific user?
    │   ├── YES → User-delegated token chain:
    │   │         Clerk JWT → exchange for MCP service token (short-lived, project-scoped)
    │   │         → MCP server verifies token, extracts user context
    │   │         → MCP calls downstream with further-scoped tokens
    │   └── NO (system-level MCP, no user context)
    │       └── Use a static API key with fixed scopes
    │           (rotatable, stored as env secret)
    └──

Need tool-level permissions?
├── YES → Define TOOL_PERMISSIONS map:
│         tool_name → required scopes
│         Check token scopes before each tool execution
└── NO → Audience-only check is sufficient
         (any valid MCP token can call any tool)
```

---

## Decision 7: CLI / Agent Auth Strategy

```
Is this a public-facing CLI that end users install?
├── YES
│   ├── Users always have a local browser available?
│   │   ├── YES → PKCE + localhost redirect
│   │   │         (smoothest UX — browser opens, auto-redirects back)
│   │   └── NO (SSH, containers, remote servers)
│   │       └── Device code flow
│   │           (user visits URL on any device, enters code)
│   └──
└── NO (internal tool, CI/CD, scripts, agents)
    ├── Human runs it interactively?
    │   ├── YES → Device code OR PKCE (either works)
    │   └── NO (fully automated)
    │       ├── Short-lived task?
    │       │   ├── YES → API key via env var (YOUR_API_KEY=...)
    │       │   └── NO (long-running agent)
    │       │       └── API key + automatic refresh
    │       │           Or: service account with pre-minted token
    │       └──
    └──

How to store the CLI token?
├── macOS → Keychain (via keytar or native API)
├── Linux → Secret Service API or encrypted file (~/.config/your-cli/auth.json, mode 0600)
├── Windows → Windows Credential Manager (via keytar)
└── CI/CD → Environment variable (never written to disk)
```
