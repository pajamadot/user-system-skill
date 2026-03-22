import { Hono } from "hono";
import { verifyServiceJWT } from "../services/auth";
import { checkToolPermission } from "../services/rbac";

const mcp = new Hono();

// POST /v1/mcp/tools/call
mcp.post("/tools/call", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing authorization" }, 401);
  }

  const token = authHeader.slice(7);

  // Verify MCP service token
  let payload;
  try {
    payload = verifyServiceJWT(token, "mcp");
  } catch (err: any) {
    return c.json({ error: "Invalid or expired MCP token", detail: err.message }, 401);
  }

  const body = await c.req.json<{ tool: string; args: Record<string, any> }>();
  if (!body.tool) return c.json({ error: "tool is required" }, 400);

  // Check tool-level permission
  if (!checkToolPermission(body.tool, payload.scopes)) {
    return c.json({
      error: "Permission denied",
      detail: `Tool '${body.tool}' requires scopes not present in token`,
    }, 403);
  }

  // Execute tool (placeholder — wire up actual tool implementations)
  return c.json({
    tool: body.tool,
    result: {
      message: `Tool '${body.tool}' executed successfully`,
      user_id: payload.sub,
      project_id: payload.project_id || null,
    },
  });
});

// GET /v1/mcp/tools — list available tools and their required scopes
mcp.get("/tools", (c) => {
  return c.json({
    tools: [
      { name: "list_files", scopes: ["files:read"], description: "List files in a directory" },
      { name: "get_file", scopes: ["files:read"], description: "Read a file" },
      { name: "create_file", scopes: ["files:write"], description: "Create a new file" },
      { name: "update_file", scopes: ["files:write"], description: "Update a file" },
      { name: "delete_file", scopes: ["files:write", "files:delete"], description: "Delete a file" },
      { name: "search", scopes: ["project:read"], description: "Search project content" },
      { name: "get_project_info", scopes: ["project:read"], description: "Get project metadata" },
      { name: "manage_members", scopes: ["project:admin"], description: "Manage project members" },
      { name: "update_settings", scopes: ["project:admin"], description: "Update project settings" },
    ],
  });
});

export default mcp;
