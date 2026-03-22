/**
 * Self-Evaluation Script
 *
 * Evaluates the user-system-skill itself for completeness, coverage,
 * and architectural soundness. Run after each evolution cycle.
 *
 * Usage: npx tsx tests/meta/self-eval.ts
 */

import * as fs from "fs";
import * as path from "path";

// ─── Definitions ────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

interface DimensionScore {
  dimension: string;
  total: number;
  passed: number;
  checks: CheckResult[];
}

// ─── User Lifecycle Stages ──────────────────────────────────────────

const LIFECYCLE_STAGES = [
  { stage: "email-signup", requiredInSkill: "sign-up", requiredTest: "user-registration" },
  { stage: "email-verification", requiredInSkill: "verification", requiredTest: "user-registration" },
  { stage: "password-signin", requiredInSkill: "sign-in", requiredTest: "user-registration" },
  { stage: "oauth-signin", requiredInSkill: "OAuth", requiredTest: "oauth" },
  { stage: "password-reset", requiredInSkill: "password reset", requiredTest: "password-reset" },
  { stage: "session-management", requiredInSkill: "session", requiredTest: "session" },
  { stage: "account-deletion", requiredInSkill: "delet", requiredTest: "account-deletion" },
  { stage: "org-creation", requiredInSkill: "Create org", requiredTest: "organization-crud" },
  { stage: "org-invitation", requiredInSkill: "invite", requiredTest: "organization-invite" },
  { stage: "invite-accept-new", requiredInSkill: "accept", requiredTest: "invite-accept" },
  { stage: "invite-accept-existing", requiredInSkill: "existing.*user.*invite|invite.*existing", requiredTest: "invite-accept" },
  { stage: "role-change", requiredInSkill: "Update role", requiredTest: "rbac-enforcement" },
  { stage: "member-removal", requiredInSkill: "Remove member", requiredTest: "rbac-enforcement" },
  { stage: "project-crud", requiredInSkill: "Create project", requiredTest: "project-management" },
  { stage: "project-members", requiredInSkill: "project member", requiredTest: "project-management" },
  { stage: "rbac-enforcement", requiredInSkill: "RBAC", requiredTest: "rbac-enforcement" },
  { stage: "webhook-handling", requiredInSkill: "webhook", requiredTest: "webhook" },
  { stage: "token-exchange", requiredInSkill: "token.*exchange", requiredTest: "token-exchange" },
  { stage: "mcp-auth", requiredInSkill: "MCP.*Auth", requiredTest: "mcp-auth" },
  { stage: "mcp-tool-permissions", requiredInSkill: "TOOL_PERMISSIONS", requiredTest: "mcp-auth" },
  { stage: "mcp-token-scoping", requiredInSkill: "project.scoped|project_id.*mcp", requiredTest: "mcp-auth" },
  { stage: "cli-device-code", requiredInSkill: "device.*code|Device Code", requiredTest: "cli-oauth" },
  { stage: "cli-pkce", requiredInSkill: "PKCE", requiredTest: "cli-oauth" },
  { stage: "api-tokens", requiredInSkill: "API.*Key|Personal.*Token|api_tokens", requiredTest: "cli-oauth" },
  { stage: "token-storage", requiredInSkill: "token.*stor|securely.*disk", requiredTest: "cli-oauth" },
  { stage: "token-refresh", requiredInSkill: "refresh.*token|token.*refresh", requiredTest: "cli-oauth" },
] as const;

// ─── Schema Checks ──────────────────────────────────────────────────

const REQUIRED_TABLES = ["users", "organizations", "org_members", "projects", "project_members", "api_tokens", "device_codes"];
const REQUIRED_COLUMNS: Record<string, string[]> = {
  users: ["id", "auth_provider_id", "email", "display_name", "created_at"],
  organizations: ["id", "slug", "name", "owner_user_id", "created_at"],
  org_members: ["org_id", "user_id", "role"],
  projects: ["id", "org_id", "slug", "name", "deleted_at", "created_at"],
  project_members: ["project_id", "user_id", "role"],
  api_tokens: ["id", "user_id", "token_hash", "scopes", "expires_at"],
  device_codes: ["device_code", "user_code", "status", "expires_at"],
};

// ─── API Route Checks ───────────────────────────────────────────────

const REQUIRED_ROUTES = [
  { label: "GET /v1/auth/profile", pattern: "/v1/auth/profile" },
  { label: "POST /v1/auth/token", pattern: "/v1/auth/token" },
  { label: "POST /v1/auth/onboarding", pattern: "/v1/auth/onboarding" },
  { label: "POST /v1/orgs", pattern: "POST.*`/v1/orgs`" },
  { label: "GET /v1/orgs", pattern: "GET.*`/v1/orgs`" },
  { label: "PATCH /v1/orgs/:id", pattern: "PATCH.*orgs/" },
  { label: "DELETE /v1/orgs/:id", pattern: "DELETE.*orgs/" },
  { label: "GET /v1/orgs/:id/members", pattern: "orgs/.*members" },
  { label: "POST /v1/orgs/:id/members", pattern: "orgs/.*members" },
  { label: "POST /v1/orgs/:id/invites", pattern: "orgs/.*invites" },
  { label: "POST /v1/projects", pattern: "POST.*`/v1/projects`" },
  { label: "GET /v1/projects", pattern: "GET.*`/v1/projects`" },
  { label: "PATCH /v1/projects/:id", pattern: "PATCH.*projects/" },
  { label: "DELETE /v1/projects/:id", pattern: "DELETE.*projects/" },
  { label: "POST /v1/projects/:id/members", pattern: "projects/.*members" },
  { label: "POST /v1/mcp/tools/call", pattern: "mcp.*tool" },
  { label: "POST /v1/auth/device/code", pattern: "device.*code" },
  { label: "POST /v1/auth/tokens", pattern: "API.*token|api_token|Personal.*Token" },
];

// ─── Test File Checks ───────────────────────────────────────────────

const EXPECTED_TEST_FILES = [
  "user-registration.spec.ts",
  "organization-crud.spec.ts",
  "organization-invite.spec.ts",
  "project-management.spec.ts",
  "rbac-enforcement.spec.ts",
];

const IDEAL_TEST_FILES = [
  ...EXPECTED_TEST_FILES,
  "user-signin.spec.ts",
  "password-reset.spec.ts",
  "oauth-signin.spec.ts",
  "account-deletion.spec.ts",
  "invite-accept.spec.ts",
  "webhook-handling.spec.ts",
  "token-exchange.spec.ts",
  "session-management.spec.ts",
  "mcp-auth.spec.ts",
  "cli-oauth.spec.ts",
];

// ─── Helper Checks ──────────────────────────────────────────────────

const REQUIRED_HELPERS = [
  { file: "email-helper.ts", exports: ["EmailHelper", "createEmailHelper"] },
  { file: "auth-test-utils.ts", exports: ["AuthTestUtils", "createAuthTestUtils"] },
  { file: "api-client.ts", exports: ["ApiClient", "createApiClient"] },
];

// ─── Runner ─────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "../..");

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function fileContains(relativePath: string, pattern: string): boolean {
  if (!fileExists(relativePath)) return false;
  const content = fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
  if (pattern.includes(".*")) {
    return new RegExp(pattern, "i").test(content);
  }
  return content.toLowerCase().includes(pattern.toLowerCase());
}

function evaluateSkillCompleteness(): DimensionScore {
  const checks: CheckResult[] = [];

  for (const stage of LIFECYCLE_STAGES) {
    const inSkill = fileContains("SKILL.md", stage.requiredInSkill);
    checks.push({
      name: `skill-covers-${stage.stage}`,
      passed: inSkill,
      detail: inSkill
        ? `SKILL.md mentions "${stage.requiredInSkill}"`
        : `SKILL.md missing coverage of "${stage.stage}"`,
    });
  }

  return {
    dimension: "Skill Completeness",
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    checks,
  };
}

function evaluateTestCoverage(): DimensionScore {
  const checks: CheckResult[] = [];

  for (const file of IDEAL_TEST_FILES) {
    const exists = fileExists(`tests/e2e/${file}`);
    checks.push({
      name: `test-${file}`,
      passed: exists,
      detail: exists ? `tests/e2e/${file} exists` : `MISSING: tests/e2e/${file}`,
    });
  }

  return {
    dimension: "Test Coverage",
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    checks,
  };
}

function schemaContains(pattern: string): boolean {
  // Search across all SQL schema files
  const schemaFiles = ["schema/001_initial.sql", "schema/002_rls_policies.sql", "schema/003_api_tokens.sql"];
  return schemaFiles.some((f) => fileContains(f, pattern));
}

function evaluateSchemaCompleteness(): DimensionScore {
  const checks: CheckResult[] = [];

  for (const table of REQUIRED_TABLES) {
    const exists = schemaContains(`CREATE TABLE ${table}`);
    checks.push({
      name: `schema-table-${table}`,
      passed: exists,
      detail: exists ? `Table ${table} defined` : `MISSING: table ${table}`,
    });
  }

  for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
    for (const col of columns) {
      const exists = schemaContains(col);
      checks.push({
        name: `schema-column-${table}.${col}`,
        passed: exists,
        detail: exists ? `Column ${table}.${col} defined` : `MISSING: column ${table}.${col}`,
      });
    }
  }

  return {
    dimension: "Schema Completeness",
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    checks,
  };
}

function evaluateApiRouteCoverage(): DimensionScore {
  const checks: CheckResult[] = [];

  for (const route of REQUIRED_ROUTES) {
    const found = fileContains("SKILL.md", route.pattern + ".*");
    checks.push({
      name: `api-${route.label}`,
      passed: found,
      detail: found ? `Route ${route.label} documented` : `MISSING: route ${route.label}`,
    });
  }

  return {
    dimension: "API Route Coverage",
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    checks,
  };
}

function evaluateHelperCompleteness(): DimensionScore {
  const checks: CheckResult[] = [];

  for (const helper of REQUIRED_HELPERS) {
    const exists = fileExists(`tests/helpers/${helper.file}`);
    checks.push({
      name: `helper-${helper.file}`,
      passed: exists,
      detail: exists ? `${helper.file} exists` : `MISSING: ${helper.file}`,
    });

    for (const exp of helper.exports) {
      const has = fileContains(`tests/helpers/${helper.file}`, exp);
      checks.push({
        name: `helper-${helper.file}-exports-${exp}`,
        passed: has,
        detail: has ? `${helper.file} exports ${exp}` : `MISSING: export ${exp} in ${helper.file}`,
      });
    }
  }

  return {
    dimension: "Helper Completeness",
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    checks,
  };
}

function evaluateInfrastructure(): DimensionScore {
  const checks: CheckResult[] = [
    {
      name: "env-example",
      passed: fileExists(".env.example"),
      detail: fileExists(".env.example") ? ".env.example exists" : "MISSING: .env.example",
    },
    {
      name: "gitignore",
      passed: fileExists(".gitignore"),
      detail: fileExists(".gitignore") ? ".gitignore exists" : "MISSING: .gitignore",
    },
    {
      name: "playwright-config",
      passed: fileExists("tests/playwright.config.ts"),
      detail: fileExists("tests/playwright.config.ts")
        ? "playwright.config.ts exists"
        : "MISSING: playwright.config.ts",
    },
    {
      name: "email-worker",
      passed: fileExists("email-receiver-worker/src/index.ts"),
      detail: fileExists("email-receiver-worker/src/index.ts")
        ? "Email worker exists"
        : "MISSING: email-receiver-worker",
    },
    {
      name: "meta-framework",
      passed: fileExists("META.md"),
      detail: fileExists("META.md") ? "META.md exists" : "MISSING: META.md",
    },
    {
      name: "skill-doc",
      passed: fileExists("SKILL.md"),
      detail: fileExists("SKILL.md") ? "SKILL.md exists" : "MISSING: SKILL.md",
    },
  ];

  return {
    dimension: "Infrastructure",
    total: checks.length,
    passed: checks.filter((c) => c.passed).length,
    checks,
  };
}

// ─── Main ───────────────────────────────────────────────────────────

function main() {
  console.log("=".repeat(60));
  console.log("  USER SYSTEM SKILL — SELF-EVALUATION");
  console.log("=".repeat(60));
  console.log();

  const dimensions = [
    evaluateSkillCompleteness(),
    evaluateTestCoverage(),
    evaluateSchemaCompleteness(),
    evaluateApiRouteCoverage(),
    evaluateHelperCompleteness(),
    evaluateInfrastructure(),
  ];

  let totalPassed = 0;
  let totalChecks = 0;

  for (const dim of dimensions) {
    const pct = Math.round((dim.passed / dim.total) * 100);
    const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
    console.log(`${dim.dimension}`);
    console.log(`  ${bar} ${dim.passed}/${dim.total} (${pct}%)`);

    const failures = dim.checks.filter((c) => !c.passed);
    if (failures.length > 0) {
      console.log(`  Gaps:`);
      for (const f of failures) {
        console.log(`    - ${f.detail}`);
      }
    }
    console.log();

    totalPassed += dim.passed;
    totalChecks += dim.total;
  }

  const overallPct = Math.round((totalPassed / totalChecks) * 100);
  console.log("─".repeat(60));
  console.log(`OVERALL SCORE: ${totalPassed}/${totalChecks} (${overallPct}%)`);
  console.log("─".repeat(60));

  // Top gaps summary
  const allGaps = dimensions
    .flatMap((d) => d.checks.filter((c) => !c.passed))
    .map((c) => c.detail);

  if (allGaps.length > 0) {
    console.log();
    console.log("TOP GAPS TO CLOSE:");
    for (const gap of allGaps.slice(0, 10)) {
      console.log(`  -> ${gap}`);
    }
  }

  console.log();
  console.log(`Next step: Pick the top 3 gaps and address them.`);
  console.log(`Then re-run: npx tsx tests/meta/self-eval.ts`);

  // Exit with non-zero if below threshold
  if (overallPct < 50) {
    console.log(`\nWARNING: Score below 50% — critical gaps exist.`);
    process.exit(1);
  }
}

main();
