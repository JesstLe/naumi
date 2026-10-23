import assert from 'node:assert/strict';
import {submitCanvasImagegen} from '../src/lib/imagegen/canvas-client';
import {ImagegenHttpError,readImagegenResponse,ImagegenPreparationCancelled} from '../src/lib/imagegen/http';

class MemoryStorage implements Storage {
  values=new Map<string,string>();get length(){return this.values.size}key(i:number){return [...this.values.keys()][i]??null}
  getItem(k:string){return this.values.get(k)??null}setItem(k:string,v:string){this.values.set(k,v)}removeItem(k:string){this.values.delete(k)}clear(){this.values.clear()}
}
const baseline=process.argv.includes('--baseline');
async function main(){
 const original=globalThis.fetch;let checks=0;
 const check=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++};
 let plans=0,posts:any[]=[],confirms:string[]=[],confirm=true,failPlan=false,staleCount=1,status=409,accepted:boolean|undefined=false,code:string|undefined='IMAGEGEN_PLAN_CHANGED',newCredits=6,newConfirm=false,unknown=false,switchOnReplan=false,active=true;
 const storage=new MemoryStorage();
 Object.assign(globalThis,{sessionStorage:storage,window:{localStorage:new MemoryStorage(),confirm:(message:string)=>{confirms.push(message);return confirm}}});
 const reset=()=>{plans=0;posts=[];confirms=[];confirm=true;failPlan=false;staleCount=1;status=409;accepted=false;code='IMAGEGEN_PLAN_CHANGED';newCredits=6;newConfirm=false;unknown=false;switchOnReplan=false;active=true;};
 const run=()=>{const f=new FormData();f.set('prompt','draw a bottle');f.set('ratio','1:1');f.set('resolution','4K');f.set('model','image-a');return submitCanvasImagegen(f,'source',undefined,{owner:'fixture@example.test',project:'workspace',isCurrent:()=>active})};
 try{
  globalThis.fetch=async(input,init)=>{
   const url=String(input),body=JSON.parse(String(init?.body||'{}'));
   if(url.endsWith('/plan')){plans++;if(failPlan&&plans>1)throw Error('local plan connection failure');if(switchOnReplan&&plans>1)active=false;return Response.json({request:body,steps:[{operation:'generate'}],intent:{background:null},warnings:[],totalCredits:plans===1?6:newCredits,confirmationRequired:plans===1?false:newConfirm,billingVersion:8,modelVersion:plans===1?135:136})}
   posts.push(body);if(unknown)throw Error('connection interrupted after send');
   if(posts.length<=staleCount)return Response.json({error:'quote changed',...(accepted===undefined?{}:{accepted}),...(code?{code}:{})},{status});
   return Response.json({jobId:'imagegen-'+body.operationId});
  };
  if(baseline){await assert.rejects(run(),/quote changed/);check(plans,1,'old client stops');check(posts.length,1,'old client no refresh');console.log('BASELINE_CLIENT=REPRODUCED STALE_PREVIEW_BLOCKED PLANS=1 POSTS=1 SUPPLIER_CALLS=0');return;}
  check(await(await run()).json(),{jobId:'imagegen-'+posts[0].operationId},'same-price config change submits');
  check(plans,2,'one automatic preview refresh');check(posts.length,2,'one definite-unaccepted retry');check(posts[0].operationId,posts[1].operationId,'same operation id');check(posts.map(x=>x.confirmation.modelVersion),[135,136],'fresh versions');check(posts.map(x=>x.parameters.resolution),['4K','4K'],'original tier preserved');check(confirms.length,0,'no same-price nuisance confirmation');
  reset();newCredits=12;await run();check(confirms.length,1,'changed price requires user consent');assert.match(confirms[0],/12/);checks++;check(posts[1].confirmation.credits,12,'new quote sent');
  reset();newCredits=12;confirm=false;await assert.rejects(run(),e=>e instanceof ImagegenPreparationCancelled&&e.accepted===false);checks++;check(posts.length,1,'cancelled new price creates no second submit');
  reset();newConfirm=true;await run();check(confirms.length,1,'new expensive/multistage confirmation retained');
  for(const proof of [true,undefined]){reset();accepted=proof;await assert.rejects(run(),e=>e instanceof ImagegenHttpError&&e.accepted===proof);checks++;check(plans,1,'no accepted/unknown automatic replan');check(posts.length,1,'no accepted/unknown automatic post');}
  reset();unknown=true;await assert.rejects(run(),/connection interrupted/);checks++;check(plans,1,'network unknown no replan');check(posts.length,1,'network unknown no replay');
  for(const mutation of [{status:400},{code:'MODEL_INCOMPATIBLE'},{code:undefined}]){reset();if('status'in mutation)status=mutation.status!;if('code'in mutation)code=mutation.code;await assert.rejects(run());checks++;check(posts.length,1,'other errors no retry');check(plans,1,'other errors no replan');}
  reset();staleCount=2;await assert.rejects(run(),e=>e instanceof ImagegenHttpError&&e.code==='IMAGEGEN_PLAN_CHANGED'&&e.accepted===false);checks++;check(posts.length,2,'repeated config churn capped');check(plans,2,'bounded replan');
  reset();failPlan=true;await assert.rejects(run(),e=>e instanceof ImagegenHttpError&&e.accepted===false);checks++;check(posts.length,1,'refresh failure preserves proven non-acceptance');
  reset();switchOnReplan=true;await assert.rejects(run(),e=>e instanceof ImagegenHttpError&&e.accepted===false);checks++;check(posts.length,1,'workspace/project change cancels');
  const conflict=await readImagegenResponse(Response.json({error:'changed',code:'IMAGEGEN_PLAN_CHANGED',accepted:false},{status:409}),'fallback').catch(e=>e);
  assert.ok(conflict instanceof ImagegenHttpError);checks++;
  check([conflict.status,conflict.accepted,conflict.code],[409,false,'IMAGEGEN_PLAN_CHANGED'],'structured error survives JSON');
  console.log(`CONFIRMATION_CLIENT=PASS CHECKS=${checks} SAME_OPERATION=1 UNKNOWN_REPLAYS=0 SUPPLIER_CALLS=0`);
 }finally{globalThis.fetch=original;}
}
main().catch(e=>{console.error(e);process.exitCode=1});
