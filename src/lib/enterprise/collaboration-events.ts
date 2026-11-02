import 'server-only';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import { withSchemaInitialization } from '@/lib/schema-initialization';
import type { CollaborationEvent } from '@/lib/collaboration/contracts';

/** Shared transaction outbox, independent of both messaging and canvas-sharing.
 * Initialization always runs before checkout; publication uses the caller's client.
 */
let ready: Promise<void> | undefined;
export async function ensureCollaborationEventSchema() {
  if (!ready) ready = withSchemaInitialization(getPool(), tx => tx.query(`
    CREATE TABLE IF NOT EXISTS app_collab_event_heads (enterprise_id uuid PRIMARY KEY, seq bigint NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS app_collab_events (
      enterprise_id uuid NOT NULL, seq bigint NOT NULL, topics text[] NOT NULL, audience text[],
      conversation_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      PRIMARY KEY(enterprise_id,seq));
  `)).then(() => {}).catch(error => { ready = undefined; throw error; });
  await ready;
}
/** Head lock orders allocation through COMMIT. Never publish an uncommitted state. */
export async function emitCollaborationEventTx(tx: PoolClient, enterpriseId: string,
  topics: CollaborationEvent['topics'], audience: string[] | null = null, conversationId?: string) {
  const head = (await tx.query(`INSERT INTO app_collab_event_heads(enterprise_id,seq) VALUES($1,1)
    ON CONFLICT(enterprise_id) DO UPDATE SET seq=app_collab_event_heads.seq+1 RETURNING seq`, [enterpriseId])).rows[0];
  await tx.query(`INSERT INTO app_collab_events(enterprise_id,seq,topics,audience,conversation_id) VALUES($1,$2,$3,$4,$5)`,
    [enterpriseId, head.seq, topics, audience, conversationId || null]);
}
