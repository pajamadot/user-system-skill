import { Hono } from "hono";
import { Webhook } from "svix";
import * as usersDb from "../db/users";
import * as orgsDb from "../db/orgs";

const webhooks = new Hono();

// POST /api/webhooks/auth — Clerk webhook receiver
webhooks.post("/auth", async (c) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "Webhook secret not configured" }, 500);

  // Verify signature
  const svixId = c.req.header("svix-id");
  const svixTimestamp = c.req.header("svix-timestamp");
  const svixSignature = c.req.header("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.json({ error: "Missing webhook signature headers" }, 400);
  }

  const body = await c.req.text();
  let payload: any;

  try {
    const wh = new Webhook(secret);
    payload = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch {
    return c.json({ error: "Invalid webhook signature" }, 401);
  }

  // Process events
  switch (payload.type) {
    case "user.created":
    case "user.updated": {
      const email = payload.data.email_addresses?.[0]?.email_address;
      if (!email) break;

      await usersDb.upsertUser({
        authProviderId: payload.data.id,
        email,
        displayName: [payload.data.first_name, payload.data.last_name].filter(Boolean).join(" ") || null,
        avatarUrl: payload.data.image_url || null,
      });
      break;
    }

    case "user.deleted": {
      if (payload.data.id) {
        await usersDb.softDeleteUserByAuthProviderId(payload.data.id);
      }
      break;
    }

    case "organizationMembership.created": {
      const orgClerkId = payload.data.organization?.id;
      const userClerkId = payload.data.public_user_data?.user_id;
      const clerkRole = payload.data.role;

      if (orgClerkId && userClerkId) {
        const role = clerkRole === "org:admin" ? "admin" as const : "member" as const;
        // Find local org and user
        const user = await usersDb.getUserByAuthProviderId(userClerkId);
        if (user) {
          // Find org by auth_provider_org_id
          // For now, log — real implementation needs org lookup
          console.log(`Org membership created: user=${userClerkId}, org=${orgClerkId}, role=${role}`);
        }
      }
      break;
    }

    default:
      console.log(`Unhandled webhook event: ${payload.type}`);
  }

  return c.json({ received: true });
});

export default webhooks;
