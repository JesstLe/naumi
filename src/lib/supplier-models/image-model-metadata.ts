import "server-only";
import type { Pool, QueryResultRow } from "pg";
import type { ModelConfig } from "../model-config/types";
import { ensureSupplierModels } from "./schema";

/** Request-local shared read. Never cache metadata across revisions or publications. */
export async function readImageModelMetadata(pool: Pool, config: ModelConfig): Promise<QueryResultRow[]> {
  await ensureSupplierModels(pool);
  const targets = [...new Map(config.upstreamModels.filter(u => u.modality === "image")
    .map(u => [JSON.stringify([u.providerId, u.model]), {provider_id: u.providerId, model_id: u.model}])).values()];
  if (!targets.length) return [];
  return (await pool.query("SELECT m.* FROM app_supplier_model_metadata m JOIN jsonb_to_recordset($1::jsonb) AS t(provider_id text,model_id text) ON m.provider_id=t.provider_id AND m.model_id=t.model_id", [JSON.stringify(targets)])).rows;
}
