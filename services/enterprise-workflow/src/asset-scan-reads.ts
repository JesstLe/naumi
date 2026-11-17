import type {PoolClient} from 'pg';

const tables={delivery:'enterprise_workflow.delivery_scan_events',demand:'enterprise_workflow.demand_scan_events'} as const;
type ScanEvent={id:string;status:string;policy_key:string;policy_label:string;engine:string|null;signature:string|null;reason:string|null;created_at:string;valid_until:string|null;sha256:string;bytes:string};

/** Probe each asset's ordered index for the two states rather than sorting or returning its history. */
export async function latestAssetScans(tx:PoolClient,kind:keyof typeof tables,enterprise:string,ids:readonly string[]){
 const latest=new Map<string,ScanEvent>(),conclusive=new Map<string,ScanEvent>();
 if(!ids.length)return {latest,conclusive};
 const table=tables[kind];
 const {rows}=await tx.query<{id:string;latest:ScanEvent|null;conclusive:ScanEvent|null}>(`SELECT a.id,to_jsonb(l) AS latest,to_jsonb(c) AS conclusive
  FROM unnest($2::uuid[]) AS a(id)
  LEFT JOIN LATERAL (SELECT id,status,policy_key,policy_label,engine,signature,reason,created_at,valid_until,sha256,bytes::text
    FROM ${table} WHERE enterprise_id=$1 AND asset_id=a.id ORDER BY ordinal DESC LIMIT 1) l ON true
  LEFT JOIN LATERAL (SELECT id,status,policy_key,policy_label,engine,signature,reason,created_at,valid_until,sha256,bytes::text
    FROM ${table} WHERE enterprise_id=$1 AND asset_id=a.id AND status IN ('clean','infected') ORDER BY ordinal DESC LIMIT 1) c ON true`,[enterprise,ids]);
 for(const r of rows){if(r.latest)latest.set(r.id,r.latest);if(r.conclusive)conclusive.set(r.id,r.conclusive);}
 return {latest,conclusive};
}

export async function assetScanHistory(tx:PoolClient,kind:keyof typeof tables,enterprise:string,assetId:string,page:number,installed=true){
 const pageSize=30,offset=(page-1)*pageSize,table=tables[kind];
 if(!installed)return {events:[],page,pageSize,total:0};
 const total=Number((await tx.query(`SELECT count(*) n FROM ${table} WHERE enterprise_id=$1 AND asset_id=$2`,[enterprise,assetId])).rows[0].n);
 const events=offset>=total?[]:(await tx.query(`WITH page AS MATERIALIZED (SELECT ordinal FROM ${table} WHERE enterprise_id=$1 AND asset_id=$2 ORDER BY ordinal DESC LIMIT 30 OFFSET $3)
  SELECT r.id,r.status,r.policy_label,r.engine,r.signature,r.reason,r.subject,r.created_at,r.valid_until,r.sha256,r.bytes FROM page
  JOIN ${table} r ON r.enterprise_id=$1 AND r.asset_id=$2 AND r.ordinal=page.ordinal ORDER BY page.ordinal DESC`,[enterprise,assetId,offset])).rows;
 return {page,pageSize,total,events};
}
