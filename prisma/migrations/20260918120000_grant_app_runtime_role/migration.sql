-- Grants for the least-privilege app_runtime role (issue #91). In Neon
-- dev/prod the role is provisioned by Terraform (terraform/modules/environment/neon.tf)
-- with LOGIN + a password; here we only need it to exist to grant to it, so
-- create it (NOLOGIN) when it's missing — covers test DBs (pglite) that run
-- migrations from scratch without Terraform ever having run.
--
-- Only DML is granted, never DDL — schema changes stay migration-only,
-- run as neondb_owner via `prisma migrate deploy`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- Applies the same grants to tables/sequences created by future migrations
-- without a manual grant step per migration. "FOR ROLE" is omitted so this
-- defaults to current_user — the role prisma migrate deploy runs as
-- (neondb_owner in Neon) — rather than hardcoding that role's name.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
