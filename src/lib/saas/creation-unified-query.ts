import type {CreationFilters} from './creation-contracts';

/** Historical sources are a fallback, never a second row for a recorded source/child.
 * All filtering, sorting, exact totals and paging stay in the caller's DB snapshot. */
export function legacyCreationCandidates(f:CreationFilters,allowedEmails:readonly string[]|null,bind:(value:unknown)=>string,options:{tenantId?:string;keysOnly?:boolean;selectedOnly?:boolean}={}){
 const emails=bind(allowedEmails),user=bind(f.user.toLowerCase()),q=bind(f.q),from=bind(f.from?`${f.from}T00:00:00+08:00`:null),to=bind(f.to?`${f.to}T00:00:00+08:00`:null),kind=bind(f.source||''),status=options.selectedOnly?"''::text":bind(f.status||'');
 const tenant=bind(options.tenantId||null);
 const account=(alias:string)=>`(${emails}::text[] IS NULL OR ${alias}.email=ANY(${emails})) AND (${user}::text='' OR ${alias}.email=${user})
 AND (${from}::timestamptz IS NULL OR ${alias}.created_at>=${from}) AND (${to}::timestamptz IS NULL OR ${alias}.created_at<${to}::timestamptz+interval '1 day')`;
 const source=(table:string,alias:string,sourceKind:string,rawStatus:string,content:string,ledger:string)=>`SELECT
 'legacy:'||'${table}:'||${alias}.id AS id,${alias}.email AS actor_email,${alias}.created_at AS accepted_at,
 ${options.keysOnly&&!f.status?'NULL::text':rawStatus} AS live_status,${sourceKind} AS source_kind,${alias}.id AS source_id,'${table}'::text AS legacy_table
 ${options.keysOnly?'':`,
 CASE ${table==='app_image_jobs'?`WHEN j.kind='imagegen' AND j.snapshot#>>'{result,billingStatus}'='confirmed' AND j.snapshot#>>'{result,chargedCredits}' ~ '^[0-9]{1,9}$' THEN (j.snapshot#>>'{result,chargedCredits}')::int`:''}
 WHEN b.state IN ('settled','released') THEN b.charged_credits WHEN l.charged IS NOT NULL THEN l.charged
 WHEN ${table==='app_image_jobs'?`j.metered=false AND (j.kind<>'imagegen' OR COALESCE(j.snapshot->'children','{}')='{}'::jsonb)`:'FALSE'} THEN 0 ELSE NULL END::int AS charged
 `}
 FROM ${table} ${alias} ${options.selectedOnly?`JOIN selected selected_key ON selected_key.legacy_table='${table}' AND selected_key.source_id=${alias}.id AND selected_key.actor_email=${alias}.email`:''}
 ${options.keysOnly?'':`LEFT JOIN app_billing_operations b ON b.id=${alias}.id AND b.email=${alias}.email
 LEFT JOIN LATERAL(SELECT -sum(delta)::int AS charged FROM app_ledger WHERE id=${ledger} AND email=${alias}.email AND kind='consume')l ON true`}
 WHERE ${account(alias)} AND (${q}::text='' OR position(lower(${q}) in lower(COALESCE(${content},'')||' '||${alias}.email))>0)
 AND (${kind}::text='' OR ${sourceKind}=${kind})
 AND NOT EXISTS(SELECT 1 FROM app_creation_records known WHERE known.actor_email=${alias}.email AND known.source_kind=${sourceKind} AND known.source_id=${alias}.id
  AND (${tenant}::uuid IS NULL OR known.tenant_id IS NOT NULL))
 AND NOT EXISTS(SELECT 1 FROM app_creation_links link JOIN app_creation_records known ON known.id=link.creation_id AND known.actor_email=link.actor_email
  WHERE link.actor_email=${alias}.email AND link.target_id=${alias}.id AND link.target_type=${sourceKind}
  AND (${tenant}::uuid IS NULL OR known.tenant_id IS NOT NULL))`;
 const imageStatus=`CASE WHEN j.snapshot->>'status' IN ('error','failed','cancelled','canceled') AND COALESCE(j.snapshot#>>'{result,status}','') NOT IN ('succeeded','done','completed','success','partial','failed','error','cancelled','canceled') THEN j.snapshot->>'status' ELSE COALESCE(j.snapshot#>>'{result,status}',j.snapshot->>'status') END`;
 const sources=[
  source('app_image_jobs','j',"'image:'||j.kind",imageStatus,"COALESCE(j.payload#>>'{plan,request,prompt}',j.payload#>>'{p,userPrompt}',j.payload#>>'{p,prompt}')","'led-image-'||j.id"),
  source('app_canvas_image_tasks','c',"'canvas-image'",'c.status',"COALESCE(c.parameters->>'newText',c.parameters->>'prompt')","'led-canvas-image-'||c.id"),
  source('app_video_tasks','v',"'video'",'v.status',"COALESCE(v.parameters->>'prompt','')","'led-video-'||v.id"),
 ].join(' UNION ALL ');
 if(options.selectedOnly)return sources;
 return `WITH historical_children AS MATERIALIZED(SELECT parent.email,child.value->>'jobId' AS child_id FROM app_image_jobs parent
 CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(parent.snapshot->'children')='object' THEN parent.snapshot->'children' ELSE '{}'::jsonb END)child
 WHERE parent.kind='imagegen' AND (${emails}::text[] IS NULL OR parent.email=ANY(${emails})) AND (${user}::text='' OR parent.email=${user})
 AND child.value->>'jobId' IS NOT NULL AND child.value->>'jobId'<>parent.id)
 SELECT * FROM (${sources}) legacy WHERE NOT EXISTS(SELECT 1 FROM historical_children child
 WHERE legacy.legacy_table='app_image_jobs' AND child.email=legacy.actor_email AND child.child_id=legacy.source_id)
 AND (${status}::text='' OR CASE
 WHEN live_status IN ('done','completed','success') THEN 'succeeded' WHEN live_status IN ('error','rejected') THEN 'failed'
 WHEN live_status IN ('pending','reviewing') THEN 'queued' WHEN live_status IN ('processing','generating') THEN 'running'
 WHEN live_status IN ('queued','running','succeeded','partial','failed','cancel_requested','cancelled','needs_review') THEN live_status ELSE 'needs_review' END=${status})`;
}
