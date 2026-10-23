import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import {createModelFixture} from './model-config-fixture';
import presets from '../src/lib/model-config/video-family-presets.json';
import {VERIFIED_VIDEO_PROFILES} from '../src/lib/model-config/video-family-preset';
import type {VideoWireProfile} from '../src/lib/video/capability-schema';
import type {ExecutionBundle} from '../src/lib/model-config/context';
import type {VideoGenerationRequest} from '../src/lib/video/types';

/** Real application/PG/HTTP with synthetic supplier and media-service transport.
 * This proves integration, not native video decoding or a Linux sandbox. */
async function main(){
 Object.assign(process.env,{STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',VIDEO_REFERENCE_PUBLIC_BASE_URL:'https://media.fixture.invalid',MEDIA_DIR:path.resolve('output/saas-video-profile-integration/media'),MEDIA_JOB_DIR:path.resolve('output/saas-video-profile-integration/jobs')});
 let digest='',complete=false,mediaInspections=0;const calls:{model:string;body:any;authorization:string|undefined;path:string}[]=[],polls:{path:string;authorization:string|undefined}[]=[];
 const jobs=new Map<string,{model:string;apib:boolean}>(),publications=new Map<string,unknown>();
 const resultBytes=Buffer.from('explicit-synthetic-video-transport-not-an-encoded-movie');
 const fixture=await createModelFixture(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
  res.setHeader('content-type','application/json');const send=(value:unknown)=>res.end(JSON.stringify(value));
  if(req.url==='/internal/config/prepare')return send({digest:body.digest,phase:'prepared'});
  if(req.url==='/internal/config/activate'){digest=body.digest;const value={id:body.id,digest,phase:'applied'};publications.set(body.id,value);return send(value);}
  if(req.url==='/internal/config/state')return send({digest});
  if(req.url?.startsWith('/internal/config/publications/'))return send(publications.get(decodeURIComponent(req.url.split('/').at(-1)!)));
  if(req.url==='/health')return send({ok:true,sandbox:false,version:'fixture-media-service',draining:false,running:0,queued:0,terminal:0,maxActive:8});
  if(req.url?.startsWith('/jobs/')){if(req.method==='POST')mediaInspections++;return send({id:req.url.split('/').at(-1),status:'completed',result:{outputs:[],probes:[{durationSeconds:4,width:1280,height:720,videoCodec:'h264',audioCodecs:[],formatName:'mov,mp4',frameRate:24}],stdout:''}});}
  if(req.url==='/fixture-result.mp4'){res.setHeader('content-type','video/mp4');return res.end(resultBytes);}
  if(req.method==='POST'&&/\/v1\/videos(?:\/generations)?$/.test(req.url||'')){
   calls.push({model:body.model,body,authorization:req.headers.authorization,path:req.url!});
   if(body.prompt.includes('UNKNOWN_ACCEPTANCE'))return res.destroy();
   const id='fixture-up-'+calls.length,apib=req.url!.endsWith('/generations');jobs.set(id,{model:body.model,apib});return send(apib?{data:[{task_id:id,status:'processing'}]}:{id,status:'processing'});
  }
  if(req.method==='GET'&&/\/v1\/(tasks|videos)\//.test(req.url||'')){
   polls.push({path:req.url!,authorization:req.headers.authorization});const id=req.url!.split('/').at(-1)!.split('?')[0],job=jobs.get(id);assert(job);
   const status=complete?'completed':'processing',url=fixture.origin+'/fixture-result.mp4';
   return send(job.apib?{data:{status,progress:complete?100:20,result:{videos:[{url:[url]}]}}}:{status,video_url:complete?url:undefined,output:{task_status:status,video_url:complete?url:undefined}});
  }
  res.statusCode=404;return send({error:'Unknown isolated fixture endpoint'});
 });
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${fixture.schemaName}`,NAUMI_MULTI_USER:'1',NAUMI_MODEL_CONFIG_ONLY:'1',NAUMI_ROUTER_MANAGEMENT_URL:fixture.origin,NAUMI_ROUTER_MANAGEMENT_TOKEN:'fixture-video-profile-router-token-only',MODEL_CONFIG_ENVELOPE_SECRET:'fixture-video-profile-envelope-secret-only',MODEL_CONFIG_TRUSTED_ORIGINS:fixture.origin,
  STORAGE_DRIVER:'local',MEDIA_PRIVATE:'1',MEDIA_REMOTE_ACCESS:'proxy',VIDEO_REFERENCE_PUBLIC_BASE_URL:'https://media.fixture.invalid',MEDIA_DIR:path.resolve('output/saas-video-profile-integration/media'),MEDIA_JOB_DIR:path.resolve('output/saas-video-profile-integration/jobs'),MEDIA_WORKER_ORIGIN:fixture.origin,MEDIA_WORKER_SECRET:'fixture-media-service-secret-at-least-32-characters'});
 const samples=VERIFIED_VIDEO_PROFILES.map(profile=>presets.items.find(item=>item.profile===profile&&(['apimart-apib-wan','geek-kling'].includes(profile)?(item.definition.limits.images||0)>0:true))!);
 for(const [index,item]of samples.entries()){
  const id='profile-'+index,credential=await fixture.credentials.importPlain({providerId:id,plain:'fixture-key-'+index+'-never-real',actor:'fixture'});
  fixture.config.providers.push({id,name:'Fixture '+index,protocol:item.profile.startsWith('geek-')?'openai-videos':'apimart',baseUrl:fixture.origin+'/'+id,credentialRef:credential.id,enabled:true,timeoutMs:10000,maxConcurrent:10,options:{videoProfile:item.profile as VideoWireProfile,idempotencyStrategy:'none'}});
  fixture.config.upstreamModels.push({...structuredClone(fixture.config.upstreamModels[0]),id:'up-'+index,providerId:id,model:item.model,modality:'video',capabilities:{...structuredClone(fixture.config.upstreamModels[0].capabilities),edit:false,maxReferenceImages:item.definition.limits.images||0,video:structuredClone(item.definition)},parameterMap:{videoProfile:item.profile}} as any);
  fixture.config.publicModels.push({id:'video-'+index,label:'Frozen video '+index,modality:'video',enabled:true,visible:true,target:{type:'upstream',id:'up-'+index},toolScope:{features:['video.generate'],defaultFor:index===0?['video.generate']:[]}});
 }
 fixture.config.bindings['video.generate']='video-0';(await import('../src/lib/model-config/schema')).validateModelConfig(fixture.config,{trustedOrigins:[fixture.origin]});await fixture.repo.current();
 const db=await import('../src/lib/db'),ctx=await import('../src/lib/saas/creation-context'),writer=await import('../src/lib/saas/creation-writer'),tenants=await import('../src/lib/saas/tenants'),video=await import('../src/lib/video/service'),storage=await import('../src/lib/storage');
 const email='profile-owner@saas.fixture',other='profile-other@saas.fixture',pool=db.getPool();
 try{
  await tenants.ensureTenantSchema();await(await import('../src/lib/saas/creation-schema')).ensureCreationSchema();for(const actor of [email,other])await db.getOrCreateUser(actor,actor);
  await db.adjustUserCredits(email,100000,'fixture only',{id:randomUUID(),actor:'fixture'});
  const platform={email:'fixture-platform',admin:true},a=await tenants.createTenant(platform,{commandId:randomUUID(),name:'Profile A fixture',ownerEmail:email,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:true}}),b=await tenants.createTenant(platform,{commandId:randomUUID(),name:'Profile B fixture',ownerEmail:other,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:true}});
  const scope=(tenant=a.tenantId)=>({actorEmail:email,scopeKind:'tenant' as const,tenantId:tenant,workspaceExplicit:true});
  const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#9aa8bb'}}).png().toBuffer(),sha=createHash('sha256').update(png).digest('hex');
  const url=await storage.uploadImage(png,'image/png','profile-fixture/input.png',undefined,email);await db.addArtworks(email,[{id:'profile-source',title:'fixture',category:'main',prompt:'fixture',status:'completed',image:url,gradient:''}]);
  await ctx.withFrozenCreation(scope(),async()=>{await ctx.bindCreationMedia(email,url);const id=await writer.startCreation('fixture-source','profile-input',email);await writer.finishCreation(id!,email,'succeeded',{artworkIds:['profile-source']});});
  const {getBillingRuntime}=await import('../src/lib/billing/server'),billing=await getBillingRuntime(),initial=await billing.config.current(),price=structuredClone(initial.config);price.switches.metering='off';await billing.config.publish({id:randomUUID(),expectedVersion:initial.version,config:price,actor:'fixture',reason:'Explicit zero-charge integration'});
  const parent=await ctx.withFrozenCreation(scope(),()=>writer.startCreation('fixture-parent','profile-family-run',email)),tasks:string[]=[],inputs:any[]=[];
  for(const[index,item]of samples.entries()){
   const mode=item.definition.modes[0],reference=(item.definition.limits.images||0)>0?[{id:'input',kind:'image',role:mode==='single_image'?'first_frame':'reference',artworkId:'profile-source',url}]:[];
   const input={modelId:'video-'+index,prompt:'Frozen original '+index,mode,durationSeconds:item.definition.defaultDurationSeconds,resolution:item.definition.defaultResolution,aspectRatio:item.definition.defaultAspectRatio,references:reference,idempotencyKey:randomUUID()};inputs.push(input);
   const result=await ctx.withFrozenCreation({...scope(),creationId:parent!},()=>video.createVideoGeneration(email,input as any));tasks.push(result.taskId);
   const saved=(await db.getVideoTask(email,result.taskId))!;assert(saved.upstreamId,JSON.stringify(saved));assert.equal(ctx.frozenCreationScope(saved.parameters.creationScope,email)?.tenantId,a.tenantId);assert.equal((saved.parameters.modelExecutions as ExecutionBundle).video?.video?.profile,item.profile);assert.equal((saved.parameters.request as VideoGenerationRequest).modelId,item.model);assert(!JSON.stringify(saved.parameters.request).includes('/video-reference-media/'));
  }
  assert.equal((await pool.query("SELECT decoder_version FROM app_video_media_probes WHERE storage_key='profile-fixture/input.png' AND sha256=$1",[sha])).rows[0].decoder_version,1);
  assert.equal(calls.length,6);const imageCall=calls.find(call=>JSON.stringify(call.body).includes('/video-reference-media/'))!;assert(imageCall);
  const materialURL=JSON.stringify(imageCall.body).match(/https:\/\/media\.fixture\.invalid\/video-reference-media\/[^"\s]+/)![0],token=new URL(materialURL).pathname.split('/').at(-1)!;
  const mediaRoute=await import('../src/app/video-reference-media/[token]/route'),tokenContract=await import('../src/lib/video/reference-media-token');assert.equal(tokenContract.verifyVideoReferenceToken(token)?.sha256,sha);
  const mediaHandler=(request:Request,value:string)=>mediaRoute.GET(request,{params:Promise.resolve({token:value})});
  const mediaResponse=await mediaHandler(new Request(materialURL),token);assert.equal(mediaResponse.status,200);assert.equal(createHash('sha256').update(Buffer.from(await mediaResponse.arrayBuffer())).digest('hex'),sha);
  const refIndex=inputs.findIndex(input=>input.references.length);await assert.rejects(ctx.withFrozenCreation(scope(b.tenantId),()=>video.createVideoGeneration(email,{...inputs[refIndex],idempotencyKey:randomUUID()})),/其他企业/);assert.equal(calls.length,6);
  const unknownTasks:string[]=[];for(const index of [0,5]){const unknown=await ctx.withFrozenCreation({...scope(),creationId:parent!},()=>video.createVideoGeneration(email,{...inputs[index],prompt:'UNKNOWN_ACCEPTANCE '+index,idempotencyKey:randomUUID()}));unknownTasks.push(unknown.taskId);assert.equal((await db.getVideoTask(email,unknown.taskId))!.status,'needs_attention');}assert.equal(calls.length,8);
  const admin=await(await import('../src/lib/model-config/server')).getModelAdministration(),draft=await admin.repo.draft('profile-change'),changed=structuredClone((await admin.repo.current()).config);for(const provider of changed.providers)if(provider.id.startsWith('profile-')){provider.baseUrl=fixture.origin+'/changed-'+provider.id;provider.credentialRef=(await fixture.credentials.importPlain({providerId:provider.id,plain:'fixture-rotated-'+provider.id,actor:'fixture'})).id;}for(const model of changed.publicModels)if(model.id.startsWith('video-'))model.label='Current changed label';
  const savedDraft=await admin.repo.saveDraft({id:draft.id,expectedRevision:draft.revision,config:changed,actor:'profile-change'});await admin.runtime.publish({id:randomUUID(),draftId:savedDraft.id,expectedRevision:savedDraft.revision,expectedVersion:(await admin.repo.current()).version,actor:'profile-change',reason:'Verify frozen restoration'});
  await pool.query('UPDATE app_account_teams SET enabled=false WHERE id=$1',[a.tenantId]);
  assert.equal((await mediaHandler(new Request(materialURL,{headers:{range:'bytes=0-7'}}),token)).status,206,'Accepted supplier capability survives later tenant pause');
  for(const id of tasks){await pool.query('UPDATE app_video_tasks SET next_poll_at=now() WHERE id=$1',[id]);await ctx.withFrozenCreation(scope(b.tenantId),()=>video.pollAndSettle(email,id));}
  assert(polls.length>=6);assert(polls.every(call=>!call.path.includes('changed-')&&call.authorization?.startsWith('Bearer fixture-key-')));assert.equal(calls.length,8);for(const id of unknownTasks)await video.pollAndSettle(email,id);assert.equal(calls.length,8,'Unknown new-profile acceptance is never resubmitted');
  complete=true;
  for(const id of tasks){await pool.query('UPDATE app_video_tasks SET next_poll_at=now() WHERE id=$1',[id]);await video.pollAndSettle(email,id);const task=(await db.getVideoTask(email,id))!;assert.equal(task.status,'completed',JSON.stringify(task));assert.equal(ctx.frozenCreationScope(task.parameters.creationScope,email)?.tenantId,a.tenantId);assert.equal((task.parameters.resultAssets as any[])[0].sha256,createHash('sha256').update(resultBytes).digest('hex'));}
  assert.equal(mediaInspections,6);const children=(await pool.query('SELECT status,tenant_id,payer_account_id FROM app_creation_records WHERE parent_id=$1',[parent])).rows;assert.equal(children.length,8);assert(children.filter(row=>row.status==='succeeded').length===6);assert.equal(children.filter(row=>row.status==='needs_review').length,2);assert(children.every(row=>row.tenant_id===a.tenantId&&row.payer_account_id===email));
  await storage.writeStoredObject(Buffer.alloc(png.length,1),'image/png','profile-fixture/input.png');assert.equal((await mediaHandler(new Request(materialURL),token)).status,503,'Same-length changed original hash must not be served');await storage.writeStoredObject(png,'image/png','profile-fixture/input.png');
  await pool.query("UPDATE app_media_assets SET owner=$1 WHERE key='profile-fixture/input.png'",[other]);assert.equal((await mediaHandler(new Request(materialURL),token)).status,404);
  console.log('SAAS_VIDEO_PROFILE_INTEGRATION=PASS profiles=6 real_pg=true real_app_accept_poll_complete=true frozen_config_scope_payer=true original_native_image_hash=true supplier_reference_capability=true same_actor_cross_tenant_denied=true synthetic_video_and_media_transport=true linux_sandbox_proven=false real_supplier_calls=0');
 }finally{await pool.end();await fixture.cleanup();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;setTimeout(()=>process.exit(1),100).unref();});
