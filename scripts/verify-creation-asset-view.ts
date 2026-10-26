import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool} from 'pg';

async function main(){
 const option=(name:string)=>process.argv[process.argv.indexOf(name)+1];
 const out=resolve(option('--output-root')),root=resolve(option('--source-root')),baseline=process.argv.includes('--baseline');
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const base=new URL(process.env.DATABASE_URL!);assert.equal(base.hostname,'127.0.0.1');assert.match(base.pathname,/fixture/);
 mkdirSync(out,{recursive:true});const admin=new Pool({connectionString:base.toString()}),name=`creation_view_fixture_${Date.now()}`;await admin.query(`CREATE DATABASE ${name}`);base.pathname=`/${name}`;process.env.DATABASE_URL=base.toString();
 const sourceFiles=['src/lib/saas/creations.ts','src/lib/saas/creation-contracts.ts','src/lib/saas/creation-writer.ts',...(!baseline?['src/lib/saas/creation-asset-view.ts']:[])];
 const hashes=Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
 const db=await import(pathToFileURL(resolve(root,'src/lib/db.ts')).href),schema=await import(pathToFileURL(resolve(root,'src/lib/saas/creation-schema.ts')).href);
 let pool:any;const cases:string[]=[];let network=0;const previousFetch=globalThis.fetch;globalThis.fetch=async()=>{network++;throw Error('UNEXPECTED_NETWORK');};
 try{
  await schema.ensureCreationSchema();pool=db.getPool();
  const reader=await import(pathToFileURL(resolve(root,'src/lib/saas/creations.ts')).href);
  const email='asset-view@fixture.invalid',foreign='foreign@fixture.invalid',rootId=`cr-${randomUUID()}`,child=`cr-${randomUUID()}`,other=`cr-${randomUUID()}`;
  for(const [id,actor,parent]of [[rootId,email,null],[child,email,rootId],[other,foreign,rootId]])await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,payer_account_id,source_kind,source_id,parent_id,status,request_snapshot)VALUES($1,$2,'personal',$2,'fixture',$1,$3,'succeeded',$4)",[id,actor,parent,JSON.stringify({state:'recorded',text:'原始要求'})]);
  const h=(s:string)=>createHash('sha256').update(s).digest('hex'),original=h('original-pixels'),processed=h('changed-pixels');
  let sequence=0;
  const add=async(overrides:Record<string,unknown>={})=>{const a={id:`ca-${randomUUID()}`,creation_id:rootId,actor_email:email,direction:'input',role:'reference',position:sequence++,variant:'original',storage_ref:`/media/fixture/${sequence}.png`,hash:original,availability:'recorded',media_type:'image',...overrides};await pool.query('INSERT INTO app_creation_assets(id,creation_id,actor_email,direction,role,position,variant,storage_ref,hash,availability,media_type)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',Object.values(a));return a;};
  await add({role:'edit-target'});await add({creation_id:child});await add({creation_id:child,role:'edit-target'});
  await add({variant:'processed',role:'edit-target'});await add({creation_id:child,variant:'processed',role:'edit-target'});await add({creation_id:child,variant:'processed',hash:processed});
  await add({direction:'output',role:'result',storage_ref:'artwork:fixture-result',hash:h('result')});await add({creation_id:child,direction:'output',role:'result',storage_ref:'artwork:fixture-result',hash:h('result')});
  await add({creation_id:other,actor_email:foreign,hash:h('foreign')});
  const before=(await pool.query('SELECT id,to_jsonb(a)::text AS row FROM app_creation_assets a ORDER BY id')).rows;
  const get=(pages:Record<string,number>={})=>reader.creationDetail({platform:true},rootId,pages);
  const detail=await get();assert.equal(detail.status,'succeeded');assert.equal(detail.assets.filter((a:any)=>a.direction==='output').length,1);assert.equal(detail.children.length,1);cases.push('original-output-dedup-positive-control','foreign-child-excluded');
  if(baseline){assert.equal(detail.assets.length,7);assert.equal(detail.assetPagination.total,7);assert.equal(detail.assets.filter((a:any)=>a.direction==='input').length,6);cases.push('six-inputs-reproduced');}
  else{
   assert.equal(detail.assets.length,3);assert.equal(detail.assetPagination.total,3);assert.equal(detail.assets[0].direction,'output');cases.push('six-inputs-grouped-to-two','pagination-counts-groups','result-first');
   const input=detail.assets.find((a:any)=>a.hash===original);assert.equal(input.variant,'original');assert.deepEqual(input.roles,['edit-target','reference']);assert.equal(detail.assets.find((a:any)=>a.hash===processed).variant,'processed');cases.push('original-representative','roles-retained','changed-processed-retained');
   await add({role:'mask'});assert.equal((await get()).assetPagination.total,4);cases.push('mask-separate');
   await add({availability:'not_recorded',storage_ref:''});await add({availability:'not_recorded',storage_ref:''});assert.equal((await get()).assetPagination.total,6);cases.push('unknown-inputs-not-merged');
   await add({hash:null,storage_ref:'/media/shared.png'});await add({hash:null,storage_ref:'/media/shared.png'});assert.equal((await get()).assetPagination.total,7);cases.push('exact-controlled-reference-fallback');
   await add({direction:'output',role:'result',storage_ref:'artwork:another-result',hash:original});assert.equal((await get()).assetPagination.total,8);cases.push('output-not-merged-with-input');
   await add({direction:'output',role:'result',storage_ref:'artwork:third-result',hash:original});assert.equal((await get()).assetPagination.total,9);cases.push('distinct-output-ids-retained');
   for(let i=0;i<30;i++)await add({hash:h(`distinct-${i}`)});
   const first=await get(),second=await get({assetPage:2});assert.equal(first.assetPagination.total,39);assert.equal(first.assets.length,24);assert.equal(second.assets.length,15);assert.equal(new Set([...first.assets,...second.assets].map((a:any)=>a.id)).size,39);cases.push('stable-bounded-pagination');
  }
  const saved=(await pool.query('SELECT id,to_jsonb(a)::text AS row FROM app_creation_assets a WHERE id=ANY($1::text[]) ORDER BY id',[before.map((a:any)=>a.id)])).rows;assert.deepEqual(saved,before);assert.equal(network,0);cases.push('original-evidence-unchanged','zero-network');
  const result={status:baseline?'REPRODUCED':'PASS',cases,loadedHashes:hashes,sourceRoot:root,initialAssets:detail.assets,network,supplierCalls:0,businessProductionWrites:0};writeFileSync(resolve(out,baseline?'BASELINE.json':'MODIFIED.json'),JSON.stringify(result,null,2)+'\n');
  console.log(`CREATION_ASSET_VIEW=${result.status} CASES=${cases.length} INITIAL_ASSETS=${detail.assets.length} NETWORK=0 EXIT=${baseline?1:0}`);if(baseline)process.exitCode=1;
 // Other imported schema owners can retain their own pools. The disposable
 // fixture container is removed by the caller after every child process exits.
 }finally{globalThis.fetch=previousFetch;if(pool)await pool.end();await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
