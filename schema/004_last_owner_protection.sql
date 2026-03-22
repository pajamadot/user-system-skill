-- Prevent removing or demoting the last owner of an organization.
--
-- PostgreSQL doesn't support CHECK constraints that query other rows,
-- so we use a trigger function instead.

CREATE OR REPLACE FUNCTION check_last_owner()
RETURNS TRIGGER AS $$
DECLARE
  owner_count INTEGER;
BEGIN
  -- Only check when an owner role is being removed or changed
  IF TG_OP = 'DELETE' AND OLD.role = 'owner' THEN
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

CREATE TRIGGER trg_check_last_owner
  BEFORE DELETE OR UPDATE ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION check_last_owner();
