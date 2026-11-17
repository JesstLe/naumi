/** Additive, concurrently built indexes for hot polling/worker paths found on 47
 * (pg_stat_user_tables, 9 days, 2026-11-07). Never run from request/schema startup
 * or inside a DB transaction: apply with scripts/ops/hot-path-indexes.ts while the
 * deploy locks are held. Each predicate is written exactly as its query states it,
 * so PostgreSQL can prove the partial index applies. Never reuse a name for a
 * changed definition: IF NOT EXISTS matches names only. */
export const HOT_PATH_INDEXES = [
  // releaseStatus() runs every worker tick: instance_id=$1 AND state<>'finished'.
  // The old index scanned every finished row of the current boot (~16k pages per call).
  {name:"app_release_activities_open",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_release_activities_open ON app_release_activities(instance_id,activity_kind,work_scope) WHERE state<>'finished'`},
  // Background claim de-dupe filters admission_key; the existing lookup indexes work_key.
  {name:"app_release_background_open",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_release_background_open ON app_release_activities(work_scope,admission_key) WHERE activity_kind='accepted-work' AND state IN ('active','unknown')`},
  // Retention DELETE bounds each kind by finished_at; finished_at alone walked 7 days of accepted-work.
  {name:"app_release_activities_finished_kind",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_release_activities_finished_kind ON app_release_activities(activity_kind,finished_at) WHERE state='finished'`},
  // Per-member consumption sums (enterprise console, teams, credits) had no email index.
  {name:"app_ledger_email_created",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_ledger_email_created ON app_ledger(email,created_at DESC)`},
  // recordImageStateTx: target_id=$1 AND target_type LIKE 'image:%' (LIKE cannot use btree under en_US collation).
  {name:"app_creation_link_target_id",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_creation_link_target_id ON app_creation_links(target_id)`},
  // dueImageJobs(): every tick, measured 2.3s seq scan detoasting ~1.9GB of snapshots on 47.
  {name:"app_image_jobs_due_v2",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_image_jobs_due_v2 ON app_image_jobs(kind,updated_at,id) WHERE snapshot->>'status'='pending' OR (kind='imagegen' AND snapshot->>'status'='running') OR snapshot->'sources' @> '[{"status":"redoing"}]'::jsonb`},
  // recoverStoredDeliveries(): every tick, failed unleased imagegen parents newest first.
  {name:"app_image_jobs_imagegen_failed",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_image_jobs_imagegen_failed ON app_image_jobs(updated_at DESC,id) WHERE kind='imagegen' AND snapshot->>'status' IN ('error','needs_attention') AND lease_token IS NULL`},
  // notifyImagegenJobReleased(): finds the open parent of a released child.
  {name:"app_image_jobs_imagegen_open",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_image_jobs_imagegen_open ON app_image_jobs(id) WHERE kind='imagegen' AND snapshot->>'status' IN ('pending','running')`},
  // Recent supplier activity by published provider. Keep mutable attempt state
  // outside the index so finishing an attempt need not update it.
  {name:"app_model_execution_stages_provider_created",sql:`CREATE INDEX CONCURRENTLY IF NOT EXISTS app_model_execution_stages_provider_created ON app_model_execution_stages(provider_id,created_at)`},
] as const;
