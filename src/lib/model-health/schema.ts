import "server-only";
import type { Pool } from "pg";
const ready = new WeakMap<Pool, Promise<void>>();
export async function ensureHealthSchema(pool: Pool) {
  let pending = ready.get(pool);
  if (!pending) {
    pending = (async () => {
      const tx = await pool.connect();
      try {
        await tx.query("BEGIN");
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('naumi-model-health-schema',0))");
        await tx.query(`CREATE TABLE IF NOT EXISTS app_model_health_policy (
          singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT true,
          stale_hours int NOT NULL DEFAULT 6 CHECK(stale_hours BETWEEN 6 AND 168),
          daily_max_calls int NOT NULL DEFAULT 12 CHECK(daily_max_calls BETWEEN 0 AND 12),
          revision int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), actor text,
          last_tick_at timestamptz);
          INSERT INTO app_model_health_policy(singleton) VALUES(true) ON CONFLICT DO NOTHING;
          CREATE TABLE IF NOT EXISTS app_model_health_observations (
            key text PRIMARY KEY,provider_id text NOT NULL,wire_model text NOT NULL,
            last_business_success_at timestamptz,last_success_at timestamptz,last_outcome_at timestamptz,
            success boolean,reason text,last_status int,latency_ms int,
            last_probe_at timestamptz,probe_not_before timestamptz,uncertain boolean NOT NULL DEFAULT false);
          CREATE TABLE IF NOT EXISTS app_model_health_probes (
            id uuid PRIMARY KEY,key text NOT NULL,provider_id text NOT NULL,wire_model text NOT NULL,
            model_version bigint NOT NULL,budget_day date NOT NULL,state text NOT NULL,
            reason text,status int,latency_ms int,started_at timestamptz NOT NULL DEFAULT now(),
            expires_at timestamptz NOT NULL,finished_at timestamptz);
          CREATE INDEX IF NOT EXISTS app_model_health_probes_budget ON app_model_health_probes(budget_day);
          CREATE INDEX IF NOT EXISTS app_model_health_probes_target ON app_model_health_probes(key,started_at DESC);
          CREATE INDEX IF NOT EXISTS app_model_health_probes_active ON app_model_health_probes(state,expires_at);`);
        await tx.query(`CREATE TABLE IF NOT EXISTS app_model_health_reconciliations(id bigserial PRIMARY KEY,key text NOT NULL,observed_at timestamptz NOT NULL,actor text NOT NULL,resolution text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
        await tx.query("COMMIT");
      } catch (error) { await tx.query("ROLLBACK"); throw error; } finally { tx.release(); }
    })().catch(error => { ready.delete(pool); throw error; });
    ready.set(pool, pending);
  }
  await pending;
}
