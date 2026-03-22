import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware, type Env } from "./middleware/auth";
import authRoutes from "./routes/auth";
import orgRoutes from "./routes/orgs";
import projectRoutes from "./routes/projects";
import webhookRoutes from "./routes/webhooks";
import mcpRoutes from "./routes/mcp";

const app = new Hono();

// ─── Global Middleware ──────────────────────────────────────────────

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
    credentials: true,
  }),
);

// ─── Health Check ───────────────────────────────────────────────────

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// ─── Public Routes (no auth) ────────────────────────────────────────

app.route("/api/webhooks", webhookRoutes);

// Device code endpoints (code request + token polling are public)
const devicePublic = new Hono();
devicePublic.post("/device/code", async (c) => {
  const authModule = await import("./routes/auth");
  // Forward to the auth route handler
  return authModule.default.fetch(c.req.raw, c.env);
});
devicePublic.post("/device/token", async (c) => {
  const authModule = await import("./routes/auth");
  return authModule.default.fetch(c.req.raw, c.env);
});

// ─── Authenticated Routes ───────────────────────────────────────────

const api = new Hono<Env>();
api.use("*", authMiddleware);

api.route("/auth", authRoutes);
api.route("/orgs", orgRoutes);
api.route("/projects", projectRoutes);

app.route("/v1", api);

// MCP routes use their own auth (service JWT, not Clerk)
app.route("/v1/mcp", mcpRoutes);

// Re-mount device code public endpoints under /v1/auth
app.post("/v1/auth/device/code", async (c) => {
  const body = await c.req.json();
  const { createDeviceCode } = await import("./db/tokens");
  const scopes = body.scope?.split(" ") || ["read"];
  const dc = await createDeviceCode(body.client_id || "unknown", scopes);
  return c.json({
    device_code: dc.device_code,
    user_code: dc.user_code,
    verification_uri: `${process.env.APP_URL || "http://localhost:3000"}/device`,
    verification_uri_complete: `${process.env.APP_URL || "http://localhost:3000"}/device?code=${dc.user_code}`,
    expires_in: 900,
    interval: 5,
  });
});

app.post("/v1/auth/device/token", async (c) => {
  const body = await c.req.json();
  const { getDeviceCode, markDeviceCodeUsed, createApiToken } = await import("./db/tokens");

  const dc = await getDeviceCode(body.device_code);
  if (!dc || dc.client_id !== body.client_id) {
    return c.json({ error: "invalid_grant", error_description: "Invalid device code" }, 400);
  }
  if (dc.expires_at < new Date()) {
    return c.json({ error: "expired_token", error_description: "Device code expired" }, 400);
  }
  if (dc.status === "pending") {
    return c.json({ error: "authorization_pending" }, 400);
  }
  if (dc.status === "used") {
    return c.json({ error: "invalid_grant", error_description: "Code already used" }, 400);
  }
  if (dc.status === "approved" && dc.user_id) {
    await markDeviceCodeUsed(body.device_code);
    const { row, plainToken } = await createApiToken({
      userId: dc.user_id,
      name: `CLI (${dc.client_id})`,
      scopes: dc.scopes,
    });
    return c.json({
      access_token: plainToken,
      token_type: "Bearer",
      expires_in: row.expires_at ? Math.floor((row.expires_at.getTime() - Date.now()) / 1000) : null,
      scope: dc.scopes.join(" "),
    });
  }
  return c.json({ error: "server_error" }, 500);
});

// ─── Start Server ───────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "8080", 10);

export default {
  port,
  fetch: app.fetch,
};

// For Node.js (non-Bun) environments
if (!(globalThis as any).Bun) {
  import("@hono/node-server").then(({ serve }) => {
    serve({ fetch: app.fetch, port });
    console.log(`Server running on http://localhost:${port}`);
  });
}
