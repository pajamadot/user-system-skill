# Meta-Thinking Framework — User System Skill

This document defines how to **think about** this skill, evaluate its quality, find gaps, and evolve it systematically. It is a skill about improving the skill.

---

## 1. The Three Lenses

Every change to this skill should be evaluated through three lenses:

### Lens A: Completeness — "Does it cover all real-world scenarios?"

Test by asking:
- Can a brand-new user go from zero to signed-in with a verified email?
- Can an existing user be invited to an org they've never seen?
- Can an admin revoke access from someone mid-session?
- Can the system survive the auth provider being down for 5 minutes?
- Can every role boundary be tested automatically, not just manually?

**Evaluation matrix:**

| User Lifecycle Stage | Covered in Skill? | Has E2E Test? | Has Edge Case Tests? |
|---------------------|:-:|:-:|:-:|
| Email sign-up | Yes | Yes | Partial (duplicate email) |
| Email verification (OTP) | Yes | Yes | No (expired code, resend) |
| Password sign-in | Yes | Yes | No (lockout, brute force) |
| OAuth sign-in (Google, GitHub) | Mentioned | No | No |
| Password reset | Mentioned | No | No |
| Session management | No | No | No |
| Account deletion (GDPR) | No | No | No |
| Org creation | Yes | Yes | No (name conflicts) |
| Org invitation | Yes | Yes | Partial |
| Invite accept (new user) | Partial | No | No |
| Invite accept (existing user) | No | No | No |
| Role change | Yes | Yes | No (self-demotion) |
| Member removal | Yes | Yes | No (remove last owner) |
| Project CRUD | Yes | Yes | Partial |
| Project member management | Yes | Yes | No (cross-org access) |
| RBAC enforcement | Yes | Yes | No (role escalation) |
| Webhook failure/retry | Mentioned | No | No |
| Token expiration mid-request | No | No | No |
| Multi-device sessions | No | No | No |

**Action:** Each "No" is a candidate for the next evolution cycle.

### Lens B: Assumptions — "What are we taking for granted?"

Every architecture has hidden assumptions. Surface them and test them.

| Assumption | Evidence | Risk if Wrong | How to Test |
|-----------|----------|--------------|------------|
| Auth provider is always available | Assumed | User can't sign in; auto-sync fails | Chaos test: block JWKS endpoint, verify graceful degradation |
| Emails arrive within 60 seconds | E2E timeout = 60s | Flaky tests in CI | Measure P95 delivery time across 100 test runs |
| One user = one email address | Schema: email UNIQUE | Can't handle email change or multiple emails | Audit Clerk webhook for `user.updated` with email change |
| Webhooks arrive at least once | Clerk uses svix (retry) | Missing user sync | Log webhook arrivals; detect missing users on API calls |
| Soft delete is sufficient | Schema: deleted_at | Data bloat over time; GDPR requires hard delete | Add hard-delete job with configurable retention |
| Org roles are static (3 levels) | Schema CHECK constraint | Customer needs custom roles | Plan for future: `permissions` JSONB column |
| Project slug is unique per org | Schema UNIQUE | Deleted project blocks slug reuse | Test: delete project, recreate with same slug |
| RLS policies don't kill performance | Optional in schema | Slow queries on large tables | Benchmark with 100K rows, RLS on vs off |

**Action:** Pick the top 3 highest-risk assumptions and add tests or mitigations.

### Lens C: Abstraction Quality — "Is the right thing easy and the wrong thing hard?"

| Quality Signal | Current State | Target |
|---------------|:---:|:---:|
| Adding a new auth provider | Implement full `AuthTestUtils` class | Implement 3 methods, rest are defaults |
| Adding a new email backend | Implement full `EmailHelper` class | Implement 2 methods, rest are defaults |
| Adding a new org role | ALTER TABLE + code change | Config-driven, no schema change |
| Adding a new project role | ALTER TABLE + code change | Config-driven, no schema change |
| Running tests against staging | Change env vars | One command: `npm run e2e:staging` |
| Understanding what went wrong | Read test output | Screenshot + trace auto-attached on failure |

---

## 2. The Improvement Loop

```
    ┌──────────────────────────────────┐
    │                                  │
    │   1. EVALUATE                    │
    │   Run self-eval tests            │
    │   Fill in matrices above         │
    │   Score: completeness %,         │
    │          assumption risk,        │
    │          abstraction quality     │
    │                                  │
    ▼                                  │
┌────────┐                             │
│ DECIDE │  Pick 1-3 highest-impact    │
│        │  gaps to close this cycle   │
└───┬────┘                             │
    │                                  │
    ▼                                  │
┌────────┐                             │
│ BUILD  │  Implement the fix/feature  │
│        │  Write tests FIRST          │
└───┬────┘                             │
    │                                  │
    ▼                                  │
┌────────┐                             │
│ VERIFY │  Run all tests              │
│        │  Update matrices            │
│        │  Did score improve?         │
└───┬────┘                             │
    │                                  │
    └──────────────────────────────────┘
```

### Cycle Cadence

- **After each new project uses this skill**: Run the evaluation, note what was missing or painful
- **After each auth provider incident**: Check assumption table, add chaos tests
- **Quarterly**: Full review of all three lenses

---

## 3. Gap Analysis Dimensions

When evaluating "what's missing," check these 8 dimensions:

### D1: Security
- [ ] CSRF protection on all state-changing routes
- [ ] Rate limiting on auth endpoints (sign-in, sign-up, password reset)
- [ ] JWT audience validation (prevent token reuse across services)
- [ ] Webhook signature verification (already covered)
- [ ] Admin impersonation audit trail
- [ ] Session revocation on password change
- [ ] API key rotation without downtime

### D2: Resilience
- [ ] Auth provider downtime → cached JWKS continues to work
- [ ] Database connection failure → clear error, no data corruption
- [ ] Webhook delivery failure → retry with idempotency
- [ ] Email delivery failure → user can request resend
- [ ] Concurrent sign-up with same email → deterministic winner

### D3: Scale
- [ ] Schema supports 100K+ users per org
- [ ] Org member listing is paginated
- [ ] Project listing is paginated with cursor
- [ ] JWKS cache is shared across workers/pods, not per-instance
- [ ] Database indexes cover all query patterns

### D4: Compliance
- [ ] Account deletion (GDPR Article 17)
- [ ] Data export (GDPR Article 20)
- [ ] Session audit log
- [ ] IP-based access restrictions
- [ ] Password policy enforcement

### D5: Developer Experience
- [ ] One-command local setup (`npm run setup`)
- [ ] Seed script creates test users/orgs
- [ ] Clear error messages (not raw 500s)
- [ ] OpenAPI spec auto-generated from routes
- [ ] Type-safe API client generated from spec

### D6: Observability
- [ ] Structured logging on all auth events
- [ ] Metrics: sign-up rate, sign-in failures, invitation acceptance rate
- [ ] Alerts: auth failure spike, webhook backlog
- [ ] Distributed tracing through auth → sync → API flow

### D7: Multi-Tenancy Edge Cases
- [ ] User belongs to multiple orgs
- [ ] User switches active org mid-session
- [ ] Org transfer (change owner)
- [ ] Merge two orgs
- [ ] Cross-org project sharing (future?)

### D8: Testing Maturity
- [ ] Unit tests for RBAC policy functions
- [ ] Integration tests for webhook → DB sync
- [ ] E2E tests for full user lifecycle
- [ ] Chaos tests for provider downtime
- [ ] Performance tests for auth hot path
- [ ] Visual regression tests for auth UI

---

## 4. Architecture Decision Records (ADR)

Track why decisions were made so future iterations can revisit them.

### ADR-001: Auth provider as external SaaS (not self-hosted)
- **Context:** Need auth quickly, don't want to manage password hashing, MFA, etc.
- **Decision:** Use Clerk/Auth0/etc. as SaaS. Mirror users locally.
- **Tradeoff:** Vendor dependency. Mitigated by `auth_provider_id` abstraction — can swap providers.
- **Revisit when:** Monthly auth cost exceeds $500, or provider has repeated outages.

### ADR-002: Organization-scoped projects (not flat)
- **Context:** Both Story and RealLink use org → project hierarchy.
- **Decision:** Projects belong to exactly one org. No cross-org projects.
- **Tradeoff:** Can't share a project across orgs.
- **Revisit when:** Users request cross-org collaboration.

### ADR-003: Catch-all email routing for tests (not mock SMTP)
- **Context:** Need to test real email delivery, not just mock it.
- **Decision:** Route test emails through real infrastructure (Cloudflare/Mailosaur).
- **Tradeoff:** Tests are slower (30-60s for email). Adds external dependency.
- **Revisit when:** Email-dependent tests become the CI bottleneck.

### ADR-004: Soft delete everywhere
- **Context:** Hard deletes lose data and require cascading cleanup.
- **Decision:** All destructive operations are soft deletes (`deleted_at` timestamp).
- **Tradeoff:** Data grows forever. Need a separate hard-delete/purge job.
- **Revisit when:** Database size becomes a cost concern.

### ADR-005: Three fixed org roles, three fixed project roles
- **Context:** Simple is better. Most apps need owner/admin/member and admin/editor/viewer.
- **Decision:** Roles are CHECK-constrained in the schema. No custom roles.
- **Tradeoff:** Can't handle niche permission needs without schema migration.
- **Revisit when:** A customer needs a "billing admin" or "auditor" role.

---

## 5. Evolution Priorities (Current)

Based on the gap analysis above, here are the highest-impact improvements ranked:

| Priority | Gap | Dimension | Effort | Impact |
|:---:|-----|:---------:|:------:|:------:|
| 1 | Password reset E2E test | D8/D1 | Low | High — untested critical path |
| 2 | OAuth sign-in (Google) E2E test | D8/D1 | Medium | High — common auth method |
| 3 | Account deletion (GDPR) | D4 | Medium | High — legal requirement |
| 4 | Invite accept by existing user | D1 | Low | Medium — common flow |
| 5 | Rate limiting on auth endpoints | D2 | Low | Medium — security baseline |
| 6 | Webhook failure retry handling | D2 | Low | Medium — resilience |
| 7 | Pagination for member/project lists | D3 | Low | Medium — scale baseline |
| 8 | Session revocation on password change | D1 | Medium | Medium — security |

**Next cycle: Pick priorities 1-3.**

---

## 6. How to Run a Self-Evaluation

```bash
# Run the automated self-eval (checks skill completeness)
npx tsx tests/meta/self-eval.ts

# Output:
# Completeness Score: 67% (18/27 lifecycle stages covered)
# Test Coverage: 54% (7/13 test suites implemented)
# Assumption Risk: 3 HIGH, 5 MEDIUM, 2 LOW
# Top 3 Gaps: password-reset, oauth-signin, account-deletion
```

See `tests/meta/self-eval.ts` for the implementation.
