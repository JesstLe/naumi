/** Actual released reader/decoder; SQL transport fixture, no supplier calls.
 * --baseline records the original repeated-decode defect without weakening the
 * default regression. --diagnostic accepts only a local redacted config file. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import type {Pool} from 'pg';
import {fixtureModelConfig} from './model-config-unit-fixture';
import {createPublishedModelReader,readPublishedModelSnapshot} from '../src/lib/model-config/published-repository';
import {modelConfigDigest} from '../src/lib/model-config/snapshot-value';
import {validateModelConfig} from '../src/lib/model-config/schema';
import type {ModelConfig} from '../src/lib/model-config/types';

const baseline=process.argv.includes('--baseline');
let checks=0,cases=0;
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
async function rejects(work:Promise<unknown>){await assert.rejects(work);checks++;}
function config():ModelConfig{
 const value=fixtureModelConfig('https://supplier.fixture.invalid/v1','11111111-1111-4111-8111-111111111111');
 value.upstreamModels[0].parameterMap={qualityPolicy:{mode:'passthrough',choices:['low','medium','high','xhigh','max'].map(id=>({id:id as 'medium',label:id}))},resolutionPolicy:{mode:'map',field:'size',ratioField:'aspect_ratio',values:{'1K':'1024','2K':'2048','4K':'4096'}}};
 const features=['image.generate','image.suite','image.aplus','canvas.image','canvas.expand','canvas.annotate','canvas.text-edit','tool.garment3d','tool.packaging3d','competitor.action','tool.garment','tool.avatar','tool.dewrinkle','tool.dewatermark','tool.style','tool.tryon','tool.retouch','tool.recolor','tool.replicate','tool.inpaint','tool.extract'] as const;
 value.business=Object.fromEntries(features.map(feature=>[feature,{enabled:true,defaultModelId:'image-a',options:[{modelId:'image-a',enabled:true,sort:0,unit:'image',pricing:{mode:'fixed',credits:3},parameters:{qualities:['low','medium','high','xhigh','max'],resolutions:['1K','2K','4K'],ratios:['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9','9:21','2:1']}}]}]));
 return validateModelConfig(value);
}
type Row={version:number;digest:string;config:ModelConfig;row_revision:string};
let revision=0;
const row=(version:number,c:ModelConfig):Row=>({version,digest:modelConfigDigest(c),config:structuredClone(c),row_revision:String(++revision)});
function fixture(c=config()){
 const rows=new Map<number,Row>([[1,row(1,c)]]);
 let active:number|null=1,fullReads=0,pointerReads=0,failCurrent=false;
 let hook:((version:number)=>Promise<void>)|undefined;
 const pool={async query(sql:string,params?:unknown[]){
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i);checks++;
  if(sql.includes('app_model_config_state')){
   pointerReads++;if(failCurrent)throw Error('pointer read unavailable');
   if(active===null)return {rows:[]};const v=rows.get(active);
   if(sql.includes('SELECT v.*')){fullReads++;return {rows:[v?structuredClone(v):{version:null}]};}
   return {rows:[{version:active,digest:v?.digest??null,row_revision:v?.row_revision}]};
  }
  assert.match(sql,/app_model_config_versions.*version=\$1/);fullReads++;
  const version=Number(params![0]);await hook?.(version);
  const v=rows.get(version);return {rows:v?[structuredClone(v)]:[]};
 }} as unknown as Pool;
 return {pool,rows,reader:createPublishedModelReader({pool}),setActive:(v:number|null)=>{active=v;},fail:(v:boolean)=>{failCurrent=v;},hook:(v:typeof hook)=>{hook=v;},counts:()=>({fullReads,pointerReads})};
}
async function main(){
 const f=fixture();const start=performance.now();for(let i=0;i<40;i++)await f.reader.current();
 const elapsed=performance.now()-start;
 console.log(`REPEATED_READS=40 FULL_CONFIG_READS=${f.counts().fullReads} POINTER_READS=${f.counts().pointerReads} ELAPSED_MS=${elapsed.toFixed(3)}`);
 eq(f.counts().fullReads,baseline?40:1);eq(f.counts().pointerReads,40);cases++;
 const diagnostic=process.argv.indexOf('--diagnostic');
 if(diagnostic>=0){
  const source=JSON.parse(readFileSync(process.argv[diagnostic+1],'utf8'));const probe=fixture(validateModelConfig(source.models.config));
  await probe.reader.current();const t=performance.now();for(let i=0;i<100;i++)await probe.reader.current();
  console.log(`REDACTED_CURRENT_CONFIG WARM_READS=100 FULL_CONFIG_READS=${probe.counts().fullReads} AVG_MS=${((performance.now()-t)/100).toFixed(3)}`);
 }
 if(baseline){console.log(`PUBLISHED_MODEL_READ_CACHE=BASELINE_REPRODUCED cases=${cases} checks=${checks} EXTERNAL=0`);return;}
 const a=(await f.reader.current())!;a.config.publicModels[0].label='caller mutation';a.config.business!['canvas.image']!.options[0].pricing={mode:'fixed',credits:999};
 const b=(await f.reader.current())!;eq(b.config.publicModels[0].label,'测试生图');eq(b.config.business!['canvas.image']!.options[0].pricing,{mode:'fixed',credits:3});cases++;
 const parallel=fixture();const all=await Promise.all(Array.from({length:100},()=>parallel.reader.current()));eq(parallel.counts(),{fullReads:1,pointerReads:100});all[0]!.config.providers[0].name='mutated';eq(all[1]!.config.providers[0].name,'Fixture supplier');cases++;
 const c=config();c.publicModels[0].label='published next';f.rows.set(2,row(2,c));f.setActive(2);eq((await f.reader.current())!.version,2);eq((await f.reader.current())!.config.publicModels[0].label,'published next');f.setActive(1);eq((await f.reader.current())!.version,1);eq(f.counts().fullReads,2);cases++;
 f.fail(true);await rejects(f.reader.current());f.fail(false);eq((await f.reader.current())!.version,1);cases++;
 f.setActive(null);eq(await f.reader.current(),null);f.setActive(900);await rejects(f.reader.current());f.setActive(1);cases++;
 const failed=fixture();failed.rows.get(1)!.digest='invalid';await rejects(failed.reader.current());failed.rows.set(1,row(1,config()));eq((await failed.reader.current())!.version,1);cases++;
 const missing=fixture();await rejects(missing.reader.byVersion(99));missing.rows.set(99,row(99,config()));eq((await missing.reader.byVersion(99)).version,99);cases++;
 for(const v of [0,-1,NaN,1.5,Number.MAX_SAFE_INTEGER+1])await rejects(f.reader.byVersion(v));cases++;
 const legacy=await f.reader.byVersion(1);legacy.config.bindings['image.generate']='bad';eq((await f.reader.byVersion(1)).config.bindings['image.generate'],'image-a');cases++;
 const changed=fixture();await changed.reader.current();const changedConfig=config();changedConfig.publicModels[0].label='unexpected rewrite';changed.rows.set(1,row(1,changedConfig));eq((await changed.reader.current())!.config.publicModels[0].label,'unexpected rewrite');cases++;
 // Out-of-band body corruption with unchanged digest still fails closed.
 changed.rows.get(1)!.config.publicModels[0].label='corrupted';changed.rows.get(1)!.row_revision=String(++revision);await rejects(changed.reader.current());cases++;
 // Transaction-local reads never share the process cache or an uncommitted row.
 const direct=fixture();await direct.reader.current();direct.rows.get(1)!.digest='broken';await rejects(readPublishedModelSnapshot(direct.pool));eq(direct.counts().fullReads,2);cases++;
 const lru=fixture();for(let i=2;i<=66;i++){lru.rows.set(i,row(i,config()));await lru.reader.byVersion(i);}const before=lru.counts().fullReads;await lru.reader.byVersion(2);eq(lru.counts().fullReads,before+1);cases++;
 // An evicted old failure must not erase the replacement promise for that version.
 const race=fixture();let fail!:()=>void;const held=new Promise<void>((_,reject)=>{fail=()=>reject(Error('old in-flight failure'));});let first=true;
 race.hook(async version=>{if(version===1&&first){first=false;await held;}});
 const old=race.reader.byVersion(1);const oldRejected=rejects(old);
 for(let i=2;i<=65;i++){race.rows.set(i,row(i,config()));await race.reader.byVersion(i);}await race.reader.byVersion(1);fail();await oldRejected;
 const count=race.counts().fullReads;await race.reader.byVersion(1);eq(race.counts().fullReads,count);cases++;
 const isolation=fixture();const second=createPublishedModelReader({pool:isolation.pool});await isolation.reader.current();await second.current();eq(isolation.counts().fullReads,2);cases++;
 const privateConfig=config();privateConfig.providers[0].baseUrl='http://127.0.0.1:9911/v1';const scoped=fixture();scoped.rows.set(1,row(1,privateConfig));const trusted=createPublishedModelReader({pool:scoped.pool,trustedOrigins:['http://127.0.0.1:9911']});await trusted.current();await rejects(scoped.reader.current());cases++;
 console.log(`PUBLISHED_MODEL_READ_CACHE=PASS cases=${cases} checks=${checks} CURRENT=FRESH_POINTER SNAPSHOT=PRIVATE_COPY EXTERNAL=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});

