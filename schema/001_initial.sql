-- User System — Initial Schema
-- Supports any auth provider via the auth_provider_id column

-- Users (synced from auth provider)
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  auth_provider_id TEXT UNIQUE,  -- clerk user ID, auth0 sub, supabase uid, etc.
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_users_auth_provider ON users(auth_provider_id) WHERE auth_provider_id IS NOT NULL;

-- Organizations / Workspaces
CREATE TABLE organizations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  auth_provider_org_id TEXT UNIQUE,  -- NULL if orgs managed locally only
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  owner_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization Members
CREATE TABLE org_members (
  org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id)
);
-- For "list my orgs" queries (user_id is not the leading key in the PK)
CREATE INDEX idx_org_members_user ON org_members(user_id);

-- Projects (scoped to organizations)
CREATE TABLE projects (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug TEXT,
  name TEXT NOT NULL,
  description TEXT,
  deleted_at TIMESTAMPTZ,  -- soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Partial unique: allow reuse of slugs from soft-deleted projects
CREATE UNIQUE INDEX idx_projects_org_slug ON projects(org_id, slug) WHERE deleted_at IS NULL;

-- Project Members (fine-grained project-level access)
CREATE TABLE project_members (
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  invited_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);
-- For "list my projects" queries
CREATE INDEX idx_project_members_user ON project_members(user_id);
