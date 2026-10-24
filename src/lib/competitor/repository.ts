import "server-only";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import type {CompetitorItem} from "@/lib/competitor-types";

// Competitor workspace: owner-scoped optimistic writes and expiring model leases.
let competitorSchema: Promise<void> | null = null;

async function ensureCompetitorSchema() {
  await ensureSchema();
  if (!competitorSchema) competitorSchema = getPool().query(`
    CREATE TABLE IF NOT EXISTS app_competitor_items (
      id uuid PRIMARY KEY, email text NOT NULL, batch_id uuid NOT NULL,
      path text NOT NULL, state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0,
      job_id uuid, busy_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(email, batch_id, path)
    );
    CREATE INDEX IF NOT EXISTS app_competitor_owner_idx ON app_competitor_items(email, created_at);
  `).then(() => {}).catch(e => { competitorSchema = null; throw e; });
  await competitorSchema;
}

export function competitorRow(r: Record<string, any>): CompetitorItem {
  return { ...r.state, id: r.id, batchId: r.batch_id, path: r.path,
    revision: r.revision, busy: !!r.busy_until && new Date(r.busy_until).getTime() > Date.now(),
    createdAt: new Date(r.created_at).toISOString() };
}

export async function listCompetitorItems(email: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query("SELECT * FROM app_competitor_items WHERE email=$1 ORDER BY created_at DESC LIMIT 500", [email]);
  return rows.map(competitorRow);
}

export async function getCompetitorItem(email: string, id: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query("SELECT * FROM app_competitor_items WHERE email=$1 AND id=$2", [email, id]);
  return rows[0] ? competitorRow(rows[0]) : null;
}

export async function insertCompetitorItem(email: string, item: CompetitorItem) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query(`INSERT INTO app_competitor_items (id,email,batch_id,path,state)
    VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT(email,batch_id,path) DO UPDATE SET path=EXCLUDED.path RETURNING *`,
    [item.id, email, item.batchId, item.path, JSON.stringify(item)]);
  return competitorRow(rows[0]);
}

export async function saveCompetitorItem(email: string, item: CompetitorItem, jobId?: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query(`UPDATE app_competitor_items SET state=$4::jsonb,
    revision=revision+1, job_id=NULL, busy_until=NULL WHERE email=$1 AND id=$2 AND
    ${jobId ? "job_id=$3::uuid" : "revision=$3::integer AND (busy_until IS NULL OR busy_until < now())"} RETURNING *`,
    [email, item.id, jobId || item.revision, JSON.stringify(item)]);
  return rows[0] ? competitorRow(rows[0]) : null;
}

export async function claimCompetitorItem(email: string, id: string, revision: number, jobId: string) {
  await ensureCompetitorSchema();
  const { rows } = await getPool().query(`UPDATE app_competitor_items SET job_id=$4,
    busy_until=now()+interval '6 minutes',revision=revision+1 WHERE email=$1 AND id=$2 AND revision=$3
    AND (busy_until IS NULL OR busy_until < now()) RETURNING *`, [email, id, revision, jobId]);
  return rows[0] ? competitorRow(rows[0]) : null;
}

export async function releaseCompetitorItem(email: string, id: string, jobId: string) {
  await getPool().query("UPDATE app_competitor_items SET job_id=NULL,busy_until=NULL WHERE email=$1 AND id=$2 AND job_id=$3", [email,id,jobId]);
}

export async function deleteCompetitorItem(email: string, id: string) {
  await ensureCompetitorSchema();
  const result = await getPool().query("DELETE FROM app_competitor_items WHERE email=$1 AND id=$2 AND (busy_until IS NULL OR busy_until < now())", [email,id]);
  return (result.rowCount || 0) > 0;
}
