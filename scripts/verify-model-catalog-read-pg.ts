/** Full-tree actual HTTP adapter A/B on an isolated real PG. Published reads
 * must not construct management connections or silently seed legacy data. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Client} from 'pg';
import {build} from 'esbuild';
import {createModelFixture} from './model-config-fixture';
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline'),out=path.resolve(arg('--out')||path.join(process.env.MODEL_CATALOG_EVIDENCE||'output/model-catalog-read','run'));
async function main(){
 await mkdir(path.dirname(out),{recursive:true});await mkdir(out,{recursive:false});const f=await createModelFixture();let checks=0;const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+f.schemaName,NAUMI_MULTI_USER:'1',MODEL_CONFIG_TRUSTED_ORIGINS:f.origin,MODEL_CONFIG_ENVELOPE_SECRET:'r6c-model-catalog-envelope-fixture-only-20261027',NAUMI_ROUTER_MANAGEMENT_URL:f.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'too-short',OPENAI_API_KEY:'fixture',OPENAI_IMAGE_MODEL:'image-a'});
 let pool:typeof import('../src/platform/db/pool')|undefined;
 try{
  await f.repo.current();pool=await import('../src/platform/db/pool');await(await import('../src/lib/application/persistence')).initializeApplicationPersistence();
  const billing=await(await import('../src/lib/billing/runtime')).getBillingRuntime(),current=await billing.config.current(),cfg=structuredClone(current.config);cfg.switches.metering='on';cfg.features['canvas.image'].pricing={mode:'fixed',credits:6};cfg.features['canvas.image'].rules=[];
  await billing.config.publish({id:randomUUID(),actor:'fixture',reason:'R6C catalog displayed price',expectedVersion:current.version,config:cfg});
  const require=createRequire(import.meta.url),results=[];let external=0;
  for(const connection of ['malformed-admin','missing-admin','healthy-admin']){
   process.env.NAUMI_ROUTER_MANAGEMENT_URL=connection==='missing-admin'?'':f.origin;
   process.env.NAUMI_ROUTER_MANAGEMENT_TOKEN=connection==='healthy-admin'?'r6c-healthy-control-fixture-token-20261027':'bad';
   const entry=['export * as config from "'+path.join(root,'src/app/api/config/route.ts').replaceAll('\\','/')+'";','export * as models from "'+path.join(root,'src/app/api/models/route.ts').replaceAll('\\','/')+'";','export * as text from "'+path.join(root,'src/app/api/text-models/route.ts').replaceAll('\\','/')+'";'].join('\n');
   const file=path.join(out,connection+'.cjs');await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},outfile:file,bundle:true,platform:'node',format:'cjs',external:['pg','sharp'],alias:{'server-only':path.resolve('scripts/fleet-server-only.cjs')},tsconfig:path.join(root,'tsconfig.json')});
   const api=require(file),before=(await pool.getPool().query('SELECT active_version FROM app_model_config_state')).rows[0],queries:string[]=[],original=Client.prototype.query,realFetch=globalThis.fetch;
   Client.prototype.query=function(this:Client,...args:unknown[]){queries.push(String((args[0] as any)?.text||args[0]));return Reflect.apply(original,this,args);} as typeof Client.prototype.query;
   globalThis.fetch=async()=>{external++;throw Error('Published catalog attempted external request');};
   const call=async(run:()=>Promise<Response>)=>{try{const response=await run();return {status:response.status,body:await response.json(),thrown:false};}catch(e){return {status:500,body:{error:String(e)},thrown:true};}};
   let config,models,text;
   try{config=await call(()=>api.config.GET(new Request('http://fixture.test/api/config')));models=await call(()=>api.models.GET(new Request('http://fixture.test/api/models?feature=canvas.image')));text=await call(()=>api.text.GET());}finally{Client.prototype.query=original;globalThis.fetch=realFetch;}
   eq([config.status,models.status,text.status],baseline&&connection!=='healthy-admin'?[500,503,500]:[200,200,200]);
   if(config.status===200){eq(config.body.multiUser,true);eq(config.body.defaultImageModel,'image-a');eq(models.body.models[0].creditHint,'参考标准1K 6 积分/张');eq(text.body.models,[]);}
   eq(external,0);eq(queries.filter(q=>/\b(?:CREATE|ALTER|INSERT|UPDATE|DELETE)\b/i.test(q)),[]);eq((await pool.getPool().query('SELECT active_version FROM app_model_config_state')).rows[0],before);
   results.push({connection,config,models,text,queries});
  }
  await writeFile(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',mode:baseline?'BASELINE':'MODIFIED',checks,sourceRoot:root,results,external},null,2)+'\n');
  console.log(`MODEL_CATALOG_READ=PASS MODE=${baseline?'BASELINE':'MODIFIED'} CHECKS=${checks} REAL_PG=1 ACTUAL_HANDLERS=3 BAD_ADMIN=${baseline?'READ_FAILED':'READ_OK'} MISSING_ADMIN=${baseline?'READ_FAILED':'READ_OK'} HEALTHY_ADMIN=READ_OK SAME_PRICE=6 WRITE_SQL=0 EXTERNAL=0`);
 }finally{await pool?.getPool().end();await f.cleanup();console.log('MODEL_CATALOG_READ_CLEANUP=PASS OWN_SCHEMA_DROPPED=1 POOLS_CLOSED=1 LOOPBACK_CLOSED=1');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
