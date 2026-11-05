import 'server-only';
import {dbEnabled,getPool} from '@/platform/db/pool';
import {confirmsImageRejection} from './image-rejection-policy';

/** Public read boundary for the execution-stage owner. Callers supply original
 * owned job/unit IDs, never status/credits as a substitute for dispatch proof.
 * Missing legacy evidence or an unavailable read grants no automatic purchase. */
export async function readImageRejectionEvidence(operationId:string,units:readonly string[]):Promise<boolean>{
 if(!dbEnabled)return false;
 try{
  const {rows}=await getPool().query<{operation_id:string;state:string;image_operation_id:string|null}>(
   "SELECT operation_id,state,usage->>'imageOperationId' AS image_operation_id FROM app_model_execution_stages WHERE operation_id=ANY($1::text[])",[[...new Set([operationId,...units])]]);
  return confirmsImageRejection(operationId,units,rows.map(row=>({operationId:row.operation_id,state:row.state,imageOperationId:row.image_operation_id})));
 }catch{return false;}
}
