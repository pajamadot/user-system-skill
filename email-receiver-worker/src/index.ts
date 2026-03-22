/**
 * Cloudflare Email Receiver Worker
 *
 * Receives emails via Cloudflare Email Routing, stores them in KV,
 * and exposes an HTTP API for test code to poll for received emails.
 *
 * Setup:
 * 1. npx wrangler kv namespace create TEST_EMAILS
 * 2. Paste the namespace ID into wrangler.toml
 * 3. npx wrangler secret put AUTH_TOKEN (set a random secret)
 * 4. npx wrangler deploy
 * 5. In Cloudflare Dashboard → Email Routing → catch-all → Route to Worker
 */

export interface Env {
  TEST_EMAILS: KVNamespace;
  AUTH_TOKEN?: string;
}

interface StoredEmail {
  to: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
}

export default {
  /**
   * Handle incoming emails from Cloudflare Email Routing
   */
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const to = message.to;
    const from = message.from;
    const subject = message.headers.get("subject") || "(no subject)";

    // Read full raw email
    const decoder = new TextDecoder();
    const reader = message.raw.getReader();
    const chunks: string[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    const body = chunks.join("");

    // Store in KV, keyed by recipient + timestamp
    const key = `email:${to}:${Date.now()}`;
    const stored: StoredEmail = { to, from, subject, body, receivedAt: new Date().toISOString() };
    await env.TEST_EMAILS.put(key, JSON.stringify(stored), {
      expirationTtl: 3600, // auto-cleanup after 1 hour
    });
  },

  /**
   * HTTP API for test code
   *
   * GET  /emails?to=<address>           — list emails received at address
   * DELETE /emails?to=<address>          — delete emails for address
   * GET  /health                         — health check
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Auth check (skip for health)
    if (url.pathname !== "/health" && env.AUTH_TOKEN) {
      const token = request.headers.get("Authorization")?.replace("Bearer ", "");
      if (token !== env.AUTH_TOKEN) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Health check
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", timestamp: new Date().toISOString() });
    }

    // GET /emails?to=<address>
    if (url.pathname === "/emails" && request.method === "GET") {
      const to = url.searchParams.get("to");
      if (!to) return Response.json({ error: "Missing 'to' query parameter" }, { status: 400 });

      const list = await env.TEST_EMAILS.list({ prefix: `email:${to}:` });
      const emails: StoredEmail[] = [];
      for (const key of list.keys) {
        const value = await env.TEST_EMAILS.get(key.name);
        if (value) emails.push(JSON.parse(value));
      }

      // Sort by receivedAt descending (newest first)
      emails.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

      return Response.json({ emails, count: emails.length });
    }

    // DELETE /emails?to=<address>
    if (url.pathname === "/emails" && request.method === "DELETE") {
      const to = url.searchParams.get("to");
      if (!to) return Response.json({ error: "Missing 'to' query parameter" }, { status: 400 });

      const list = await env.TEST_EMAILS.list({ prefix: `email:${to}:` });
      for (const key of list.keys) {
        await env.TEST_EMAILS.delete(key.name);
      }

      return Response.json({ deleted: list.keys.length });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
