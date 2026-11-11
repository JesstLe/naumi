import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';

async function main(){
 const out=path.resolve(process.env.EVIDENCE_OUT||'output/tools-selected-models');fs.mkdirSync(out,{recursive:true});
 const transparent=await sharp({create:{width:1024,height:1024,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:await sharp({create:{width:512,height:512,channels:4,background:'#3067d9'}}).png().toBuffer(),left:256,top:256}]).png().toBuffer();
 const wire:any[]=[],checks:string[]=[];let reject=false,origin='',db:any,textResult='';
 const f=await createModelFixture(async(req,res)=>{try{
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   res.setHeader('content-type','application/json');
   const content=Buffer.concat(chunks);let body:any;
   if(String(req.headers['content-type']).includes('multipart')){const form=await new Request(origin,{method:'POST',headers:{'content-type':String(req.headers['content-type'])},body:content}).formData();body=Object.fromEntries([...form.entries()].map(([k,v])=>[k,typeof v==='string'?v:'<image>']));}else body=content.length?JSON.parse(content.toString()):{};
   wire.push({path:req.url,body});
   if(reject){res.statusCode=400;return res.end(JSON.stringify({error:{message:'fixture explicit rejection'}}));}
   if(req.url?.includes('/chat/completions'))return res.end(JSON.stringify({id:'fixture-completion',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:textResult},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}}));
   if(req.url?.includes('/images/'))return res.end(JSON.stringify({created:1,data:[{b64_json:transparent.toString('base64')}],usage:{input_tokens:10,output_tokens:10,total_tokens:20}}));
   res.statusCode=404;res.end('{}');
 }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}});origin=f.origin;
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:'1',MODEL_CONFIG_TRUSTED_ORIGINS:origin,NAUMI_ROUTER_MANAGEMENT_URL:origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-tools-private-control-token-20261111',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-tools-private-envelope-secret-20261111',OPENAI_API_KEY:'fixture-local-key',OPENAI_BASE_URL:origin+'/v1',STORAGE_DRIVER:'local',MEDIA_DIR:path.join(out,'media')});
 try{
  const c=f.config,u=c.upstreamModels[0];Object.assign(u.capabilities,{transparent:true,preserveIdentity:true,maxReferenceImages:16});u.model='selected-wire-a';u.parameterMap={};
  c.upstreamModels.push({...structuredClone(u),id:'u2',model:'selected-wire-b'});c.publicModels.push({...structuredClone(c.publicModels[0]),id:'image-b',label:'Second model',target:{type:'upstream',id:'u2'}});c.bindings['image.cutout']='image-a';
  const textCredential=await f.credentials.importPlain({providerId:'p2',plain:f.marker,actor:'fixture'});
  c.providers.push({...structuredClone(c.providers[0]),id:'p2',protocol:'openai-chat',credentialRef:textCredential.id});
  c.upstreamModels.push({...structuredClone(u),id:'text-u',providerId:'p2',modality:'text',model:'selected-text-b',capabilities:{...u.capabilities,generate:true,edit:false,transparent:false,vision:true}});
  c.publicModels.push({id:'text-b',label:'Text B',modality:'text',enabled:true,visible:true,target:{type:'upstream',id:'text-u'}});
  for(const binding of ['agent.text','text.generate','text.title','text.competitor','vision.reference'] as const)c.bindings[binding]='text-b';
  // Explicit public selection must also work without an old hidden cutout binding.
  delete c.bindings['image.cutout'];
  await f.repo.current();db=await import('../src/lib/db');await db.ensureSchema();
  const billing=await import('../src/lib/billing/service'),service=billing.createBillingService();
  const email=`tools-selected-${randomUUID()}@fixture.test`;await db.getOrCreateUser(email);
  await billing.withBillingTransaction(db.getPool(),async(tx:any)=>{await service.grantTx(tx,{id:randomUUID(),email,amount:500,source:'admin',reason:'local fixture',expiry:{unit:'years',value:1},ledgerId:randomUUID(),fingerprint:randomUUID(),actor:'fixture'});});
  const {getBillingRuntime}=await import('../src/lib/billing/runtime'),runtime=await getBillingRuntime(),old=await runtime.config.current(),config=structuredClone(old.config);
  const names=['cutout','upscale','printfile','dewatermark','avatar','style','extract','recolor','retouch','inpaint','dewrinkle','garment','replicate'] as const;
  config.switches.metering='on';for(const name of names){config.features[`tool.${name}`].pricing={mode:'fixed',credits:1};config.features[`tool.${name}`].rules=[];}
  await runtime.config.publish({id:randomUUID(),expectedVersion:old.version,config,actor:'fixture',reason:'selected-model fixture'});
  const {signUserSession}=await import('../src/lib/native-auth');
  const {GET:catalog}=await import('../src/app/api/models/route');
  for(const feature of ['tool.cutout','tool.upscale','tool.printfile']){const result=await catalog(new Request('http://internal/api/models?feature='+feature));const value=await result.json();assert.equal(value.supported,true);assert.equal(value.selectionMode,'user');assert.deepEqual(value.models.map((m:any)=>m.id),['image-a','image-b']);checks.push(feature+' exposes user models');}
  const call=async(name:string,model:string,id:string)=>{
   const route=await import(`../src/app/api/${name}/route.ts`),form=new FormData();
   for(const key of ['image','mask','ref','top'])form.set(key,new File([new Uint8Array(transparent)],key+'.png',{type:'image/png'}));
   for(const [k,v]of Object.entries({quality:'high',resolution:'1K',style:'watercolor',styleLabel:'水彩',color:'#336699',ratio:'1:1',prompt:'fixture edit',direction:'product',dpi:'72',wMm:'100',hMm:'100',category:name,option:'gloss'}))form.set(k,v);
   const response=await route.POST(new Request('http://internal/api/'+name,{method:'POST',headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,origin:'http://internal','x-naumi-feature-model':model,'x-naumi-image-quality':'high','x-naumi-billing-operation-id':id},body:form}));
   return {status:response.status,body:await response.json()};
  };
  for(const name of names){
   const id=randomUUID(),before=wire.length,result=await call(name,'image-b',id);
   fs.writeFileSync(path.join(out,`${name}.json`),JSON.stringify(result,null,2));
   assert.equal(result.status,200,`${name}: ${JSON.stringify(result.body).slice(0,350)}`);assert.ok(result.body.url||result.body.results||result.body.images,`${name} returns image`);
   assert.ok(wire.length>before,`${name} calls model`);assert.ok(wire.slice(before).every(r=>r.body.model==='selected-wire-b'),`${name} honors explicit selection`);
   assert.equal(wire.at(-1).body.quality,'high',`${name} honors quality`);
   const replayBefore=wire.length,replay=await call(name,'image-b',id);assert.equal(replay.status,200);assert.equal(wire.length,replayBefore,`${name} replay never resubmits`);
   const row=(await f.sql.query('SELECT state,charged_credits FROM app_billing_operations WHERE id=$1',['tool-'+id])).rows[0];assert.equal(row.state,'settled');assert.equal(Number(row.charged_credits),1);
   checks.push(name+' model-b quality-high success persisted settled-once replay-no-submit');console.log('PASS '+checks.at(-1));
  }
  for(const name of ['upscale','printfile']){reject=true;const id=randomUUID(),r=await call(name,'image-a',id);assert.ok(r.status>=400);const row=(await f.sql.query('SELECT state,charged_credits FROM app_billing_operations WHERE id=$1',['tool-'+id])).rows[0];assert.equal(row.state,'settled');assert.equal(Number(row.charged_credits),0);checks.push(name+' explicit failure zero charge');}
  reject=false;
  for(const name of ['title-gen','ipcheck']){
    const route=await import(`../src/app/api/${name}/route.ts`);
    textResult=name==='title-gen'?JSON.stringify({titles:['测试标题'],sellingPoints:['测试卖点']}):JSON.stringify({risk:'medium',summary:'测试风险结论',items:[{name:'图案',reason:'测试理由'}],advice:'人工复核'});
    const form=new FormData();form.set('image',new File([new Uint8Array(transparent)],'source.png',{type:'image/png'}));form.set('description','测试产品');form.set('prompt','生成标题');
    const before=wire.length,response=await route.POST(new Request('http://internal/api/'+name,{method:'POST',headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,origin:'http://internal','x-naumi-feature-model':'text-b','x-naumi-text-model':'text-b','x-naumi-billing-operation-id':randomUUID()},body:form}));const data=await response.json();
    assert.equal(response.status,200,`${name}: ${JSON.stringify(data).slice(0,300)}`);assert.equal(wire.length,before+1);assert.equal(wire.at(-1).body.model,'selected-text-b');checks.push(name+' selected vision-capable text model succeeds');
    textResult='{invalid-json';
    const bad=await route.POST(new Request('http://internal/api/'+name,{method:'POST',headers:{cookie:`nv_user=${signUserSession(email,Date.now())}`,origin:'http://internal','x-naumi-feature-model':'text-b','x-naumi-text-model':'text-b','x-naumi-billing-operation-id':randomUUID()},body:form}));const badBody=await bad.json();
    assert.ok(bad.status>=400);assert.ok(badBody.error);assert.equal(badBody.risk,undefined);assert.equal(badBody.titles,undefined);checks.push(name+' invalid upstream JSON never becomes a successful result');
  }
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,wire,supplier:'loopback fixture',realRoutes:true,realPostgres:true},null,2));console.log(`TOOLS_SELECTED_MODELS=PASS CHECKS=${checks.length} ROUTES=${names.length} REAL_PG=1 PAID_EXTERNAL=0`);
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:String(error),checks,wire},null,2));throw error;}
 finally{await db?.getPool?.().end().catch(()=>{});await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
