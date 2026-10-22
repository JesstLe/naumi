import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createModelFixture} from './model-config-fixture';
import type {AssistantMessage,Model} from '@earendil-works/pi-ai';
async function main(){
 let providerCalls=0;Object.assign(process.env,{NAUMI_MULTI_USER:'1',AGENT_MODEL:'fixture-text',OPENAI_API_KEY:'fixture-agent-no-supplier-key',AGENT_API_KEY:'fixture-agent-no-supplier-key'});
 const fixture=await createModelFixture((_req,res)=>{providerCalls++;res.statusCode=500;res.end('Unexpected supplier request');});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${fixture.schemaName}`,AGENT_BASE_URL:fixture.origin+'/v1',INTERNAL_APP_ORIGIN:fixture.origin});
 const db=await import('../src/lib/db'),runtime=await import('../src/lib/agent/runtime'),control=await import('../src/app/api/agent/route'),native=await import('../src/lib/native-auth');
 const ctx=await import('../src/lib/saas/creation-context'),images=await import('../src/lib/image-job-repository'),tenants=await import('../src/lib/saas/tenants');
 const email='agent-owner@saas-agent.fixture',sessionId='ag-'+randomUUID(),cookie='nv_user='+native.signUserSession(email,Date.now()),originalFetch=globalThis.fetch;
 try{
  await tenants.ensureTenantSchema();await(await import('../src/lib/saas/creation-schema')).ensureCreationSchema();await db.getOrCreateUser(email,email);
  const tenant=await tenants.createTenant({email:'fixture-platform',admin:true},{commandId:randomUUID(),name:'Agent turn fixture',ownerEmail:email,validUntil:null,seatLimit:5,entitlementName:null,featurePolicy:{agent:true,suite:true}});
  const {getBillingRuntime}=await import('../src/lib/billing/server'),billing=await getBillingRuntime(),current=await billing.config.current(),config=structuredClone(current.config);config.switches.metering='off';config.thresholds.agentConfirmCredits=1000;
  await billing.config.publish({id:randomUUID(),expectedVersion:current.version,config,actor:'fixture',reason:'Explicit free multi-tool fixture'});
  const session=await runtime.getOrCreateSession(email,sessionId,[],{cookie,authorization:''},'fixture-text');
  const {createAssistantMessageEventStream}=await import('@earendil-works/pi-ai');
  const stream=(model:Model<'openai-completions'>,content:AssistantMessage['content'])=>{const events=createAssistantMessageEventStream(),message:AssistantMessage={role:'assistant',api:model.api,provider:'fixture',model:model.id,content,stopReason:content.some(p=>p.type==='toolCall')?'toolUse':'stop',timestamp:Date.now(),usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};events.push({type:'start',partial:message});events.push({type:'done',reason:message.stopReason as 'stop',message});return events;};
  const reference=await(await import('../src/lib/storage')).uploadImage(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),'image/png',`saas-agent-fixture/${randomUUID()}.png`,undefined,email);
  const argumentsFor=(text:string)=>({platform:'amazon',text,image_url:reference});
  session.agent.streamFunction=(model,context)=>context.messages.at(-1)?.role==='toolResult'?stream(model as Model<'openai-completions'>,[{type:'text',text:'two fixture tools finished'}]):stream(model as Model<'openai-completions'>,[{type:'toolCall',id:'first-suite',name:'generate_suite',arguments:argumentsFor('first product')},{type:'toolCall',id:'second-suite',name:'generate_suite',arguments:argumentsFor('second product')}]);
  let children=0;
  globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
   if(url.startsWith(fixture.origin+'/api/suite')){if(init?.method==='POST'){
    assert(new Headers(init.headers).has('x-naumi-creation-context'));const id='fixture-child-'+(++children);
    return ctx.withCreationRequest(new Request(url,init),email,async()=>{assert.equal(ctx.currentCreationContext()?.tenantId,tenant.tenantId);await images.createImageJob(id,email,'suite',{status:'pending',paidOperationVersion:1},{p:{prompt:'fixture child'}},0,false);await db.addArtworks(email,[{id,title:id,category:'main',prompt:'fixture',status:'completed',image:'/media/fixture.png',gradient:''}]);await images.saveImageJob(id,{status:'done',shots:[{id,status:'done',url:'/media/fixture.png'}]},null);return Response.json({jobId:id});});
   }return Response.json({status:'done',shots:[{url:'/media/fixture.png',status:'done'}]});}
   return originalFetch(input,init);
  };
  const request=new Request(fixture.origin+'/api/agent',{method:'POST',headers:{cookie,'content-type':'application/json','x-naumi-workspace':tenant.tenantId},body:JSON.stringify({sessionId,message:'分别生成两套不同的商品图'})});
  const response=await control.POST(request),body=await response.json();assert.equal(response.status,200);assert.equal(body.reply,'two fixture tools finished');assert.equal(children,2,JSON.stringify(session.events.filter(e=>e.type==='attention'||e.type==='tool_end')));
  const roots=(await db.getPool().query("SELECT * FROM app_creation_records WHERE source_kind='agent-turn' AND source_id LIKE $1",[sessionId+':%'])).rows;assert.equal(roots.length,1);assert.equal(roots[0].parent_id,null);assert.equal(roots[0].status,'succeeded');
  const childRows=(await db.getPool().query("SELECT * FROM app_creation_records WHERE parent_id=$1 AND source_kind='image:suite'",[roots[0].id])).rows;assert.equal(childRows.length,2);assert(childRows.every(row=>row.tenant_id===tenant.tenantId&&row.payer_account_id===email));assert.equal(providerCalls,0);
  console.log('SAAS_AGENT_EVIDENCE_FIXTURE_PASS actual_agent_route_runtime=1 actual_naumi_tools=2 signed_continuation=1 real_pg_children=2 top_level_turn=1 frozen_tenant_payer=1 supplier_transport=fixture real_supplier_calls=0');
 }finally{globalThis.fetch=originalFetch;const session=runtime.getSession(email,sessionId);if(session){session.running=false;session.canvasExecuting=false;runtime.removeRuntimeSession(email,sessionId);}await db.getPool().end();await fixture.cleanup();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;setTimeout(()=>process.exit(1),100).unref();});
