-- API Tokens — Personal Access Tokens for CLI / CI / headless use
-- Supports org-scoped and project-scoped tokens with configurable permissions

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- Human label: "My CLI token", "CI deploy key"
  token_prefix TEXT NOT NULL,          -- First 8 chars of token for identification (e.g., "sk_live_a")
  token_hash TEXT NOT NULL,            -- SHA-256 hash of full token (never store plaintext)
  scopes TEXT[] NOT NULL DEFAULT '{}', -- e.g., {'read', 'write', 'admin'}
  last_used_at TIMESTAMPTZ,
  last_used_ip TEXT,
  expires_at TIMESTAMPTZ,              -- NULL = never expires
  revoked_at TIMESTAMPTZ,              -- NULL = active
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX idx_api_tokens_prefix ON api_tokens(token_prefix);
-- For token validation: lookup by prefix, then compare hash
-- This avoids scanning all tokens when validating

-- Device code flow state (short-lived, can also use Redis)
CREATE TABLE device_codes (
  device_code TEXT PRIMARY KEY,
  user_code TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'used', 'expired')),
  user_id TEXT REFERENCES users(id),  -- Set when user approves
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_codes_user_code ON device_codes(user_code);
