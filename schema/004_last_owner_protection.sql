-- Prevent removing or demoting the last owner of an organization.
--
-- PostgreSQL doesn't support CHECK constraints that query other rows,
-- so we use a trigger function instead.
--
-- Skips the check during CASCADE deletes (when the org itself is being deleted).

CREATE OR REPLACE FUNCTION check_last_owner()
RETURNS TRIGGER AS $$
DECLARE
  owner_count INTEGER;
  org_exists BOOLEAN;
BEGIN
  -- On DELETE: skip if the org itself is being deleted (CASCADE)
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
    SELECT EXISTS(SELECT 1 FROM organizations WHERE id = OLD.org_id) INTO org_exists;
    IF NOT org_exists THEN
      RETURN OLD;  -- Org is gone, allow cascade
    END IF;

    SELECT COUNT(*) INTO owner_count
    FROM org_members
    WHERE org_id = OLD.org_id AND role = 'owner' AND user_id != OLD.user_id;

    IF owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of an organization. Transfer ownership first.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role != 'owner' THEN
    SELECT COUNT(*) INTO owner_count
    FROM org_members
    WHERE org_id = OLD.org_id AND role = 'owner' AND user_id != OLD.user_id;

    IF owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last owner of an organization. Transfer ownership first.';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate to pick up the new function
DROP TRIGGER IF EXISTS trg_check_last_owner ON org_members;
CREATE TRIGGER trg_check_last_owner
  BEFORE DELETE OR UPDATE ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION check_last_owner();
