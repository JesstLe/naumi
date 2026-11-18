-- Prefer scripts/ops/admin-query-indexes.ts --scope=platform-overview:
-- it checks same-name objects before and after the build. Run under the site
-- deployment lock as a standalone statement, never in a request or transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_creation_root_accepted_time
  ON app_creation_records (accepted_at) INCLUDE (tenant_id,status)
  WHERE parent_id IS NULL;
