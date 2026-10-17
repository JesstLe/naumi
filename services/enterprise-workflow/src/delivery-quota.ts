import type {PoolClient} from 'pg';
import {WorkflowError} from './contracts';

// Old schemas keep direct upload working; every new writer counts retained reservations.
export async function multipartInstalled(tx:PoolClient){
 return !!(await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=16')).rowCount;
}
export async function deliveryUsage(tx:PoolClient,enterprise:string,excludeSession?:string){
 const used=Number((await tx.query('SELECT COALESCE(sum(bytes),0) n FROM enterprise_workflow.delivery_assets WHERE enterprise_id=$1',[enterprise])).rows[0].n);
 const reserved=await multipartInstalled(tx)?Number((await tx.query('SELECT COALESCE(sum(reserved_bytes),0) n FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND ($2::uuid IS NULL OR id<>$2)',[enterprise,excludeSession??null])).rows[0].n):0;
 return {used,reserved};
}
export async function directAssetId(tx:PoolClient,enterprise:string,assetId:string){
 if(await multipartInstalled(tx))if((await tx.query('SELECT 1 FROM enterprise_workflow.delivery_upload_sessions WHERE enterprise_id=$1 AND id=$2',[enterprise,assetId])).rowCount)throw new WorkflowError(409,'UPLOAD_SESSION_REQUIRED');
}
