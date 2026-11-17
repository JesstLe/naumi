import type {Pool,PoolClient} from 'pg';
import {WorkflowError,type Principal,type Actor} from './contracts';
import type {ResolveActor} from './store';
import {catalogApply,catalogInput,catalogQuery,type CatalogDocument,type CatalogEntity,type CatalogSnapshot,type catalogSelection} from './catalog-contracts';
import type {z} from 'zod';
import {sourceDigest} from './source-files';
import {readWorkflowSnapshot} from './read-transaction';
const need=(v:unknown,code:string,status=409)=>{if(!v)throw new WorkflowError(status,code);};
const refs=(d:CatalogDocument)=>d.kind==='product'?[d.brandId]:d.kind==='sku'?[d.productId,...d.shopIds]:[];
const key=(d:CatalogDocument)=>d.externalRef?JSON.stringify([d.externalRef.system,d.externalRef.instance,d.externalRef.key]):null;
const skuScope="FROM enterprise_workflow.catalog_entities s JOIN enterprise_workflow.catalog_entities p ON p.enterprise_id=s.enterprise_id AND p.id=(s.document->>'productId')::uuid JOIN enterprise_workflow.catalog_entities b ON b.enterprise_id=p.enterprise_id AND b.id=(p.document->>'brandId')::uuid WHERE s.enterprise_id=$1 AND s.kind='sku' AND s.document->>'enabled'='true' AND s.document->'shopIds' ? $2 AND p.kind='product' AND b.kind='brand' AND p.document->>'enabled'='true' AND b.document->>'enabled'='true'";
export class CatalogStore{
 constructor(readonly pool:Pool,private resolveActor:ResolveActor,private enabled=true){}
 async available(tx:PoolClient){need(this.enabled,'CATALOG_NOT_ENABLED',503);need((await tx.query('SELECT 1 FROM enterprise_workflow.schema_version WHERE version=19')).rowCount,'CATALOG_MIGRATION_REQUIRED',503);}
 private async actor(tx:PoolClient,p:Principal){const a=await this.resolveActor(tx,p);need(a&&a.enterpriseId===p.enterpriseId&&a.teamId===p.teamId&&a.subject===p.subject&&a.teamId,'MEMBERSHIP_REQUIRED',403);await this.available(tx);return a!;}
 private async admin(tx:PoolClient,a:Actor,lock=true){return a.permissions.includes('manage')&&!!(await tx.query(`SELECT 1 FROM enterprise_workflow.catalog_admins WHERE enterprise_id=$1 AND subject=$2 AND enabled${lock?' FOR SHARE':''}`,[a.enterpriseId,a.subject])).rowCount;}
 private async requireShop(tx:PoolClient,a:Actor,id:string){need((await tx.query("SELECT 1 FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND id=$2 AND kind='shop' AND document->>'enabled'='true' AND document->'teamIds' ? $3",[a.enterpriseId,id,a.teamId])).rowCount,'CATALOG_SHOP_FORBIDDEN',403);}
 private async tx<T>(f:(t:PoolClient)=>Promise<T>){const t=await this.pool.connect();try{await t.query('BEGIN');await t.query("SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='15s'");const r=await f(t);await t.query('COMMIT');return r;}catch(e){await t.query('ROLLBACK');throw e;}finally{t.release();}}
 async lock(tx:PoolClient,enterpriseId:string){await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['catalog:'+enterpriseId]);}
 private async get(tx:PoolClient,enterpriseId:string,id:string){return (await tx.query('SELECT id,kind,version,document FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND id=$2',[enterpriseId,id])).rows[0] as CatalogEntity|undefined;}
 async select(tx:PoolClient,a:Actor,shopId:string,skuId:string,expected?:z.infer<typeof catalogSelection>['revisions']):Promise<CatalogSnapshot>{
  await this.available(tx);const shop=await this.get(tx,a.enterpriseId,shopId);need(shop?.kind==='shop'&&shop.document.kind==='shop'&&shop.document.teamIds.includes(a.teamId!),'CATALOG_SHOP_FORBIDDEN',403);need(shop!.document.enabled,'CATALOG_INACTIVE');
  const sku=await this.get(tx,a.enterpriseId,skuId);need(sku?.document.kind==='sku'&&sku.document.shopIds.includes(shopId),'CATALOG_SKU_NOT_FOUND',404);need(sku!.document.enabled,'CATALOG_INACTIVE');
  const product=await this.get(tx,a.enterpriseId,(sku!.document as Extract<CatalogDocument,{kind:'sku'}>).productId);need(product?.document.kind==='product','CATALOG_PARENT_INVALID');need(product!.document.enabled,'CATALOG_INACTIVE');
  const brand=await this.get(tx,a.enterpriseId,(product!.document as Extract<CatalogDocument,{kind:'product'}>).brandId);need(brand?.kind==='brand','CATALOG_PARENT_INVALID');need(brand!.document.enabled,'CATALOG_INACTIVE');
  const revisions={brand:brand!.version,shop:shop!.version,product:product!.version,sku:sku!.version};if(expected)need(sourceDigest(revisions)===sourceDigest(expected),'CATALOG_SELECTION_STALE');
  // Only the selected shop belongs in a demand snapshot; other shops' grants/external IDs stay private.
  const sanitizedShop={...shop!,document:{...shop!.document,teamIds:[]} as CatalogDocument},sanitizedSku={...sku!,document:{...sku!.document,shopIds:[shopId]} as CatalogDocument};
  return {selection:{shopId,skuId,revisions},brand:brand!,shop:sanitizedShop,product:product!,sku:sanitizedSku};
 }
 async read(p:Principal,raw:unknown,signal?:AbortSignal){const q=catalogQuery.parse(raw);return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
  need(a.teamId,'MEMBERSHIP_REQUIRED',403);await this.available(tx);if(!snapshot)await this.lock(tx,a.enterpriseId);
  if(q.action==='context'){const admin=await this.admin(tx,a,!snapshot),shops=(await tx.query("SELECT id,version,document->>'name' name,document->>'channel' channel FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND kind='shop' AND document->>'enabled'='true' AND document->'teamIds' ? $2 ORDER BY name,id LIMIT 101",[a.enterpriseId,a.teamId])).rows;need(shops.length<=100,'CATALOG_SHOPS_TOO_MANY',422);return {canManage:admin,shops};}
  if(q.action==='selection')return this.select(tx,a,q.shopId,q.skuId);
  const offset=(q.page-1)*30;
  if(q.action==='history'){
   need(await this.admin(tx,a,!snapshot),'CATALOG_ADMIN_REQUIRED',403);const args=[a.enterpriseId,q.id];
   need((await tx.query('SELECT 1 FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND id=$2',args)).rowCount,'CATALOG_NOT_FOUND',404);
   const total=(await tx.query('SELECT count(*)::int n FROM enterprise_workflow.catalog_revisions WHERE enterprise_id=$1 AND id=$2',args)).rows[0].n;
   const versions=offset>=total?[]:(await tx.query(`WITH page AS MATERIALIZED (
     SELECT version FROM enterprise_workflow.catalog_revisions WHERE enterprise_id=$1 AND id=$2 ORDER BY version DESC LIMIT 30 OFFSET $3
    ) SELECT r.version,r.document,c.actor,c.reason,c.created_at FROM page JOIN enterprise_workflow.catalog_revisions r
      ON r.enterprise_id=$1 AND r.id=$2 AND r.version=page.version JOIN enterprise_workflow.catalog_commands c
      ON c.enterprise_id=r.enterprise_id AND c.id=r.command_id ORDER BY r.version DESC`,[...args,offset])).rows;
   return {versions,total,page:q.page};
  }
  if(q.manage==='1'){
   need(await this.admin(tx,a,!snapshot),'CATALOG_ADMIN_REQUIRED',403);
   const filter="enterprise_id=$1 AND kind=$2 AND ($3='' OR strpos(lower(document->>'name'),lower($3))>0)",args=[a.enterpriseId,q.kind,q.query];
   const total=(await tx.query('SELECT count(*)::int n FROM enterprise_workflow.catalog_entities WHERE '+filter,args)).rows[0].n;
   const items=offset>=total?[]:(await tx.query(`WITH page AS MATERIALIZED (
     SELECT id,document->>'name' name FROM enterprise_workflow.catalog_entities WHERE ${filter} ORDER BY name,id LIMIT 30 OFFSET $4
    ) SELECT e.id,e.kind,e.version,e.document FROM page JOIN enterprise_workflow.catalog_entities e
      ON e.enterprise_id=$1 AND e.id=page.id ORDER BY page.name,page.id`,[...args,offset])).rows;
   return {items,total,page:q.page};
  }
  need(q.kind==='sku'&&q.shopId,'CATALOG_SHOP_REQUIRED',400);await this.requireShop(tx,a,q.shopId!);
  const filter=skuScope+" AND ($3='' OR strpos(lower((s.document->>'name')||' '||(s.document->>'specification')),lower($3))>0)",args=[a.enterpriseId,q.shopId,q.query];
  const total=(await tx.query('SELECT count(*)::int n '+filter,args)).rows[0].n;
  const items=offset>=total?[]:(await tx.query("SELECT s.id,s.version,s.document->>'name' name,s.document->>'specification' specification,p.document->>'name' product,b.document->>'name' brand "+filter+" ORDER BY name,s.id LIMIT 30 OFFSET $4",[...args,offset])).rows;return {items,total,page:q.page};
 },{statementTimeoutMs:15000,legacyRepeatable:true,signal,checkCurrent:async(tx,a,result)=>{
  if(q.action==='selection'&&'selection' in result){await this.select(tx,a,q.shopId,q.skuId,result.selection.revisions);return;}
  if(q.action==='history'||q.action==='list'&&q.manage==='1'){need(await this.admin(tx,a,false),'CATALOG_ADMIN_REQUIRED',403);return;}
  if(q.action==='context'&&'shops' in result&&result.shops){
   if(result.canManage)need(await this.admin(tx,a,false),'CATALOG_ADMIN_REQUIRED',403);
   const ids=result.shops.map(s=>s.id);if(!ids.length)return;
   need((await tx.query("SELECT id FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND id=ANY($3::uuid[]) AND kind='shop' AND document->>'enabled'='true' AND document->'teamIds' ? $2",[a.enterpriseId,a.teamId,ids])).rowCount===ids.length,'CATALOG_SHOP_FORBIDDEN',403);return;
  }
  if(q.action==='list'&&q.shopId&&'items' in result){
   await this.requireShop(tx,a,q.shopId);const ids=result.items?.map(i=>i.id)??[];
   if(ids.length)need((await tx.query(`SELECT s.id ${skuScope} AND s.id=ANY($3::uuid[])`,[a.enterpriseId,q.shopId,ids])).rowCount===ids.length,'CATALOG_SELECTION_STALE');
  }
 }});}
 private async plan(tx:PoolClient,a:Actor,input:z.infer<typeof catalogInput>){
  need(new Set(input.entries.map(e=>e.document.id)).size===input.entries.length,'CATALOG_DUPLICATE_ID',400);
  const known=new Map<string,CatalogEntity>(),changes: {before:CatalogEntity|null;after:CatalogEntity;operation:string}[]=[];
  for(const e of input.entries){const old=await this.get(tx,a.enterpriseId,e.document.id);need((old?.version??0)===e.expectedVersion,'CATALOG_VERSION_CONFLICT');need(!old||old.kind===e.document.kind,'CATALOG_KIND_IMMUTABLE');need(!old||key(old.document)===key(e.document),'CATALOG_EXTERNAL_REBIND');if(e.document.externalRef){const duplicates=(await tx.query('SELECT id FROM enterprise_workflow.catalog_entities WHERE enterprise_id=$1 AND kind=$2 AND external_key=$3 AND id<>$4',[a.enterpriseId,e.document.kind,key(e.document),e.document.id])).rows;need(!duplicates.length,'CATALOG_EXTERNAL_CONFLICT');}
   const same=!!old&&sourceDigest(old.document)===sourceDigest(e.document),after={id:e.document.id,kind:e.document.kind,version:same?old!.version:e.expectedVersion+1,document:e.document};known.set(after.id,after);changes.push({before:old??null,after,operation:same?'unchanged':old?'update':'create'});
  }
  const external=changes.filter(c=>c.after.document.externalRef).map(c=>c.after.kind+':'+key(c.after.document));need(new Set(external).size===external.length,'CATALOG_EXTERNAL_CONFLICT');
  const dependencies=new Map<string,CatalogEntity>();for(const c of changes)for(const id of refs(c.after.document)){const entity=known.get(id)??await this.get(tx,a.enterpriseId,id);need(entity,'CATALOG_PARENT_INVALID');dependencies.set(id,entity!);}
  for(const c of changes){const d=c.after.document;if(d.kind==='shop'){const teams=(await tx.query('SELECT team_id FROM enterprise_workflow.teams WHERE enterprise_id=$1 AND team_id=ANY($2::uuid[]) AND enabled',[a.enterpriseId,d.teamIds])).rows;need(teams.length===d.teamIds.length,'CATALOG_TEAM_INVALID');}
   const ref=(id:string,kind:string)=>{const e=dependencies.get(id);need(e?.kind===kind,'CATALOG_PARENT_INVALID');if(d.enabled)need(e!.document.enabled,'CATALOG_PARENT_INACTIVE');};if(d.kind==='product')ref(d.brandId,'brand');if(d.kind==='sku'){ref(d.productId,'product');d.shopIds.forEach(id=>ref(id,'shop'));const product=dependencies.get(d.productId)!;if(product.document.kind==='product'){const brand=known.get(product.document.brandId)??await this.get(tx,a.enterpriseId,product.document.brandId);need(brand?.kind==='brand'&&(!d.enabled||brand.document.enabled),'CATALOG_PARENT_INACTIVE');dependencies.set(brand!.id,brand!);}}
  }
  return {changes,previewHash:sourceDigest({principal:{enterpriseId:a.enterpriseId,teamId:a.teamId,subject:a.subject},input,changes,dependencies:[...dependencies.values()].sort((a,b)=>a.id.localeCompare(b.id))}),created:changes.filter(x=>x.operation==='create').length,updated:changes.filter(x=>x.operation==='update').length,unchanged:changes.filter(x=>x.operation==='unchanged').length};
 }
 async preview(p:Principal,raw:unknown,signal?:AbortSignal){const input=catalogInput.parse(raw);return readWorkflowSnapshot(this.pool,this.resolveActor,p,async(tx,a,snapshot)=>{
  need(a.teamId,'MEMBERSHIP_REQUIRED',403);await this.available(tx);need(await this.admin(tx,a,!snapshot),'CATALOG_ADMIN_REQUIRED',403);if(!snapshot)await this.lock(tx,a.enterpriseId);return this.plan(tx,a,input);
 },{statementTimeoutMs:15000,signal,checkCurrent:async(tx,a)=>{need(await this.admin(tx,a,false),'CATALOG_ADMIN_REQUIRED',403);}});}
 async apply(p:Principal,raw:unknown){const c=catalogApply.parse(raw),input=catalogInput.parse({entries:c.entries,reason:c.reason});return this.tx(async tx=>{const a=await this.actor(tx,p);need(await this.admin(tx,a),'CATALOG_ADMIN_REQUIRED',403);await this.lock(tx,a.enterpriseId);const fp=sourceDigest({principal:p,c}),prior=(await tx.query('SELECT fingerprint,result FROM enterprise_workflow.catalog_commands WHERE enterprise_id=$1 AND id=$2',[a.enterpriseId,c.commandId])).rows[0];if(prior){need(prior.fingerprint===fp,'IDEMPOTENCY_CONFLICT');return {...prior.result,replayed:true};}const plan=await this.plan(tx,a,input);need(plan.previewHash===c.previewHash,'CATALOG_PREVIEW_CHANGED');const result={created:plan.created,updated:plan.updated,unchanged:plan.unchanged,items:plan.changes.map(c=>({id:c.after.id,version:c.after.version,operation:c.operation})),replayed:false};await tx.query('INSERT INTO enterprise_workflow.catalog_commands(enterprise_id,id,actor,reason,fingerprint,result)VALUES($1,$2,$3,$4,$5,$6)',[a.enterpriseId,c.commandId,a.subject,c.reason,fp,result]);for(const change of plan.changes){if(change.operation==='unchanged')continue;const e=change.after;await tx.query('INSERT INTO enterprise_workflow.catalog_entities(enterprise_id,id,kind,version,document,external_key)VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(enterprise_id,id)DO UPDATE SET version=EXCLUDED.version,document=EXCLUDED.document',[a.enterpriseId,e.id,e.kind,e.version,e.document,key(e.document)]);await tx.query('INSERT INTO enterprise_workflow.catalog_revisions(enterprise_id,id,version,kind,document,command_id)VALUES($1,$2,$3,$4,$5,$6)',[a.enterpriseId,e.id,e.version,e.kind,e.document,c.commandId]);}return result;});}
}
