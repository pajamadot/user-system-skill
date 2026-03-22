-- Row-Level Security Policies (Optional)
-- Use when your backend shares a single DB connection pool
-- and you want DB-level tenant isolation.
--
-- Requires setting per-request: SET LOCAL app.current_user_id = '<user_id>';

-- Organizations: user can only see orgs they are a member of
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_member_access ON organizations
  FOR ALL
  USING (
    id IN (SELECT org_id FROM org_members WHERE user_id = current_setting('app.current_user_id', true))
  );

-- Projects: user can only see projects in orgs they belong to
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_org_member_access ON projects
  FOR ALL
  USING (
    org_id IN (SELECT org_id FROM org_members WHERE user_id = current_setting('app.current_user_id', true))
  );

-- Org Members: visible to fellow org members
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_members_visibility ON org_members
  FOR SELECT
  USING (
    org_id IN (SELECT org_id FROM org_members m WHERE m.user_id = current_setting('app.current_user_id', true))
  );

-- Project Members: visible to fellow project members or org members
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_members_visibility ON project_members
  FOR SELECT
  USING (
    project_id IN (
      SELECT p.id FROM projects p
      JOIN org_members om ON om.org_id = p.org_id
      WHERE om.user_id = current_setting('app.current_user_id', true)
    )
  );
