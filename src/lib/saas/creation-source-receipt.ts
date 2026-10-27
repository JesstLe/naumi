import "server-only";
import {getPool,dbEnabled} from "@/platform/db/pool";
import {ensureCreationSchema} from "./creation-schema";
import {currentCreationContext} from "./creation-scope";
import {creationStatus} from "./creation-contracts";

/** Owner-scoped continuation, not the admin evidence projection. A receipt read
 * never accepts work, runs a supplier or grants permission to replay UNKNOWN. */
export async function readCreationSourceReceipt(actor:string,kind:string,operationId:string){
  const context=currentCreationContext();
  if(!dbEnabled||!context||context.actorEmail!==actor.toLowerCase())return null;
  await ensureCreationSchema();
  const row=(await getPool().query(`SELECT c.id,c.status,
    (SELECT e.summary FROM app_creation_events e WHERE e.creation_id=c.id ORDER BY e.occurred_at DESC,e.id DESC LIMIT 1) AS summary,
    ARRAY(SELECT l.target_id FROM app_creation_links l WHERE l.creation_id=c.id AND l.actor_email=c.actor_email
      AND l.target_type='artwork' AND l.relation='output' ORDER BY
      (SELECT min(a.position) FROM app_creation_assets a WHERE a.creation_id=c.id AND a.direction='output' AND a.storage_ref='artwork:'||l.target_id),l.target_id) AS artwork_ids
    FROM app_creation_records c WHERE c.actor_email=$1 AND c.source_kind=$2 AND c.source_id=$3
    AND c.scope_kind=$4 AND c.tenant_id IS NOT DISTINCT FROM $5::uuid`,
    [actor.toLowerCase(),kind,operationId,context.scopeKind,context.tenantId])).rows[0];
  return row?{id:String(row.id),status:creationStatus(row.status),summary:String(row.summary||""),artworkIds:row.artwork_ids as string[]}:null;
}
