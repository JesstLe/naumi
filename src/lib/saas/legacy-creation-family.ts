import type {Pool,PoolClient} from 'pg';
import type {LegacySource} from './creation-history-identity';

/** Only persisted child job IDs, always rechecked against the original owner. */
export async function legacyImageChildren(db:Pick<Pool|PoolClient,'query'>,ref:LegacySource,row:Record<string,any>){
 if(ref.table!=='app_image_jobs'||row.kind!=='imagegen')return [];
 const children=row.snapshot?.children;
 if(!children||typeof children!=='object'||Array.isArray(children))return [];
 const ids=[...new Set(Object.values(children).flatMap((child:any)=>typeof child?.jobId==='string'&&child.jobId!==ref.id&&child.jobId.length<=240?[child.jobId]:[]))];
 if(!ids.length)return [];
 return (await db.query('SELECT id,email,kind,snapshot,payload,metered,created_at FROM app_image_jobs WHERE email=$1 AND id=ANY($2::text[]) ORDER BY created_at,id',[ref.email,ids])).rows;
}

export function confirmedParentCharge(row:Record<string,any>):number|null{
 const result=row.snapshot?.result,value=result?.chargedCredits;
 return row.kind==='imagegen'&&result?.billingStatus==='confirmed'&&Number.isSafeInteger(value)&&value>=0?value:null;
}

export function legacyOutputFilter(ref:LegacySource,row:Record<string,any>,children:Record<string,any>[]){
 if(ref.table==='app_artworks')return {sql:'id=$2',values:[ref.email,ref.id]};
 const ids=[ref.id,...children.map(child=>String(child.id))];
 return {sql:`(batch_id=ANY($2::text[]) OR batch_id=ANY($3::text[]) OR creation_provenance->>'ref'=ANY($2::text[]) ${ref.table==='app_canvas_image_tasks'?'OR id=$4':''})`,
  values:[ref.email,ids,ids.map(id=>'b-'+id),...(ref.table==='app_canvas_image_tasks'?[row.result_artwork_id||'']:[])]};
}
