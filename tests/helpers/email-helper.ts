/**
 * Unified Email Testing Interface
 *
 * Provides a common API regardless of which email testing backend you use.
 * Configure via environment variables — the factory picks the right implementation.
 */

export interface TestEmail {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}

export interface WaitOptions {
  subjectContains?: string;
  timeout?: number;
  pollInterval?: number;
}

export interface EmailHelper {
  /** Generate a unique test email address */
  generateEmail(prefix?: string): string;

  /** Poll until an email arrives at the given address */
  waitForEmail(to: string, opts?: WaitOptions): Promise<TestEmail>;

  /** Extract a 6-digit verification code from email body */
  extractVerificationCode(email: TestEmail): string | null;

  /** Extract a URL matching a pattern from email body */
  extractLink(email: TestEmail, pattern?: RegExp): string | null;

  /** Clean up stored emails for the given address */
  cleanup(to: string): Promise<void>;
}

// ─── Cloudflare Email Routing Implementation ────────────────────────

export class CloudflareEmailHelper implements EmailHelper {
  constructor(
    private workerUrl: string,
    private domain: string,
    private authToken?: string,
  ) {}

  generateEmail(prefix = "test"): string {
    const id = crypto.randomUUID().slice(0, 8);
    return `${prefix}-${id}@${this.domain}`;
  }

  async waitForEmail(to: string, opts: WaitOptions = {}): Promise<TestEmail> {
    const { timeout = 30_000, pollInterval = 2_000, subjectContains } = opts;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const res = await fetch(
        `${this.workerUrl}/emails?to=${encodeURIComponent(to)}`,
        {
          headers: this.authToken
            ? { Authorization: `Bearer ${this.authToken}` }
            : {},
        },
      );
      const { emails } = (await res.json()) as { emails: any[] };

      const match = emails.find(
        (e) => !subjectContains || e.subject?.includes(subjectContains),
      );
      if (match) {
        return {
          to: match.to,
          from: match.from,
          subject: match.subject,
          textBody: match.body,
          htmlBody: match.body,
        };
      }

      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new Error(`No email received at ${to} within ${timeout}ms`);
  }

  extractVerificationCode(email: TestEmail): string | null {
    const match = (email.textBody || email.htmlBody).match(/\b(\d{6})\b/);
    return match?.[1] || null;
  }

  extractLink(email: TestEmail, pattern?: RegExp): string | null {
    const body = email.htmlBody || email.textBody;
    const urlRegex = /https?:\/\/[^\s<>"']+/g;
    const urls = body.match(urlRegex) || [];
    if (pattern) return urls.find((u) => pattern.test(u)) || null;
    return urls[0] || null;
  }

  async cleanup(to: string): Promise<void> {
    await fetch(`${this.workerUrl}/emails?to=${encodeURIComponent(to)}`, {
      method: "DELETE",
      headers: this.authToken
        ? { Authorization: `Bearer ${this.authToken}` }
        : {},
    });
  }
}

// ─── Mailosaur Implementation ───────────────────────────────────────

export class MailosaurEmailHelper implements EmailHelper {
  private client: any;
  private serverId: string;
  private domain: string;

  constructor(apiKey: string, serverId: string, domain: string) {
    // Lazy-load mailosaur to avoid requiring it when not used
    const Mailosaur = require("mailosaur");
    this.client = new Mailosaur(apiKey);
    this.serverId = serverId;
    this.domain = domain;
  }

  generateEmail(prefix = "test"): string {
    const id = crypto.randomUUID().slice(0, 8);
    return `${prefix}-${id}@${this.domain}`;
  }

  async waitForEmail(to: string, opts: WaitOptions = {}): Promise<TestEmail> {
    const { timeout = 30_000, subjectContains } = opts;
    const message = await this.client.messages.get(
      this.serverId,
      { sentTo: to, subject: subjectContains },
      { timeout },
    );
    return {
      to: message.to?.[0]?.email || to,
      from: message.from?.[0]?.email || "",
      subject: message.subject || "",
      textBody: message.text?.body || "",
      htmlBody: message.html?.body || "",
    };
  }

  extractVerificationCode(email: TestEmail): string | null {
    const match = (email.textBody || email.htmlBody).match(/\b(\d{6})\b/);
    return match?.[1] || null;
  }

  extractLink(email: TestEmail, pattern?: RegExp): string | null {
    const body = email.htmlBody || email.textBody;
    const urlRegex = /https?:\/\/[^\s<>"']+/g;
    const urls = body.match(urlRegex) || [];
    if (pattern) return urls.find((u) => pattern.test(u)) || null;
    return urls[0] || null;
  }

  async cleanup(to: string): Promise<void> {
    try {
      const messages = await this.client.messages.search(this.serverId, {
        sentTo: to,
      });
      for (const msg of messages.items || []) {
        await this.client.messages.del(msg.id);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ─── MailSlurp Implementation ───────────────────────────────────────

export class MailSlurpEmailHelper implements EmailHelper {
  private client: any;
  private inboxes: Map<string, string> = new Map(); // email → inboxId

  constructor(apiKey: string) {
    const { MailSlurp } = require("mailslurp-client");
    this.client = new MailSlurp({ apiKey });
  }

  generateEmail(prefix = "test"): string {
    // MailSlurp assigns random addresses; we'll create on first use
    // Return a placeholder that waitForEmail will resolve
    const id = crypto.randomUUID().slice(0, 8);
    return `pending-mailslurp-${id}`;
  }

  async waitForEmail(to: string, opts: WaitOptions = {}): Promise<TestEmail> {
    const { timeout = 30_000 } = opts;

    // Create inbox if we haven't already
    if (!this.inboxes.has(to)) {
      const inbox = await this.client.createInbox();
      this.inboxes.set(to, inbox.id);
      // Note: caller must use inbox.emailAddress as the actual address
    }

    const inboxId = this.inboxes.get(to)!;
    const [email] = await this.client.waitForEmailCount(1, inboxId, timeout);

    return {
      to: email.to?.[0] || to,
      from: email.from || "",
      subject: email.subject || "",
      textBody: email.body || "",
      htmlBody: email.body || "",
    };
  }

  extractVerificationCode(email: TestEmail): string | null {
    const match = (email.textBody || email.htmlBody).match(/\b(\d{6})\b/);
    return match?.[1] || null;
  }

  extractLink(email: TestEmail, pattern?: RegExp): string | null {
    const body = email.htmlBody || email.textBody;
    const urlRegex = /https?:\/\/[^\s<>"']+/g;
    const urls = body.match(urlRegex) || [];
    if (pattern) return urls.find((u) => pattern.test(u)) || null;
    return urls[0] || null;
  }

  async cleanup(to: string): Promise<void> {
    const inboxId = this.inboxes.get(to);
    if (inboxId) {
      try {
        await this.client.deleteInbox(inboxId);
      } catch {
        // Ignore
      }
      this.inboxes.delete(to);
    }
  }
}

// ─── Factory ────────────────────────────────────────────────────────

export function createEmailHelper(): EmailHelper {
  if (process.env.EMAIL_WORKER_URL) {
    return new CloudflareEmailHelper(
      process.env.EMAIL_WORKER_URL,
      process.env.CLOUDFLARE_EMAIL_ROUTING_DOMAIN!,
      process.env.EMAIL_WORKER_TOKEN,
    );
  }

  if (process.env.MAILOSAUR_API_KEY) {
    return new MailosaurEmailHelper(
      process.env.MAILOSAUR_API_KEY,
      process.env.MAILOSAUR_SERVER_ID!,
      process.env.MAILOSAUR_DOMAIN!,
    );
  }

  if (process.env.MAILSLURP_API_KEY) {
    return new MailSlurpEmailHelper(process.env.MAILSLURP_API_KEY);
  }

  throw new Error(
    "No email testing backend configured.\n" +
      "Set one of: EMAIL_WORKER_URL, MAILOSAUR_API_KEY, or MAILSLURP_API_KEY.\n" +
      "See SKILL.md Part C for setup instructions.",
  );
}
