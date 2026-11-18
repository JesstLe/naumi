import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {creationFamilySql,evidencePageSize,readCreationAssetPage} from '../src/lib/saas/creation-detail-evidence';

// The former source-based projection sorted full JSON records twice. Keep it
// as an independent baseline for winner selection and byte-for-byte evidence.
const oldOrder=`CASE WHEN data->>'direction'='output' THEN 0 WHEN data->>'variant'='original' THEN 1 ELSE 2 END,(data->>'position')::int,data->>'id'`;
const oldSql=`${creationFamilySql},asset_rows AS(
 SELECT to_jsonb(a) AS data,0 AS priority FROM app_creation_assets a JOIN family f ON f.id=a.creation_id
 UNION ALL SELECT value,1 FROM jsonb_array_elements($2::jsonb)),
 keyed_assets AS MATERIALIZED(SELECT data,priority,CASE
  WHEN data->>'direction'='output' AND data->>'storage_ref' LIKE 'artwork:%'
   THEN jsonb_build_array('output',data->>'storage_ref')::text
  WHEN data->>'direction'='input' AND data->>'media_type'='image' AND data->>'availability'='recorded'
   AND (data->>'hash' ~ '^[a-fA-F0-9]{64}$' OR data->>'storage_ref' LIKE '/media/%' OR data->>'storage_ref' LIKE 'artwork:%')
   THEN jsonb_build_array('input-image',CASE WHEN data->>'role'='mask' THEN 'mask' ELSE 'picture' END,
    CASE WHEN data->>'hash' ~ '^[a-fA-F0-9]{64}$' THEN 'sha256:'||lower(data->>'hash') ELSE 'ref:'||(data->>'storage_ref') END)::text
  ELSE jsonb_build_array('record',data->>'id')::text END AS asset_key FROM asset_rows),
 representatives AS MATERIALIZED(SELECT DISTINCT ON(asset_key) asset_key,data FROM keyed_assets
  ORDER BY asset_key,priority,CASE WHEN data->>'variant'='original' THEN 0 ELSE 1 END,
   CASE WHEN data->>'role'='edit-target' THEN 0 ELSE 1 END,(data->>'position')::int,data->>'id'),
 asset_page AS MATERIALIZED(SELECT * FROM representatives ORDER BY ${oldOrder} LIMIT $3 OFFSET $4),
 asset_roles AS(SELECT a.asset_key,jsonb_agg(DISTINCT a.data->>'role' ORDER BY a.data->>'role') AS roles
 FROM keyed_assets a JOIN asset_page p ON p.asset_key=a.asset_key GROUP BY a.asset_key)
 SELECT (SELECT count(*)::int FROM representatives) AS asset_total,
  COALESCE((SELECT jsonb_agg(p.data||jsonb_build_object('roles',r.roles) ORDER BY ${oldOrder}) FROM asset_page p JOIN asset_roles r USING(asset_key)),'[]'::jsonb) AS assets`;

async function main(){
 const baseline=process.argv.includes('--baseline');
 Object.assign(process.env,{PGPOOL_MAX:'5',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'asset-pages-fixture-0123456789abcdef0123456789abcdef'});
 const f=await (await import('./billing-fixture')).createBillingFixture({freshSchema:true});
 try{
  const db=await import('../src/lib/db'),tenants=await import('../src/lib/saas/tenants');
  const {ensureCreationSchema}=await import('../src/lib/saas/creation-schema'),{creationSourceAssets}=await import('../src/lib/saas/creation-source-evidence');
  const {creationDetailRoute}=await import('../src/lib/saas/creation-http'),{signUserSession}=await import('../src/lib/native-auth');
  await tenants.ensureTenantSchema();await ensureCreationSchema();
  const admin='deep-asset-admin@fixture.test',owner='deep-asset-owner@fixture.test',foreign='deep-asset-foreign@fixture.test';
  for(const email of [admin,owner,foreign])await db.getOrCreateUser(email,email);
  await db.setUserRole(admin,'admin');
  await f.pool.query("INSERT INTO app_feature_access(email,mode,allowed) VALUES($1,'custom','[\"team\"]')",[owner]);
  const {tenantId}=await tenants.createTenant({email:admin,admin:true,consoleAdmin:true},
   {commandId:randomUUID(),name:'Deep asset pages',ownerEmail:owner,validUntil:null,seatLimit:null,entitlementName:null,featurePolicy:{team:true}});
  const root='cr-'+randomUUID(),outside='cr-'+randomUUID();
  await f.pool.query(`INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id,parent_id)
   SELECT $1,$2,'tenant',$3::uuid,'fixture','root',NULL
   UNION ALL SELECT 'asset-child-'||n,$2,'tenant',$3::uuid,'fixture','child-'||n,$1 FROM generate_series(1,256)n
   UNION ALL SELECT 'asset-foreign-edge',$4,'tenant',$3::uuid,'fixture','foreign-edge',$1
   UNION ALL SELECT 'asset-from-hidden-branch',$2,'tenant',$3::uuid,'fixture','returning-edge','asset-foreign-edge'
   UNION ALL SELECT $5,$2,'tenant',$6::uuid,'fixture','wrong-tenant',$1`,[root,owner,tenantId,foreign,outside,randomUUID()]);
  await f.pool.query(`INSERT INTO app_creation_assets(id,creation_id,actor_email,direction,role,position,variant,storage_ref,hash,availability,media_type,text_content)
   SELECT 'sort-'||c.id||'-'||n,c.id,c.actor_email,CASE WHEN n<=64 THEN 'output' ELSE 'input' END,
    CASE WHEN n<=40 THEN 'reply' WHEN n<=64 THEN 'result' WHEN n%4=0 THEN 'mask' WHEN n%3=0 THEN 'edit-target' ELSE 'reference' END,
    n,CASE WHEN n%3=1 THEN 'processed' ELSE 'original' END,
    CASE WHEN n BETWEEN 41 AND 64 THEN 'artwork:output-'||n WHEN n>64 THEN '/media/asset-'||n ELSE '' END,
    CASE WHEN n BETWEEN 65 AND 90 THEN repeat(md5((n/2)::text),2) WHEN n=91 THEN upper(repeat(md5('45'),2)) ELSE NULL END,
    CASE WHEN n=96 THEN 'not_recorded' ELSE 'recorded' END,CASE WHEN n<=40 THEN 'text' ELSE 'image' END,
    CASE WHEN n<=40 THEN repeat(md5(c.id||n::text),96) ELSE NULL END
   FROM app_creation_records c CROSS JOIN generate_series(1,96)n`);
  await f.pool.query(`INSERT INTO app_image_jobs(id,email,kind,snapshot,payload,metered) VALUES
   ('sort-recovery',$1,'generate','{"creationEvidencePending":true,"images":[{"id":"output-48"},{"id":"recovered-only"}]}','{}',false)`,[owner]);
  await f.pool.query("INSERT INTO app_creation_links(creation_id,target_type,target_id,actor_email) VALUES($1,'image:generate','sort-recovery',$2)",[root,owner]);
  await f.pool.query('ANALYZE app_creation_records; ANALYZE app_creation_assets');
  const deep=410,tx=await f.pool.connect();
  try{
   await tx.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL work_mem='1MB'");
   const recovered=await creationSourceAssets(tx,root);assert.equal(recovered.length,2);
   const params=(page:number)=>[root,JSON.stringify(recovered),evidencePageSize,(page-1)*evidencePageSize];
   const measure=async(sql:string,values:unknown[])=>{
    const data=(await tx.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+sql,values)).rows[0]['QUERY PLAN'][0];
    return {temp:(data.Plan['Temp Read Blocks']??0)+(data.Plan['Temp Written Blocks']??0),
     blocks:(data.Plan['Shared Hit Blocks']??0)+(data.Plan['Shared Read Blocks']??0),ms:data['Execution Time']};
   };
   const old=await measure(oldSql,params(deep));assert.ok(old.temp>2000,JSON.stringify(old));
   const measured:{current?:typeof old}={};
   await readCreationAssetPage({query:async(sql:string,args:unknown[])=>{
    measured.current=await measure(sql,args);return {rows:[undefined]};
   }} as PoolClient,root,recovered,deep);
   const now=measured.current!;
   const read=async(page:number,enterprise=false,projection=true,id=root)=>creationDetailRoute(new Request(
    `http://localhost/api/${enterprise?'enterprise':'admin'}/creations/${id}?tenantId=${tenantId}&assetPage=${page}${projection?'&projection=assets':''}`,
    {headers:{cookie:'nv_user='+signUserSession(enterprise?owner:admin,Date.now())}}),id,enterprise);
   const expectedFirst=(await tx.query(oldSql,params(1))).rows[0],last=Math.ceil(expectedFirst.asset_total/evidencePageSize),outputs=Math.floor(257*40/evidencePageSize)+1;
   assert.equal(expectedFirst.asset_total,10586);assert.ok(last>deep);
   for(const page of [1,2,deep,outputs,last,last+1]){
    const previous=(await tx.query(oldSql,params(page))).rows[0];
    const current=await readCreationAssetPage(tx,root,recovered,page);
    assert.deepEqual(current,previous);
    assert.ok(previous.assets.every((asset:Record<string,any>)=>![outside,'asset-foreign-edge','asset-from-hidden-branch'].includes(asset.creation_id)));
    if(page===outputs){const stored=previous.assets.filter((a:Record<string,any>)=>a.storage_ref==='artwork:output-48');assert.equal(stored.length,1);assert.match(stored[0].id,/^sort-/);}
    if(page===1||page===deep||page===last+1){
     const platform=await read(page),team=await read(page,true),full=await read(page,false,false);
     assert.equal(platform.status,200);assert.equal(team.status,200);assert.equal(full.status,200);
     const body=await platform.json(),fullBody=await full.json();
     assert.deepEqual(await team.json(),body);assert.deepEqual(body,{assets:fullBody.assets,assetPagination:fullBody.assetPagination});
     assert.deepEqual(body.assets.map((a:Record<string,any>)=>a.id),previous.assets.map((a:Record<string,any>)=>a.id));
     if(page===1){const locator=body.assets.find((a:Record<string,any>)=>a.id===recovered[1].id);assert.equal(locator?.evidenceRecordId,root);assert.ok(body.assets.some((a:Record<string,any>)=>a.text?.length===3072));}
    }
   }
   assert.equal((await read(1,true,true,outside)).status,404);
   const output={old,now,page:deep,total:expectedFirst.asset_total,rows:257*96,workMem:'1MB'};
   if(!baseline)assert.ok(now.temp*3<old.temp,JSON.stringify(output));
   console.log((baseline?'CREATION_ASSET_SORT_BASELINE=PASS ':'CREATION_ASSET_SORT=PASS ')+JSON.stringify(output));
  }finally{await tx.query('ROLLBACK');tx.release();}
 }finally{await f.close();}
}
main().catch(err=>{console.error(err);process.exitCode=1;});
