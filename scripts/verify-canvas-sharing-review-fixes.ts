// Real-login regression probes preserved from the independent sharing review.
const expectFixed=process.env.CANVAS_SHARE_EXPECT_FIXED==='1';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {getPool,addArtworks,listArtworksByIds,getProjectNames,listCanvasTextNodes} from '../src/lib/db';
import {closeDatabasePools} from '../src/lib/db/connection';
import {hashPassword} from '../src/lib/pw';
import {ensureEnterpriseSchema} from '../src/lib/enterprise/server';
import {withCollaborationScope} from '../src/lib/enterprise/collaboration-access';
import {ensureCanvasSharingSchema} from '../src/lib/canvas-sharing/schema';
import {changeShare,getSharePreview} from '../src/lib/canvas-sharing/application';
import {prepareApprovalTx,changeShareTx} from '../src/lib/canvas-sharing/service';
import {prepareMediaStaging,copyStagedMedia,cleanupStagedMedia} from '../src/lib/canvas-sharing/media';
import {saveVideoNode} from '../src/lib/canvas/video-node-service';
import {getVideoNode} from '../src/lib/canvas/video-node-repository';
import {saveSceneNode} from '../src/lib/canvas/scene-node-service';
import {newSceneProject} from '../src/lib/scene/project';
import {saveTimelineNode} from '../src/lib/canvas/timeline-node-service';
import {newTimelineProject} from '../src/lib/timeline/project';
import {validateTimelineProject} from '../src/lib/canvas/timeline-project-validation';
import {normalizeVideoInput,resolveVideoCapability} from '../src/lib/video/contract';
import {writeStoredObject,readManagedObject,managedObjectExists,deleteImageByUrl} from '../src/lib/storage';
import {registerMediaAsset,canReadMedia} from '../src/lib/media-assets';
import {attachCanvasImageVersions,listCanvasImageVersions} from '../src/lib/canvas/image-version-store';
import * as login from '../src/app/api/auth/login/route';
import * as shares from '../src/app/api/collaboration/shares/route';
import * as share from '../src/app/api/collaboration/shares/[id]/route';
import * as preview from '../src/app/api/collaboration/shares/[id]/preview/route';
import * as texts from '../src/app/api/canvas/text-nodes/route';
import {actualProjects} from './verify-canvas-sharing-review-projects';

const pool=getPool(), enterprise=randomUUID(), foreign=randomUUID();
const boss='boss@review.invalid',otherBoss='otherboss@review.invalid',author='author@review.invalid',recipient='recipient@review.invalid',third='third@review.invalid',outside='outside@review.invalid';
const origin='http://review.local',cookies=new Map<string,string>(),evidence:any[]=[],httpTrace:any[]=[];
let checks=0,failures=0,outbound=0;
globalThis.fetch=async()=>{outbound++;throw Error('OUTBOUND_DISABLED');};
const log=(name:string,data:unknown)=>{evidence.push({name,data});console.log(`${name} ${JSON.stringify(data)}`);};
async function test(name:string,run:()=>Promise<void>){try{await run();checks++;console.log(`PASS ${name}`);}catch(e){failures++;console.error(`FAIL ${name} ${e instanceof Error?e.stack:String(e)}`);}}
const request=(url:string,actor:string,body?:unknown)=>new Request(origin+url,{method:body===undefined?'GET':'POST',headers:{cookie:cookies.get(actor)||'',origin,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function http(route:any,actor:string,body?:unknown,id?:string){const url=`/api/collaboration/shares${id?'/'+id:''}?enterpriseId=${enterprise}`;const r=await route[body===undefined?'GET':'POST'](request(url,actor,body),{params:Promise.resolve({id})});const text=await r.text();httpTrace.push({url,method:body===undefined?'GET':'POST',actor,input:body??null,status:r.status,literal:text});return {status:r.status,body:JSON.parse(text),literal:text};}
const source=(key:string,ids?:string[],kind='workflow')=>({projectKey:key,kind,...(ids?{nodeIds:ids}:{})});
const operation=(src:any)=>({action:'approve',operationId:randomUUID(),expectedVersion:1,source:src});
async function requested(){const r=await http(shares,recipient,{action:'request',operationId:randomUUID(),authorId:author});assert.equal(r.status,200,r.literal);return r.body.share;}
async function approved(src:any){const s=await requested(),op=operation(src),r=await http(share,author,op,s.id);if(r.status===200){assert.equal(r.body.share.resultProjectKey,null);const received=await http(share,recipient,undefined,s.id);assert.equal(received.status,200,received.literal);r.body=received.body;}return {s,op,...r};}
async function project(key:string,tenant=enterprise){await pool.query('INSERT INTO app_canvas_video_projects(email,project_key) VALUES($1,$2) ON CONFLICT DO NOTHING',[author,key]);await pool.query("INSERT INTO app_creation_contexts(actor_email,context_kind,context_id,scope_kind,tenant_id) VALUES($1,'project',$2,'tenant',$3) ON CONFLICT DO NOTHING",[author,key,tenant]);}
async function artwork(id:string,key:string,opts:any={}){await addArtworks(opts.owner||author,[{id,title:id,category:'image',prompt:opts.prompt||'AUTHOR_PRIVATE_PROMPT',status:'completed',image:'/media/review/source.png',gradient:'',origin:'canvas',groupId:key.slice(5),width:16,height:12,...opts}]);}
async function textNode(id:string,key:string,refs:string[]=[],content='NATIVE_EDITABLE_CONTENT'){const r=await texts.POST(request('/api/canvas/text-nodes',author,{id,projectKey:key,title:id,content,prompt:'AUTHOR_PRIVATE_TEXT',canvasX:10,canvasY:20,width:300,height:180,sourceIds:refs,status:'completed'}));assert.equal(r.status,200,await r.clone().text());return r.json();}
async function copyMap(id:string){return (await pool.query('SELECT * FROM app_canvas_share_copies WHERE share_id=$1',[id])).rows[0];}
async function shareState(id:string){return (await pool.query('SELECT status,version FROM app_canvas_shares WHERE id=$1',[id])).rows[0];}
async function setup(){
  assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');await ensureEnterpriseSchema();await ensureCanvasSharingSchema();
  const pw='Review-only-'+randomUUID(),hash=hashPassword(pw);
  for(const email of [boss,otherBoss,author,recipient,third,outside])await pool.query("INSERT INTO app_users(email,name,renews_at,role,password_hash) VALUES($1,$2,now()+interval '1 year','user',$3)",[email,email.split('@')[0],hash]);
  for(const [id,owner]of [[enterprise,boss],[foreign,otherBoss]]){await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'Local review',$2,now()+interval '1 year')",[id,owner]);await pool.query('INSERT INTO app_enterprise_settings(team_id) VALUES($1)',[id]);await pool.query("INSERT INTO app_team_access_grants(email,scope,created_by,updated_by) VALUES($1,'owned','review','review')",[owner]);}
  for(const email of [author,recipient,third])await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[enterprise,email,boss]);
  await pool.query("INSERT INTO app_enterprise_members(enterprise_id,email,supervisor_email,employment) VALUES($1,$2,$3,'permanent')",[foreign,outside,otherBoss]);
  for(const actor of [author,recipient,third,outside]){const r=await login.POST(request('/api/auth/login',actor,{email:actor,password:pw}));assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).ok,true);cookies.set(actor,r.headers.get('set-cookie')!.split(';')[0]);}
  const png=await sharp({create:{width:16,height:12,channels:4,background:'#bfdfed'}}).png().toBuffer();await writeStoredObject(png,'image/png','review/source.png');await registerMediaAsset('review/source.png',png,'image/png',false,author,false);
  await project('tree:normal');await artwork('normal-image','tree:normal');await textNode('normal-text','tree:normal',['normal-image']);
  log('AUTH_BASELINE',{native_password_login:4,ordinary_employee_roles:true,real_enterprise_scope:true,authorCurrentEnterpriseA:true,historicalProjectTenantB:true,recipientOnlyEnterpriseA:true});
}
async function main(){
 await setup();
 let normal:any;
 await test('ordinary-employees-and-client-project-control',async()=>{
   normal=await approved(source('tree:normal'));assert.equal(normal.status,200,normal.literal);const map=(await copyMap(normal.s.id)).id_map,arts=await listArtworksByIds(recipient,[map['normal-image']]),nodes=(await listCanvasTextNodes(recipient)).filter(n=>n.projectKey===normal.body.share.resultProjectKey);
   const projects=actualProjects(arts,await getProjectNames(recipient),nodes).projects;assert.ok(projects.some(p=>p.key===normal.body.share.resultProjectKey));assert.equal(arts[0].prompt,'AUTHOR_PRIVATE_PROMPT');assert.equal(await canReadMedia(arts[0].image.slice(7),recipient),true);assert.equal(await canReadMedia(arts[0].image.slice(7),author),false);
   assert.equal((await http(share,third,undefined,normal.s.id)).status,404);assert.equal((await http(share,outside,undefined,normal.s.id)).status,403);
   log('HEALTHY_NATIVE_COPY',{approval:200,canvasClientProjectFound:true,nodeCount:arts.length+nodes.length,recipientMedia:true,authorTargetMedia:false,third:404,outside:403});
 });
 await test('tenant-project-alias-and-batch-evidence-counterexample',async()=>{
   await project('tree:tenant-b',foreign);await artwork('foreign-art','tree:tenant-b',{prompt:'TENANT_B_ONLY_PROMPT'});
   const canonical=await approved(source('tree:tenant-b',['foreign-art'],'artwork'));assert.equal(canonical.status,403);assert.equal(canonical.body.code,'SHARE_TENANT_MISMATCH');
   const aliasInput=source('tree:foreign-art',['foreign-art'],'artwork'),alias=await approved(aliasInput);assert.equal(alias.status,expectFixed?403:200,alias.literal);
   let copiedPrompt:string|null=null;if(!expectFixed){const m=(await copyMap(alias.s.id)).id_map;copiedPrompt=(await listArtworksByIds(recipient,[m['foreign-art']]))[0].prompt;assert.equal(copiedPrompt,'TENANT_B_ONLY_PROMPT');}else{assert.equal(alias.body.code,'SHARE_TENANT_MISMATCH');assert.equal(await copyMap(alias.s.id),undefined);}
   await project('batch:suite-tenant-b',foreign);await artwork('foreign-batch-art','tree:foreign-batch-art',{batchId:'suite-tenant-b',prompt:'TENANT_B_BATCH_PROMPT'});await textNode('batch-ref-text','tree:normal',['foreign-batch-art']);
   const dep=await approved(source('tree:normal',['batch-ref-text']));assert.equal(dep.status,expectFixed?403:200,dep.literal);if(expectFixed){assert.equal(dep.body.code,'SHARE_TENANT_MISMATCH');assert.equal(await copyMap(dep.s.id),undefined);}else{const dm=(await copyMap(dep.s.id)).id_map;assert.equal((await listArtworksByIds(recipient,[dm['foreign-batch-art']]))[0].prompt,'TENANT_B_BATCH_PROMPT');}
   log('F1_TENANT_BOUNDARY',{canonicalStatus:canonical.status,aliasStatus:alias.status,batchDependencyStatus:dep.status,copiedPrompt});
   const creation=randomUUID();await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,tenant_id,source_kind,source_id) VALUES($1,$2,'tenant',$3,'review-output',$1)",[creation,author,foreign]);await pool.query("INSERT INTO app_creation_links(creation_id,actor_email,target_type,target_id,relation) VALUES($1,$2,'artwork','foreign-art','output')",[creation,author]);const immutable=await approved(aliasInput);assert.equal(immutable.status,403);log('IMMUTABLE_OUTPUT_CONTROL',{status:immutable.status,code:immutable.body.code});
 });
 await test('legitimate-provider-parameter-secret-false-positive',async()=>{
   await project('tree:parameters');const cap=resolveVideoCapability({manual:{modes:['text'],durationResolutionMap:[{durations:[4],resolutions:['720p']}],aspectRatios:['16:9'],audio:'disabled',providerOptions:{max_tokens:{type:'integer',minimum:1,maximum:8192}}}});
   const normalized=normalizeVideoInput({prompt:'a quiet landscape',mode:'text',durationSeconds:4,resolution:'720p',references:[],providerOptions:{max_tokens:1024}},cap);assert.equal(normalized.providerOptions!.max_tokens,1024);
   const native=await saveVideoNode(author,{id:'parameter-video',projectKey:'tree:parameters',operationId:randomUUID(),expectedRevision:0,config:{prompt:'a quiet landscape',providerOptions:{max_tokens:1024}},inputs:[]});assert.equal(native.config.providerOptions!.max_tokens,1024);
   const bad=await approved(source('tree:parameters'));assert.equal(bad.status,expectFixed?200:422,bad.literal);if(!expectFixed)assert.equal(bad.body.code,'SHARE_UNSUPPORTED_AUTHORITY');else{const map=(await copyMap(bad.s.id)).id_map;assert.equal((await getVideoNode(recipient,map[native.id]))!.config.providerOptions!.max_tokens,1024);}
   log('F2_PARAMETER_REJECTED',{input:{providerOptions:{max_tokens:1024}},nativeCapabilityAccepted:true,nativeSavedRevision:native.revision,approvalStatus:bad.status,literal:bad.literal,shareStatus:(await shareState(bad.s.id)).status});
   await saveVideoNode(author,{id:native.id,expectedRevision:native.revision,operationId:randomUUID(),config:{prompt:'a quiet landscape',providerOptions:{quality:'high'}}});const good=await approved(source('tree:parameters'));assert.equal(good.status,200);log('PARAMETER_CONTROL',{qualityHighApproval:good.status});
 });
 await test('canonical-own-alias-and-legacy-foreign-ancestry',async()=>{
   const own=await approved(source('tree:normal-image',['normal-image'],'artwork'));assert.equal(own.status,200,own.literal);
   await artwork('legacy-foreign-child','tree:legacy-foreign-child');
   await pool.query("UPDATE app_artworks SET group_id=NULL,parent_id='foreign-art' WHERE email=$1 AND id='legacy-foreign-child'",[author]);
   const other=await approved(source('tree:legacy-foreign-child',['legacy-foreign-child'],'artwork'));assert.equal(other.status,expectFixed?403:200,other.literal);
   if(expectFixed)assert.equal(other.body.code,'SHARE_TENANT_MISMATCH');
   log('CANONICAL_ANCESTRY_CONTROL',{ownAlias:own.status,legacyForeignRoot:other.status});
 });
 await test('real-credentials-remain-rejected',async()=>{
   const credentialOptions=[{accessToken:'fixture-secret'},{APIKey:'fixture-secret'},{clientSecret:'fixture-secret'},{nested:{authorization:'Bearer fixture-secret'}},{jobId:'existing-task'}];
   for(const providerOptions of credentialOptions){const prior=(await getVideoNode(author,'parameter-video'))!;
     await saveVideoNode(author,{id:prior.id,expectedRevision:prior.revision,operationId:randomUUID(),config:{prompt:'test parameter',providerOptions}});
     const denied=await approved(source('tree:parameters'));assert.equal(denied.status,422,denied.literal);assert.equal(denied.body.code,'SHARE_UNSUPPORTED_AUTHORITY');assert.equal(await copyMap(denied.s.id),undefined);
   }
   log('CREDENTIAL_CONTROL',{denied:credentialOptions.length,copies:0});
 });
 await test('timeline-provenance-is-not-a-live-media-dependency',async()=>{
   await project('tree:timeline');await artwork('timeline-image','tree:timeline');const scene=newSceneProject();scene.states[0].referenceArtworkIds=['timeline-image'];scene.states[0].background={artworkId:'timeline-image',projection:'image'};const generator=await saveSceneNode(author,{id:'deleted-origin',projectKey:'tree:timeline',operationId:randomUUID(),expectedRevision:0,scene});
   const timeline=newTimelineProject();timeline.tracks[0].clips.push({id:'clip-1',artworkId:'timeline-image',canvasSourceId:generator.id,position:0,inPoint:0,duration:1,gain:1,fadeIn:0,fadeOut:0,audioEnabled:true,transitionIn:0});
   const native=await saveTimelineNode(author,{id:'timeline-live',projectKey:'tree:timeline',operationId:randomUUID(),expectedRevision:0,timeline});await saveSceneNode(author,{id:generator.id,operationId:randomUUID(),expectedRevision:generator.revision,deleted:true});
   const materials=await validateTimelineProject(author,timeline);assert.equal(materials.length,1);const r=await approved(source('tree:timeline',['timeline-live']));assert.equal(r.status,expectFixed?200:422,r.literal);if(!expectFixed)assert.equal(r.body.code,'SHARE_DEPENDENCY_UNAVAILABLE');else{const map=(await copyMap(r.s.id)).id_map;const saved=(await pool.query('SELECT timeline FROM app_canvas_timeline_nodes WHERE email=$1 AND id=$2',[recipient,map[native.id]])).rows[0].timeline;assert.equal(saved.tracks[0].clips[0].canvasSourceId,undefined);assert.ok(saved.tracks[0].clips[0].artworkId!==timeline.tracks[0].clips[0].artworkId);}
   log('F3_STALE_PROVENANCE',{input:timeline.tracks[0].clips[0],nativeSaveRevision:native.revision,sourceSceneDeleted:true,materialValid:true,approvalStatus:r.status,literal:r.literal});
   delete timeline.tracks[0].clips[0].canvasSourceId;await saveTimelineNode(author,{id:native.id,operationId:randomUUID(),expectedRevision:native.revision,timeline});const good=await approved(source('tree:timeline',['timeline-live']));assert.equal(good.status,200);log('TIMELINE_CONTROL',{sameMediaWithoutProvenanceApproval:good.status});
 });
 await test('native-hidden-version-single-artwork-client-reachability',async()=>{
   await project('tree:versions');await artwork('version-target','tree:versions');await artwork('version-output','tree:versions',{prompt:'VERSION_PROMPT'});
   await attachCanvasImageVersions(author,{operationId:randomUUID(),canvasTarget:{nodeId:'version-target',expectedImage:'/media/review/source.png',expectedRevision:0}} as any,['version-output']);
   const input=source('tree:versions',['version-output'],'artwork'),r=await approved(input);assert.equal(r.status,200,r.literal);const m=(await copyMap(r.s.id)).id_map,art=(await listArtworksByIds(recipient,[m['version-output']]))[0];assert.equal(art.source==='canvas-node-version',!expectFixed);const p=actualProjects([art],await getProjectNames(recipient)).projects;assert.equal(p.some(v=>v.key===r.body.share.resultProjectKey),expectFixed);
   log('F4_HIDDEN_ONLY_COPY',{input,approvalStatus:r.status,shareStatus:r.body.share.status,resultProjectKey:r.body.share.resultProjectKey,copiedSource:art.source,nativeArtworkCount:1,actualCanvasClientProjectCount:p.length});
   const parent=await approved(source('tree:versions',['version-target'],'artwork'));assert.equal(parent.status,200);const pm=(await copyMap(parent.s.id)).id_map,pa=(await listArtworksByIds(recipient,[pm['version-target']]))[0],hist=await listCanvasImageVersions(recipient,pa.id);assert.equal(hist.versions.length,2);assert.ok(actualProjects([pa],await getProjectNames(recipient)).projects.some(v=>v.key===parent.body.share.resultProjectKey));log('VERSION_PARENT_CONTROL',{approval:200,versions:hist.versions.length,projectFound:true});
 });
 await test('real-counterparty-policy-current-membership-observation',async()=>{
   await pool.query("INSERT INTO app_feature_access(email,mode,allowed,version) VALUES($1,'custom','[\"canvas\",\"works\"]',1) ON CONFLICT(email) DO UPDATE SET mode='custom',allowed=EXCLUDED.allowed,version=1",[recipient]);
   const set=await withCollaborationScope(author,enterprise,async(_tx,s)=>[...s.memberIds]);assert.ok(set.includes(recipient));const s=(await http(shares,author,{action:'offer',operationId:randomUUID(),requesterId:recipient,source:source('tree:normal',['normal-image'],'artwork')}));assert.equal(s.status,200);const read=await http(share,recipient,undefined,s.body.share.id);assert.equal(read.status,403);
   log('POLICY_OBSERVATION',{recipientTeamPolicy:false,inAuthorScopeMemberIds:true,offerStatus:s.status,recipientRead:read.status,literal:read.literal,classification:'not reported as defect: policy gates acting account, not membership'});
   await pool.query('DELETE FROM app_feature_access WHERE email=$1',[recipient]);
   const req=await requested();await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2",[enterprise,recipient]);const denial=await http(share,author,operation(source('tree:normal',['normal-image'],'artwork')),req.id);assert.equal(denial.status,403);await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE enterprise_id=$1 AND email=$2",[enterprise,recipient]);log('MEMBERSHIP_CONTROL',{approvalAfterSuspended:denial.status,literal:denial.literal});
 });
 await test('two-stage-mutation-and-staging-cleanup-control',async()=>{
   const s=await requested(),op=operation(source('tree:normal',['normal-text'])),prep=await withCollaborationScope(author,enterprise,(tx,sc)=>prepareApprovalTx(tx,sc,s.id,op));assert.ok('snapshot'in prep);const stage=await prepareMediaStaging(s.id,prep.snapshot);await copyStagedMedia(stage);await textNode('normal-text','tree:normal',['normal-image'],'CHANGED_DURING_STAGING');
   let code='';try{await withCollaborationScope(author,enterprise,(tx,sc)=>changeShareTx(tx,sc,s.id,op,{prepared:prep,stage}));}catch(e:any){code=e.code;}assert.equal(code,'SHARE_SOURCE_CHANGED');assert.equal(await cleanupStagedMedia(stage.attemptId),true);assert.equal(await copyMap(s.id),undefined);for(const m of stage.media)assert.equal(await managedObjectExists('/media/'+m.targetKey),false);log('SOURCE_MUTATION_CONTROL',{code,copies:0,stage:'cleaned',objectsRemaining:0});
 });
 await test('commit-ack-unknown-durable-journal-control',async()=>{
   const s=await requested(),op=operation(source('tree:normal',['normal-image'],'artwork'));const original=pool.connect.bind(pool);let injected=false;
   (pool as any).connect=function(...args:any[]){if(args.length)return original(...args as []);return original().then(client=>{let final=false;return new Proxy(client,{get(t,p){if(p==='query')return async(...q:any[])=>{const sql=typeof q[0]==='string'?q[0]:q[0]?.text||'';if(sql.includes("SET state='committed'"))final=true;const value=await (t.query as any)(...q);if(sql==='COMMIT'&&final&&!injected){injected=true;throw Error('REVIEW_LOST_COMMIT_ACK');}return value;};const v=(t as any)[p];return typeof v==='function'?v.bind(t):v;}});});};
   let error='';try{await changeShare(author,enterprise,s.id,op);}catch(e:any){error=e.message;}finally{(pool as any).connect=original;}
   assert.equal(error,'REVIEW_LOST_COMMIT_ACK');const copy=await copyMap(s.id);assert.ok(copy);const stage=(await pool.query("SELECT * FROM app_canvas_share_media_staging WHERE share_id=$1 AND state='committed'",[s.id])).rows[0];assert.ok(stage);for(const key of stage.keys)assert.equal(await managedObjectExists('/media/'+key),true);const replay=await http(share,author,op,s.id);assert.equal(replay.status,200);assert.equal(Number((await pool.query('SELECT count(*) n FROM app_canvas_share_copies WHERE share_id=$1',[s.id])).rows[0].n),1);log('COMMIT_UNKNOWN_CONTROL',{injectedAfterRealCommit:true,error,replayStatus:replay.status,copies:1,stage:stage.state,bytesPreserved:true});
 });
 await test('concurrent-approval-and-source-byte-change-controls',async()=>{
   const s=await requested(),src=source('tree:normal',['normal-image'],'artwork');const result=await Promise.all([http(share,author,operation(src),s.id),http(share,author,operation(src),s.id)]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal(Number((await pool.query('SELECT count(*) n FROM app_canvas_share_copies WHERE share_id=$1',[s.id])).rows[0].n),1);log('APPROVAL_CONCURRENCY_CONTROL',{statuses:result.map(r=>r.status).sort(),copies:1});
   const offer=await http(shares,author,{action:'offer',operationId:randomUUID(),requesterId:recipient,source:src});assert.equal(offer.status,200);const original=(await readManagedObject('/media/review/source.png')).bytes,changed=await sharp({create:{width:17,height:12,channels:4,background:'#eab9ce'}}).png().toBuffer();await writeStoredObject(changed,'image/png','review/source.png');
   let code='';try{await getSharePreview(recipient,enterprise,offer.body.share.id);}catch(e:any){code=e.code;}assert.equal(code,'SHARE_PREVIEW_CHANGED');await writeStoredObject(original,'image/png','review/source.png');log('PREVIEW_HASH_CONTROL',{sourceBytesChanged:true,code});
 });
 await test('recipient-independence-and-foreign-media-denial',async()=>{
   const bytes=await sharp({create:{width:12,height:12,channels:4,background:'#aabbcc'}}).png().toBuffer();await writeStoredObject(bytes,'image/png','review/third.png');await registerMediaAsset('review/third.png',bytes,'image/png',false,third,false);await artwork('foreign-media-ref','tree:normal',{image:'/media/review/third.png'});const denied=await approved(source('tree:normal',['foreign-media-ref'],'artwork'));assert.equal(denied.status,403);assert.equal(denied.body.code,'SHARE_MEDIA_FORBIDDEN');assert.equal(await copyMap(denied.s.id),undefined);log('FOREIGN_MEDIA_CONTROL',{approval:denied.status,literal:denied.literal,copies:0});
   const s=await approved(source('tree:normal',['normal-image'],'artwork'));assert.equal(s.status,200);const m=(await copyMap(s.s.id)).id_map,art=(await listArtworksByIds(recipient,[m['normal-image']]))[0];const before=createHash('sha256').update((await readManagedObject(art.image)).bytes).digest('hex');
   await deleteImageByUrl('/media/review/source.png');assert.equal(createHash('sha256').update((await readManagedObject(art.image)).bytes).digest('hex'),before);assert.equal((await sharp(await getSharePreview(recipient,enterprise,s.s.id)).metadata()).format,'png');
   const bad=await approved(source('tree:normal',['normal-image'],'artwork'));assert.equal(bad.status,503);assert.equal(await copyMap(bad.s.id),undefined);const leftovers=(await pool.query("SELECT state FROM app_canvas_share_media_staging WHERE share_id=$1",[bad.s.id])).rows;assert.deepEqual(leftovers.map(v=>v.state),['cleaned']);log('SOURCE_DELETE_CONTROL',{committedTargetHashUnchanged:true,approvedPreview:'png',laterApprovalStatus:bad.status,laterCopies:0,stage:'cleaned'});
 });
 assert.equal(outbound,0);const stages=(await pool.query('SELECT state,count(*)::int AS n FROM app_canvas_share_media_staging GROUP BY state ORDER BY state')).rows;assert.ok(stages.every(s=>['committed','cleaned'].includes(s.state)));
 const ledger=Number((await pool.query('SELECT count(*) n FROM app_ledger')).rows[0].n);assert.equal(ledger,0);log('FINAL_RESOURCE_CONTROL',{stages,ledgerRows:ledger,outbound,poolWaiting:pool.waitingCount,poolTotal:pool.totalCount,poolIdle:pool.idleCount});
 console.log(`CANVAS_SHARING_REVIEW_FIXES phase=${expectFixed?"MODIFIED":"BASELINE"} checks=${checks} failures=${failures} findings=4 real_scope=1 real_login=1 supplier_calls=${outbound}`);if(failures)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await writeFile(path.join(process.env.REVIEW_OUTPUT!,'OBSERVATIONS.json'),JSON.stringify(evidence,null,2));await writeFile(path.join(process.env.REVIEW_OUTPUT!,'HTTP_TRACE.json'),JSON.stringify(httpTrace,null,2));await closeDatabasePools();console.log('DATABASE_POOLS=CLOSED');});

