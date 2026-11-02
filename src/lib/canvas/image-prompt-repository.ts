import "server-only";
import type { PoolClient } from "pg";
import { getPool } from "../db";
import { ensureCreationSchema } from "../saas/creation-schema";
import { ensureCanvasSettingsSchema } from "../canvas-node-settings-store";
import { imagePromptDocumentSchema, type ImagePromptDocument, type ImagePromptState } from "./image-prompt-schema";

let ready: Promise<void> | undefined;
export async function ensureImagePromptSchema() {
  if (!ready) ready = (async () => {
    await ensureCanvasSettingsSchema(); await ensureCreationSchema();
    await getPool().query(`CREATE TABLE IF NOT EXISTS app_canvas_image_prompts (
      email text NOT NULL, node_id text NOT NULL, project_key text NOT NULL, document jsonb NOT NULL,
      revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), scope_kind text NOT NULL CHECK(scope_kind IN ('personal','tenant')),
      tenant_id uuid, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(email,node_id),
      CHECK((scope_kind='tenant')=(tenant_id IS NOT NULL)));
      CREATE INDEX IF NOT EXISTS canvas_image_prompts_project ON app_canvas_image_prompts(email,project_key);
      CREATE TABLE IF NOT EXISTS app_canvas_image_prompt_operations (
        email text NOT NULL, operation_id uuid NOT NULL, node_id text NOT NULL, fingerprint text NOT NULL,
        result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(email,operation_id));
      CREATE INDEX IF NOT EXISTS canvas_image_prompt_operations_recent ON app_canvas_image_prompt_operations(email,node_id,created_at DESC,operation_id DESC);`);
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
/** The caller owns the transaction and initializes schema before checkout. */
export async function readImagePromptTx(tx: PoolClient, actor: string, nodeId: string): Promise<ImagePromptState> {
  const row = (await tx.query("SELECT document,revision FROM app_canvas_image_prompts WHERE email=$1 AND node_id=$2 FOR SHARE", [actor.toLowerCase(), nodeId])).rows[0];
  return row ? { document: imagePromptDocumentSchema.parse(row.document), revision: Number(row.revision) } : { document: null, revision: 0 };
}
export async function writeCopiedImagePromptTx(tx: PoolClient, actor: string, nodeId: string, projectKey: string, document: ImagePromptDocument,
  scope: { scopeKind: "personal" | "tenant"; tenantId: string | null }) {
  await tx.query(`INSERT INTO app_canvas_image_prompts(email,node_id,project_key,document,revision,scope_kind,tenant_id)
    VALUES($1,$2,$3,$4::jsonb,1,$5,$6)`, [actor.toLowerCase(), nodeId, projectKey, JSON.stringify(imagePromptDocumentSchema.parse(document)), scope.scopeKind, scope.tenantId]);
}
