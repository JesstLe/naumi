import 'server-only';
import { getPool } from '@/lib/db';
import { withSchemaInitialization } from '@/lib/schema-initialization';
import { ensureEnterpriseSchema } from '@/lib/enterprise/server';
import { ensureCollaborationEventSchema } from '@/lib/enterprise/collaboration-events';

let ready: Promise<void> | undefined;
/** Additive module-owned tables. Initialization precedes all business transactions. */
export async function ensureCollaborationSchema() {
  await ensureEnterpriseSchema();
  await ensureCollaborationEventSchema();
  if (!ready) ready = withSchemaInitialization(getPool(), tx => tx.query(`
    CREATE TABLE IF NOT EXISTS app_collab_conversations (
      id uuid PRIMARY KEY, enterprise_id uuid NOT NULL REFERENCES app_enterprise_settings(team_id),
      kind text NOT NULL CHECK(kind IN ('direct','group')), title text NOT NULL DEFAULT '', owner_id text NOT NULL,
      direct_key text, last_seq bigint NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(enterprise_id,direct_key));
    CREATE TABLE IF NOT EXISTS app_collab_members (
      conversation_id uuid NOT NULL REFERENCES app_collab_conversations(id), actor_id text NOT NULL,
      joined_seq bigint NOT NULL DEFAULT 0, left_seq bigint, read_seq bigint NOT NULL DEFAULT 0,
      pinned boolean NOT NULL DEFAULT false, muted boolean NOT NULL DEFAULT false,
      PRIMARY KEY(conversation_id,actor_id));
    CREATE INDEX IF NOT EXISTS app_collab_members_actor ON app_collab_members(actor_id,conversation_id) WHERE left_seq IS NULL;
    CREATE TABLE IF NOT EXISTS app_collab_membership_history (
      id bigserial PRIMARY KEY, conversation_id uuid NOT NULL, actor_id text NOT NULL,
      joined_seq bigint NOT NULL, left_seq bigint, changed_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS app_collab_messages (
      id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES app_collab_conversations(id), seq bigint NOT NULL,
      sender_id text NOT NULL, client_id text NOT NULL, fingerprint text NOT NULL, body text NOT NULL,
      reply_to uuid, attachment_ids uuid[] NOT NULL DEFAULT '{}', mention_ids text[] NOT NULL DEFAULT '{}', share_id uuid,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), withdrawn_at timestamptz,
      UNIQUE(conversation_id,seq), UNIQUE(conversation_id,sender_id,client_id));
    CREATE INDEX IF NOT EXISTS app_collab_messages_files ON app_collab_messages(conversation_id,seq DESC)
      WHERE cardinality(attachment_ids)>0 AND withdrawn_at IS NULL;
    CREATE INDEX IF NOT EXISTS app_collab_messages_attachments ON app_collab_messages USING gin(attachment_ids);
    CREATE TABLE IF NOT EXISTS app_collab_operations (
      enterprise_id uuid NOT NULL, actor_id text NOT NULL, client_id text NOT NULL, kind text NOT NULL,
      fingerprint text NOT NULL, result jsonb NOT NULL, PRIMARY KEY(enterprise_id,actor_id,kind,client_id));
    CREATE TABLE IF NOT EXISTS app_collab_uploads (
      id uuid PRIMARY KEY, enterprise_id uuid NOT NULL, conversation_id uuid NOT NULL REFERENCES app_collab_conversations(id),
      owner_id text NOT NULL, client_id text NOT NULL, fingerprint text NOT NULL, name text NOT NULL,
      bytes bigint NOT NULL CHECK(bytes>=0), chunk_bytes integer NOT NULL, claimed_mime text NOT NULL,
      mime text NOT NULL DEFAULT 'application/octet-stream', inline_ok boolean NOT NULL DEFAULT false,
      backend text NOT NULL CHECK(backend IN ('local','managed')), status text NOT NULL DEFAULT 'uploading'
        CHECK(status IN ('uploading','ready','cancelled','expired')), published_at timestamptz,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(enterprise_id,owner_id,client_id));
    CREATE INDEX IF NOT EXISTS app_collab_uploads_expiry ON app_collab_uploads(expires_at,id) WHERE status='uploading';
    CREATE TABLE IF NOT EXISTS app_collab_parts (
      upload_id uuid NOT NULL REFERENCES app_collab_uploads(id), part integer NOT NULL CHECK(part>=0),
      bytes integer NOT NULL, sha256 text NOT NULL, object_key text NOT NULL, ready boolean NOT NULL DEFAULT false,
      PRIMARY KEY(upload_id,part));
    CREATE TABLE IF NOT EXISTS app_collab_presence (
      enterprise_id uuid NOT NULL, actor_id text NOT NULL, session_id text NOT NULL,
      state text NOT NULL CHECK(state IN ('online','away')), expires_at timestamptz NOT NULL,
      PRIMARY KEY(enterprise_id,actor_id,session_id));
    CREATE INDEX IF NOT EXISTS app_collab_presence_expiry ON app_collab_presence(expires_at);
  `)).then(() => {}).catch(error => { ready = undefined; throw error; });
  await ready;
}
