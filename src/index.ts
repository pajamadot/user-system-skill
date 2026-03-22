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

// MCP routes use their own auth (service JWT, not Clerk JWT)
app.route("/v1/mcp", mcpRoutes);

// ─── Authenticated Routes ───────────────────────────────────────────
// Auth middleware skips device/code and device/token paths (public).
// All other /v1/* routes require a valid Bearer token.

const api = new Hono<Env>();
api.use("*", authMiddleware);

api.route("/auth", authRoutes);
api.route("/orgs", orgRoutes);
api.route("/projects", projectRoutes);

app.route("/v1", api);

// ─── Start Server ───────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "8080", 10);

export default {
  port,
  fetch: app.fetch,
};

if (!(globalThis as any).Bun) {
  import("@hono/node-server").then(({ serve }) => {
    serve({ fetch: app.fetch, port });
    console.log(`Server running on http://localhost:${port}`);
  });
}
