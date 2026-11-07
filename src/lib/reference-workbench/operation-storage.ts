import {canonical,digest} from "./contract";

/** Browser requests carry reference images inline (data URLs). preview() saves
 * them as owned assets (plans[].inputs), so an operation record keeps only
 * their digest: the quote/submit consistency check still binds the exact
 * images, while list/status reads stop loading megabytes per record.
 * The fingerprint column is computed from the raw request and is unaffected. */
export const INLINE_IMAGE_FIELDS=["images","annotated_data_url"] as const;
export const INLINE_IMAGES_DIGEST="inline_images_sha256";
type Fields=Record<string,unknown>;

export function withoutInlineImages<T extends Fields>(value:T):T{
 const out:Fields={...value};for(const key of INLINE_IMAGE_FIELDS)delete out[key];return out as T;
}
/** Idempotent: a stored body passes through unchanged; a full request body
 * (new submit, or a record written before this change) gets the same digest. */
export function storedOperationBody(body:Fields):Fields{
 const out:Fields={...body},inline:Fields={};
 for(const key of INLINE_IMAGE_FIELDS)if(out[key]!==undefined){inline[key]=out[key];delete out[key];}
 if(Object.keys(inline).length)out[INLINE_IMAGES_DIGEST]=digest(inline);
 return out;
}
const object=(value:unknown):value is Fields=>!!value&&typeof value==="object"&&!Array.isArray(value);
/** Settings were derived from the whole request for single/start, so older
 * plans repeat the inline images once per variant. */
export function storedOperationRecord(row:{body:unknown;plans:unknown}){
 const body=object(row.body)?storedOperationBody(row.body):row.body;
 const plans=Array.isArray(row.plans)?row.plans.map(task=>object(task)&&object(task.settings)?{...task,settings:withoutInlineImages(task.settings)}:task):row.plans;
 return {body,plans,changed:canonical(body)!==canonical(row.body)||canonical(plans)!==canonical(row.plans)};
}

type Query=(sql:string,params?:unknown[])=>Promise<{rows:any[]}>;
export type SlimClient={query:Query;release?:()=>void};
/** One-time slimming of records written before inline images left the record.
 * Each row is rewritten under FOR UPDATE; a concurrent sync that read the row
 * earlier can only overwrite the slimming, never lose its own state change.
 * updated_at is kept: the workbench shows it as the version time. */
export async function slimStoredOperations(connect:()=>Promise<SlimClient>,options:{apply:boolean;batch?:number}){
 const client=await connect();let scanned=0,changed=0,bytesBefore=0,bytesAfter=0;
 try{
  const ids=(await client.query(`SELECT id FROM app_reference_operations WHERE body ?| $1::text[]
   OR jsonb_path_exists(plans,'$[*].settings.images') OR jsonb_path_exists(plans,'$[*].settings.annotated_data_url') ORDER BY created_at`,[INLINE_IMAGE_FIELDS])).rows.map(r=>String(r.id));
  for(const id of ids.slice(0,options.batch??ids.length)){
   // Plan mode takes no row locks: it only reads.
   await client.query(options.apply?"BEGIN":"BEGIN READ ONLY");
   try{
    const row=(await client.query(`SELECT id,body,plans,pg_column_size(body)+pg_column_size(plans) AS bytes FROM app_reference_operations WHERE id=$1${options.apply?" FOR UPDATE":""}`,[id])).rows[0];
    scanned++;
    if(row){const next=storedOperationRecord(row);
     if(next.changed){changed++;bytesBefore+=Number(row.bytes);
      if(options.apply){const after=(await client.query("UPDATE app_reference_operations SET body=$2::jsonb,plans=$3::jsonb WHERE id=$1 RETURNING pg_column_size(body)+pg_column_size(plans) AS bytes",[id,JSON.stringify(next.body),JSON.stringify(next.plans)])).rows[0];bytesAfter+=Number(after.bytes);}
     }}
    await client.query(options.apply?"COMMIT":"ROLLBACK");
   }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}
  }
  return {candidates:ids.length,scanned,changed,bytesBefore,bytesAfter};
 }finally{client.release?.();}
}
