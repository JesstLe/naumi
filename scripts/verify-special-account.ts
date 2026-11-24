import sharp from "sharp";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createModelFixture} from "./model-config-fixture";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

/** Real owners + isolated PG + loopback supplier. No production identity/key. */
async function main(){
 const calls:{path:string;body:any}[]=[];
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:"#ffffff"}}).png().toBuffer();
 process.env.SETTINGS_SECRET="special-account-fixture-secret-01234567890123456789";
 process.env.NAUMI_MULTI_USER="1";
 const media=await mkdtemp(join(tmpdir(),"naumi-special-account-"));
 await writeFile(join(media,"fixture.png"),png);
 Object.assign(process.env,{STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:media});
 const f=await createModelFixture(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(c);
  calls.push({path:req.url||"",body:JSON.parse(Buffer.concat(chunks).toString())});
  if(String(calls.at(-1)?.body.prompt).includes("UNKNOWN_PRIVATE_FIXTURE")){res.destroy();return;}
  res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({data:[{b64_json:png.toString("base64")}]}));
 });
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 process.env.MODEL_CONFIG_TRUSTED_ORIGINS=f.origin;
 const {preparePrivateImageChannel}=await import("../src/lib/model-config/private-image-channel");
 const source=structuredClone({provider:f.config.providers[0],upstream:f.config.upstreamModels[0]});
 source.provider.enabled=false;source.upstream.model="wire-private-image";source.upstream.capabilities.verified=false;
 const privateKey=await f.credentials.importPlain({providerId:"private-images",plain:"local-private-key",actor:"fixture"});
 const draft=preparePrivateImageChannel(f.config,source,{providerId:"private-images",upstreamId:"private-wire",modelId:"private-image",credentialRef:privateKey.id});
 assert.equal(draft.config.upstreamModels.at(-1)!.capabilities.verified,false);
 assert.deepEqual(f.config.publicModels.map(m=>m.id),["image-a"]);
 assert.throws(()=>preparePrivateImageChannel(draft.config,source,{providerId:"private-images",upstreamId:"private-wire",modelId:"private-image",credentialRef:privateKey.id}));
 Object.assign(f.config,draft.config);
 const snapshot=await f.repo.current();
 const {getPool,closeDatabasePools}=await import("../src/platform/db/pool");
 const pool=getPool();
 const management=await import("../src/lib/bi/user-management");
 const {ensureBiSchema,queryBi,biJobTrace,biConversation}=await import("../src/lib/bi/repository");
 const {ensureCreationSchema}=await import("../src/lib/saas/creation-schema");
 const {ensureTeamSchema}=await import("../src/lib/teams/schema");
 const {readAccountCreationPolicy,assertAccountCanJoinEnterprise,writeAccountCreationPolicyTx}=await import("../src/lib/accounts/creation-policy-store");
 const {readUserSnapshot,getOrCreateUser}=await import("../src/lib/accounts/session");
 let checks=3;
 const check=(condition:unknown,message:string)=>{assert.ok(condition,message);checks++;};
 const privateEmail="private-fixture@example.test",normalEmail="normal-fixture@example.test",actor="fixture-admin@example.test";
 const policy={personalOnly:true,reportVisibility:"private" as const,image:draft.grant};
 const create=management.userCommandSchema.parse({action:"create",id:randomUUID(),email:privateEmail,name:"Private fixture",password:"fixture-only-password",initialCredits:99999,creationPolicy:policy,reason:"isolated acceptance"});
 try{
  await ensureBiSchema();await ensureCreationSchema();await ensureTeamSchema();
  const outcomes=await Promise.all([management.manageBiUser(create,actor),management.manageBiUser(create,actor)]);
  check(outcomes.filter(o=>o.replayed).length===1,"concurrent retry acknowledged once");
  const user=await readUserSnapshot(privateEmail);
  check(user&&user.creditsTotal-user.creditsUsed===99999,"initial credits exactly once");
  check((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[privateEmail])).rows[0].n===1,"one initial ledger");
  check((await pool.query("SELECT role FROM app_users WHERE email=$1",[privateEmail])).rows[0].role==="user","ordinary role");
  check((await pool.query("SELECT count(*)::int n FROM app_bi_management_log WHERE email=$1",[privateEmail])).rows[0].n===1,"one real audit");
  assert.deepEqual(await readAccountCreationPolicy(privateEmail),policy);checks++;
  await assert.rejects(management.manageBiUser(management.userCommandSchema.parse({...create,id:randomUUID(),name:"Duplicate"}),actor));checks++;
  const invalidEmail="atomic-rollback@example.test";
  await assert.rejects(management.manageBiUser(management.userCommandSchema.parse({...create,id:randomUUID(),email:invalidEmail,creationPolicy:{...policy,image:{...draft.grant,upstreamId:"missing"}}}),actor),e=>(e as any).status===503);checks++;
  check((await pool.query("SELECT count(*)::int n FROM app_users WHERE email=$1",[invalidEmail])).rows[0].n===0,"invalid policy creates no account");
  check((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[invalidEmail])).rows[0].n===0,"invalid policy grants nothing");
  await assert.rejects(management.manageBiUser(management.userCommandSchema.parse({action:"creation-policy",id:randomUUID(),email:privateEmail,expectedVersion:0,policy,reason:"stale command"}),actor),/刷新/);checks++;
  const tx=await pool.connect();
  try{await tx.query("BEGIN");await assert.rejects(assertAccountCanJoinEnterprise(tx,privateEmail),e=>(e as any).status===403);checks++;await tx.query("ROLLBACK");}finally{tx.release();}
  await getOrCreateUser(normalEmail,"Normal fixture");
  const teamId=randomUUID();
  await pool.query("INSERT INTO app_account_teams(id,name,owner_email,authorized_until) VALUES($1,'fixture team',$2,now()+interval '1 year')",[teamId,normalEmail]);
  const memberTx=await pool.connect();
  try{await memberTx.query("BEGIN");await assert.rejects(writeAccountCreationPolicyTx(memberTx,normalEmail,{...policy,image:null},actor),e=>(e as any).status===409);checks++;await memberTx.query("ROLLBACK");}finally{memberTx.release();}
  check(await readAccountCreationPolicy(normalEmail)===null,"membership conflict leaves policy unchanged");
  const {mutateTeam,adminCommandSchema}=await import("../src/lib/teams/server");
  const systemActor={email:actor,admin:true,consoleAdmin:true};
  await assert.rejects(mutateTeam(systemActor,adminCommandSchema.parse({id:randomUUID(),teamId:randomUUID(),action:"create",ownerEmail:privateEmail,name:"Must not create",authorizedUntil:new Date(Date.now()+86400000).toISOString()}),true),e=>(e as any).status===403);checks++;
  await assert.rejects(mutateTeam(systemActor,adminCommandSchema.parse({id:randomUUID(),teamId,action:"attach",email:privateEmail,expiresAt:new Date(Date.now()+86400000).toISOString()}),true),e=>(e as any).status===403);checks++;
  const raceEmail="membership-race@example.test";await getOrCreateUser(raceEmail,"Race fixture");
  const policyTx=await pool.connect(),joinTx=await f.sql.connect();
  try{
   await policyTx.query("BEGIN");await joinTx.query("BEGIN");
   await writeAccountCreationPolicyTx(policyTx,raceEmail,{...policy,image:null},actor);
   const joining=assert.rejects(assertAccountCanJoinEnterprise(joinTx,raceEmail),e=>(e as any).status===403);
   await policyTx.query("COMMIT");await joining;checks++;await joinTx.query("ROLLBACK");
  }finally{policyTx.release();joinTx.release();}
  const raceMember="policy-race@example.test";await getOrCreateUser(raceMember,"Race member");
  const existingJoin=await pool.connect(),laterPolicy=await f.sql.connect();
  try{
   await existingJoin.query("BEGIN");await laterPolicy.query("BEGIN");
   await assertAccountCanJoinEnterprise(existingJoin,raceMember);
   await existingJoin.query("INSERT INTO app_account_team_members(email,team_id) VALUES($1,$2)",[raceMember,teamId]);
   const applying=assert.rejects(writeAccountCreationPolicyTx(laterPolicy,raceMember,{...policy,image:null},actor),e=>(e as any).status===409);
   await existingJoin.query("COMMIT");await applying;checks++;await laterPolicy.query("ROLLBACK");
  }finally{existingJoin.release();laterPolicy.release();}
  check(await readAccountCreationPolicy(raceMember)===null,"joining first cannot acquire incompatible personal policy");
  const rollbackEmail="late-rollback@example.test",rollbackCommand=management.userCommandSchema.parse({...create,id:randomUUID(),email:rollbackEmail});
  await pool.query("INSERT INTO app_bi_access_log(id,actor,action,target_email,section) VALUES($1,$2,'fixture-collision',$3,'management')",[rollbackCommand.id,actor,rollbackEmail]);
  await assert.rejects(management.manageBiUser(rollbackCommand,actor),e=>(e as any).code==="23505");checks++;
  check((await pool.query("SELECT count(*)::int n FROM app_users WHERE email=$1",[rollbackEmail])).rows[0].n===0,"late audit failure rolls account back");
  check((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[rollbackEmail])).rows[0].n===0&&await readAccountCreationPolicy(rollbackEmail)===null,"late failure rolls grant and policy back");

  const {withCreationRequest,creationContinuationHeader}=await import("../src/lib/saas/creation-context");
  const {currentCreationContext,withFrozenCreation}=await import("../src/lib/saas/creation-scope");
  process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE="dedicated";process.env.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID="fixture";process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=teamId;
  const request=(workspace?:string)=>new Request("http://fixture.test/api/generate-image",{method:"POST",headers:{"content-type":"application/json",...(workspace?{"x-naumi-workspace":workspace}:{})},body:JSON.stringify({prompt:"fixture"})});
  await withCreationRequest(request(),privateEmail,async()=>{const c=currentCreationContext();check(c?.scopeKind==="personal"&&c.tenantId===null,"dedicated special account is personal");assert.deepEqual(c?.accountImage,draft.grant);checks++;return new Response();});
  await assert.rejects(withCreationRequest(request(teamId),privateEmail,async()=>new Response()),e=>(e as any).status===403);checks++;
  const recordId="private-context";
  await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id) VALUES($1,$2,'personal','fixture','context')",[recordId,privateEmail]);
  const continuation=await withFrozenCreation({actorEmail:privateEmail,scopeKind:"personal",tenantId:null,creationId:recordId},async()=>creationContinuationHeader());
  await withCreationRequest(new Request("http://fixture.test/api/generate-image",{method:"POST",headers:continuation}),privateEmail,async()=>{assert.deepEqual(currentCreationContext()?.accountImage,draft.grant);checks++;return new Response();});
  delete process.env.NAUMI_ENTERPRISE_DEPLOYMENT_MODE;delete process.env.NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID;delete process.env.NAUMI_ENTERPRISE_ALLOWED_IDS;

  const {GET:modelsGET}=await import("../src/app/api/models/route");
  const {GET:configGET}=await import("../src/app/api/config/route");
  const {signUserSession}=await import("../src/lib/native-auth");
  const cookie=(email:string)=>"nv_user="+signUserSession(email,Date.now());
  const privateCatalog=await modelsGET(new Request("http://fixture.test/api/models?feature=image.generate",{headers:{cookie:cookie(privateEmail)}}));
  const pc=await privateCatalog.json();check(privateCatalog.status===200,JSON.stringify(pc));
  check(pc.models.length===1&&pc.models[0].id===draft.grant.modelId,"account catalog only private identity");
  check(privateCatalog.headers.get("cache-control")?.includes("no-store"),"account catalog not shared cache");
  for(const email of [normalEmail,""]){const response=await modelsGET(new Request("http://fixture.test/api/models?feature=image.generate",{headers:email?{cookie:cookie(email)}:{}}));const data=await response.json();check(response.status===200&&data.models.some((m:any)=>m.id==="image-a")&&!data.models.some((m:any)=>m.id===draft.grant.modelId),"ordinary/anonymous catalog unchanged");}
  const configResponse=await configGET(new Request("http://fixture.test/api/config",{headers:{cookie:cookie(privateEmail)}}));const config=await configResponse.json();
  check(configResponse.status===200&&config.defaultImageModel===draft.grant.modelId&&config.imageModels.length===1,"bootstrap config uses account model");
  check(snapshot.digest===(await f.repo.current()).digest,"catalog projection never mutates execution digest");
  const {selectFeatureModel}=await import("../src/lib/model-config/model-selection");
  assert.throws(()=>selectFeatureModel(snapshot.config,{binding:"image.generate",requestedModelId:draft.grant.modelId,requireVisible:true}),/不可用/);checks++;
  const {accountImageModel}=await import("../src/lib/model-config/account-image-policy");
  assert.throws(()=>accountImageModel(snapshot.config,draft.grant,"image-a"),e=>(e as any).status===403);checks++;
  for(const mutate of [(c:any)=>c.providers.find((p:any)=>p.id==="private-images").enabled=false,(c:any)=>c.publicModels.find((m:any)=>m.id===draft.grant.modelId).target={type:"upstream",id:"u1"},(c:any)=>c.publicModels.find((m:any)=>m.id===draft.grant.modelId).visible=true]){const c=structuredClone(snapshot.config);mutate(c);assert.throws(()=>accountImageModel(c,draft.grant),e=>(e as any).status===503);checks++;}
  const {quoteForActor}=await import("../src/lib/billing/quotation");
  const quote=await quoteForActor(privateEmail,{feature:"image.generate",quantity:1,quality:"medium",resolution:"1K",ratio:"1:1"});
  check(quote.facts.modelId===draft.grant.modelId&&quote.facts.providerId==="private-images","quote pins private provider");
  await assert.rejects(quoteForActor(privateEmail,{feature:"image.generate",quantity:1,modelId:"byok:example",quality:"medium",resolution:"1K"}),e=>(e as any).code==="USER_IMAGE_PROVIDER_DISABLED"&&calls.length===0);checks++;
  const {managedBillingSelection}=await import("../src/lib/model-config/billing-model");
  await assert.rejects(managedBillingSelection({actor:privateEmail},"image.generate",undefined,null),e=>(e as any).status===503);checks++;
  const {prepareImageOperation}=await import("../src/lib/model-config/image-preparation");
  const {getBillingRuntime}=await import("../src/lib/billing/runtime");const billing=await(await getBillingRuntime()).config.current();
  const prepared=prepareImageOperation({accountImage:draft.grant,path:"/api/generate-image",binding:"image.generate",feature:"image.generate",references:0,body:{prompt:"fixture",quality:"medium",resolution:"1K",ratio:"1:1"}},snapshot,billing);
  check(prepared.modelId===draft.grant.modelId&&prepared.modelDigest===snapshot.digest,"preparation original digest");
  const {createModelExecutor}=await import("../src/lib/model-config/execution");
  const executor=createModelExecutor({runtime:{byVersion:f.repo.byVersion,prepareExecution:async()=>{throw Error("Router forbidden");}},credentials:f.credentials,trustedOrigins:[f.origin],gateway:()=>{throw Error("gateway forbidden");}});
  const frozen=await withFrozenCreation({actorEmail:privateEmail,scopeKind:"personal",tenantId:null,accountImage:draft.grant},()=>executor.resolve({binding:"image.generate",feature:"image.generate",snapshot,billing,preparedImage:prepared}));
  check(frozen.publicModelId===draft.grant.modelId&&frozen.target.id===draft.grant.upstreamId,"frozen private upstream");
  const {client,wireModel}=await executor.clientFor(frozen);await client.images.generate({model:wireModel,prompt:"fixture",size:"1024x1024",n:1});
  check(calls.length===1&&calls[0].body.model==="wire-private-image","real SDK uses exact private wire");
  const savedPolicy=(await pool.query("SELECT policy FROM app_account_creation_policies WHERE email=$1",[privateEmail])).rows[0].policy;
  await pool.query("DELETE FROM app_account_creation_policies WHERE email=$1",[privateEmail]);
  const restored=await executor.describe(frozen);check(restored.connection.wireModel==="wire-private-image"&&calls.length===1,"frozen receipt restore not replanned/replayed after policy change");
  await pool.query("INSERT INTO app_account_creation_policies(email,policy,updated_by) VALUES($1,$2,$3)",[privateEmail,savedPolicy,actor]);

  const {createSupplierLedger}=await import("../src/lib/supplier-cost/repository");const ledger=createSupplierLedger(pool);
  await ledger.account({id:"fixture-cost-account",providerId:"private-images",protocol:"openai-images",baseUrl:f.origin});
  for(const [index,email] of [normalEmail,privateEmail].entries()){
   const id=`privacy-${index}`;
   await pool.query("INSERT INTO app_ledger(id,email,delta,kind,reason) VALUES($1,$2,-7,'consume','fixture consumption')",[id,email]);
   await pool.query("INSERT INTO app_artworks(id,email,title,category,prompt,image_url,gradient) VALUES($1,$2,'fixture','main','fixture','/media/fixture.png','')",[id,email]);
   await pool.query("INSERT INTO app_canvas_image_tasks(id,email,kind,source_artwork_id,parameters,status,cost) VALUES($1,$2,'text-edit','source','{}','needs_attention',7)",[id,email]);
   await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,reserved_credits,ledger_id) VALUES($1,$2,'image.generate','{}','fixture','manual',7,$1)",[id,email]);
   await pool.query("INSERT INTO app_creation_records(id,actor_email,scope_kind,source_kind,source_id,status) VALUES($1,$2,'personal','fixture',$1,'succeeded')",[id,email]);
   await ledger.begin({id:randomUUID(),operationId:id,attemptId:id,accountId:"fixture-cost-account",providerId:"private-images",model:"wire-private-image",userEmail:email,feature:"image.generate",phase:"image"});
  }
  const {parseBiQuery}=await import("../src/lib/bi/contracts");
  const {queryUserUsage}=await import("../src/lib/bi/usage-repository");const {parseUsageQuery}=await import("../src/lib/bi/usage-contracts");
  for(const section of ["operations","ledger","artworks","models","calls","conversations","users"]){const result=await queryBi(parseBiQuery(new URLSearchParams({section,email:privateEmail})));check(result.total===0&&result.rows.length===0,`BI ${section} private exact filter`);}
  const normalLedger=await queryBi(parseBiQuery(new URLSearchParams({section:"ledger",email:normalEmail})));check(normalLedger.total>0,"BI ordinary positive control");
  const overview=await queryBi(parseBiQuery(new URLSearchParams({section:"overview",email:privateEmail})));check(overview.overview?.consumed===0,"BI overview excludes private");
  const uq=parseUsageQuery(new URLSearchParams({email:privateEmail}));
  const usage=await queryUserUsage(uq,new AbortController().signal);check(usage.total===0&&usage.users.length===0,"usage list/total excludes private");
  const exported=await queryUserUsage(uq,new AbortController().signal,"export");check(exported.total===0&&exported.users.length===0,"usage export excludes private");
  const {adminUsageSummary,listAllUsers}=await import("../src/lib/accounts/administration");
  check(!(await listAllUsers()).some(u=>u.email===privateEmail),"legacy admin account row exposes no consumption");
  const legacyUsage=await adminUsageSummary();check(!legacyUsage.users.some(u=>u.email===privateEmail)&&legacyUsage.totals.credits===7,"legacy usage totals/rows");
  const {listLedger,listUserLedger,listUserLedgerFiltered}=await import("../src/lib/billing/legacy-ledger");
  check(!(await listLedger(100)).some(l=>l.email===privateEmail)&&(await listUserLedger(privateEmail)).length===0,"legacy admin ledger excludes private");
  check((await listUserLedgerFiltered(privateEmail)).some(l=>l.kind==="consume"),"owner still reads own real ledger");
  const {listAllArtworks,getArtworkById}=await import("../src/lib/artworks/administration");
  const artworks=await listAllArtworks();check(artworks.total===1&&artworks.artworks[0].email===normalEmail,"artwork list/count agrees");check(await getArtworkById("privacy-1")===null,"direct admin artwork denied");
  const {resolveArtworkPreview}=await import("../src/lib/bi/artwork-preview-source");await assert.rejects(resolveArtworkPreview("privacy-1","result",0,new AbortController().signal),e=>(e as any).status===404);checks++;
  const {readPendingOverview,readPendingSummary}=await import("../src/lib/billing/pending-read");const pending=await readPendingOverview(pool);
  check(pending.items.length===2&&pending.items.every(i=>i.email===normalEmail)&&pending.summary.total===2,"review pending lists/counts");check((await readPendingSummary(pool)).total===2,"review badge count");
  const review=await import("../src/lib/billing/review-read");check((await review.readBillingReviewOperations(pool)).length===1&&await review.readBillingReviewOperation(pool,"privacy-1")===undefined,"review list and detail hidden");
  const {creationFiltersSchema}=await import("../src/lib/saas/creation-contracts");const creations=await import("../src/lib/saas/creations");
  const cf=creationFiltersSchema.parse({user:privateEmail,view:"unified",period:"all"});const page=await creations.listUnifiedCreations({platform:true},cf);
  check(page.pagination.total===0&&page.items.length===0,"unified legacy/canonical keys/totals hidden");
  const {readOverviewActivity}=await import("../src/lib/saas/overview-activity");
  const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10),start=day+"T00:00:00+08:00";
  const platformActivity=await readOverviewActivity(pool,{from:day,to:day,start,end:new Date(Date.parse(start)+86400000).toISOString()});
  check(platformActivity.creations===1&&platformActivity.failed===0&&platformActivity.trend[0].count===1,"platform overview and trend exclude private personal roots");
  await assert.rejects(creations.creationDetail({platform:true},"privacy-1"),e=>(e as any).status===404);checks++;
  const legacy=await import("../src/lib/saas/legacy-creations");await assert.rejects(legacy.legacyCreationDetail(legacy.legacyCreationId({table:"app_canvas_image_tasks",id:"privacy-1",email:privateEmail})),e=>(e as any).status===404);checks++;
  await assert.rejects(biJobTrace("privacy-1",privateEmail),e=>(e as any).status===404);checks++;
  await assert.rejects(biConversation("fixture",privateEmail,"agent",1),e=>(e as any).status===404);checks++;
  const {readSupplierAdmin,readSupplierAdminChain,costsSummary}=await import("../src/lib/supplier-cost/admin");
  const costPage=await readSupplierAdmin(ledger,{},"calls",new AbortController().signal);check(!JSON.stringify(costPage).includes(privateEmail),"admin supplier calls exclude private");
  check(Number((await costsSummary(ledger,{email:privateEmail})).calls)===0&&Number((await costsSummary(ledger,{email:normalEmail})).calls)===1,"supplier report exact totals exclude private and keep ordinary");
  await assert.rejects(readSupplierAdminChain(ledger,"privacy-1",new AbortController().signal),e=>(e as any).status===404);checks++;
  check((await ledger.list({email:privateEmail})).total===1,"raw supplier owner still complete");
  check((await pool.query("SELECT count(*)::int n FROM app_ledger WHERE email=$1",[privateEmail])).rows[0].n===2,"raw grant and consumption ledger intact");
  check((await pool.query("SELECT count(*)::int n FROM app_billing_operations WHERE email=$1 AND id='privacy-1'",[privateEmail])).rows[0].n===1,"raw billing intact");
  await getOrCreateUser(actor,"Fixture admin");await pool.query("UPDATE app_users SET role='admin' WHERE email=$1",[actor]);
  const {authorizedTargetEmail}=await import("../src/lib/request-auth");
  const adminRequest=new Request("http://fixture.test/api/account",{headers:{cookie:cookie(actor)}});
  check(await authorizedTargetEmail(adminRequest,privateEmail,true)===null,"cross-account admin denied");
  check(await authorizedTargetEmail(adminRequest,normalEmail,true)===normalEmail,"ordinary cross-account admin preserved");
  check(await authorizedTargetEmail(new Request("http://fixture.test/api/account",{headers:{cookie:cookie(privateEmail)}}),privateEmail,true)===privateEmail,"private owner retains own access");
  const normalCall=(await ledger.list({email:normalEmail})).rows[0],privateCall=(await ledger.list({email:privateEmail})).rows[0];
  await ledger.enqueue('task:'+normalCall.id,'task',{callId:normalCall.id},'fixture-cost-account');
  await ledger.enqueue('task:'+privateCall.id,'task',{callId:privateCall.id},'fixture-cost-account');
  await ledger.enqueue('router:private-fixture','router',{operation:'private-router',context:{userEmail:privateEmail,operationId:'private-router'}},'fixture-cost-account');
  await pool.query("UPDATE app_supplier_cost_jobs SET state='needs-attention',last_error='fixture-cost-error'");
  const reconcile=await readSupplierAdmin(ledger,{},'reconcile',new AbortController().signal);
  check('jobs' in reconcile&&reconcile.jobs.length===1&&reconcile.jobs[0].key==='task:'+normalCall.id,"cost task/router report privacy with ordinary positive control");
  const actions=await import("../src/app/api/admin/supplier-cost/actions/route");
  const action=(body:unknown)=>new Request('http://fixture.test/api/admin/supplier-cost/actions',{method:'POST',headers:{cookie:cookie(actor),origin:'http://fixture.test','content-type':'application/json'},body:JSON.stringify(body)});
  check((await actions.POST(action({action:'retry',key:'task:'+privateCall.id}))).status===404,"private cost retry denied without disclosure");
  check((await actions.POST(action({action:'retry',key:'task:'+normalCall.id}))).status===200,"ordinary cost retry preserved");
  check((await actions.POST(action({action:'variable',id:randomUUID(),operation:'privacy-1',amountCnyMicros:'1',label:'fixture',evidence:'fixture cost evidence'}))).status===404,"private variable-cost admin action denied");
  check((await pool.query("SELECT state FROM app_supplier_cost_jobs WHERE key=$1",['task:'+privateCall.id])).rows[0].state==='needs-attention',"private cost worker outbox remains unchanged");
  const {ensureExecutionAuditSchema}=await import("../src/lib/model-config/execution-audit-schema");await ensureExecutionAuditSchema(pool);
  for(const id of ["privacy-0","privacy-1","privacy-1:nested"]){
   await pool.query("INSERT INTO app_model_execution_stages(id,operation_id,feature,public_model_id,model_version,billing_version,provider_id,wire_model,phase,state,attempt) VALUES(gen_random_uuid(),$1,'image.generate','private-image',1,1,'private-images','wire-private-image','image','response-received',1)",[id]);
  }
  const stages=await import("../src/app/api/admin/billing/models/stages/route");
  check((await stages.GET(new Request("http://fixture.test/api/admin/billing/models/stages?operationId=privacy-1",{headers:{cookie:cookie(actor)}}))).status===404,"private stages denied");
  check((await stages.GET(new Request("http://fixture.test/api/admin/billing/models/stages?operationId=privacy-1:nested",{headers:{cookie:cookie(actor)}}))).status===404,"private nested stages denied");
  await pool.query("INSERT INTO app_billing_operations(id,email,feature,quote,request_fingerprint,state,ledger_id) VALUES('private-parent:child',$1,'image.generate','{}','fixture','settled','fixture')",[privateEmail]);
  check((await stages.GET(new Request("http://fixture.test/api/admin/billing/models/stages?operationId=private-parent",{headers:{cookie:cookie(actor)}}))).status===404,"parent lookup cannot expose private child operation");
  const visibleStages=await stages.GET(new Request("http://fixture.test/api/admin/billing/models/stages?operationId=privacy-0",{headers:{cookie:cookie(actor)}}));
  check(visibleStages.status===200&&(await visibleStages.json()).stages.length===1,"ordinary stages retained");
  const {readProviderActivity}=await import("../src/lib/model-config/provider-activity");
  const activity=await readProviderActivity(pool,snapshot.config,[snapshot.config.providers.find(p=>p.id==="private-images")!]);
  check(activity.providers[0].stats.h24?.total===1,"provider activity excludes private root and child");
  check((await pool.query("SELECT count(*)::int n FROM app_model_execution_stages WHERE operation_id LIKE 'privacy-1%'")).rows[0].n===2,"raw stage audit retained");

  const {imagegenRequestSchema}=await import("../src/lib/imagegen/schema");
  const {planImagegen}=await import("../src/lib/imagegen/plan");
  const {submitImagegen,getImagegenResult}=await import("../src/lib/imagegen/dispatch");
  const input=imagegenRequestSchema.parse({version:1,operationId:randomUUID(),entry:"canvas",mode:"generate",prompt:"A plain product photo",parameters:{quality:"medium",resolution:"1K",ratio:"1:1"}});
  const planned=await planImagegen(input,privateEmail);
  check(planned.steps[0].modelId===draft.grant.modelId&&planned.steps[0].eligibleUpstreamIds.join()===draft.grant.upstreamId,"domain plan exact private channel");
  const beforeCalls=calls.length;
  const asPrivate=<T>(run:()=>Promise<T>)=>withFrozenCreation({actorEmail:privateEmail,scopeKind:"personal",tenantId:null,accountImage:draft.grant},run);
  const accepted=await asPrivate(()=>submitImagegen(input,privateEmail,{billingVersion:planned.billingVersion,credits:planned.totalCredits,modelVersion:planned.modelVersion,confirmed:true}));
  const replay=await submitImagegen(input,privateEmail);check(replay.jobId===accepted.jobId,"accepted domain replay same original identity");
  async function completed(operation:string){for(let i=0;i<600;i++){const r=await getImagegenResult(operation,privateEmail);if(r&&["succeeded","failed","needs_attention"].includes(r.status))return r;await new Promise(r=>setTimeout(r,100));}throw Error("FIXTURE_TASK_TIMEOUT");}
  const delivered=await completed(input.operationId);
  check(delivered.status==="succeeded",JSON.stringify(delivered));check(delivered.artifacts.length>0,"real saved artwork delivered");
  check(calls.length===beforeCalls+1&&calls.at(-1)?.body.model==="wire-private-image","whole domain uses private SDK exactly once");
  check((await pool.query("SELECT count(*)::int n FROM app_billing_operations WHERE email=$1 AND state='settled' AND feature='canvas.image'",[privateEmail])).rows[0].n===1,"whole domain one settled charge");
  await submitImagegen(input,privateEmail);await getImagegenResult(input.operationId,privateEmail);check(calls.length===beforeCalls+1,"completed read and replay do not resubmit");
  const unknown=imagegenRequestSchema.parse({...input,operationId:randomUUID(),prompt:"UNKNOWN_PRIVATE_FIXTURE product"});
  const unknownPlan=await planImagegen(unknown,privateEmail);
  await asPrivate(()=>submitImagegen(unknown,privateEmail,{billingVersion:unknownPlan.billingVersion,credits:unknownPlan.totalCredits,modelVersion:unknownPlan.modelVersion,confirmed:true}));
  const uncertain=await completed(unknown.operationId);check(["failed","needs_attention"].includes(uncertain.status),"uncertain task retains recoverable state");
  await submitImagegen(unknown,privateEmail);await getImagegenResult(unknown.operationId,privateEmail);check(calls.length===beforeCalls+2,"UNKNOWN original identity never resubmits upstream");
  const hiddenDelivered=await creations.listUnifiedCreations({platform:true},cf);check(hiddenDelivered.pagination.total===0,"real delivered artwork/task/billing stay hidden in reports");
  if(process.env.SPECIAL_ACCOUNT_BROWSER_ROOT){
   const beforeBrowser=calls.length;
   const {verifySpecialAccountBrowser}=await import("./verification/special-account-browser.mjs");
   await verifySpecialAccountBrowser({root:process.env.SPECIAL_ACCOUNT_BROWSER_ROOT,out:process.env.SPECIAL_ACCOUNT_BROWSER_OUT||"output/special-account-browser",cookies:{private:signUserSession(privateEmail,Date.now()),normal:signUserSession(normalEmail,Date.now()),admin:signUserSession(actor,Date.now())},emails:{private:privateEmail,normal:normalEmail}});
   check(calls.length===beforeBrowser,"browser performs no supplier call");
  }
  console.log(`SPECIAL_ACCOUNT=PASS checks=${checks} PG=REAL SDK=LOOPBACK PRODUCTION_CALLS=0 PRIVATE_CREDITS=99999`);
 }finally{await closeDatabasePools();await f.cleanup();await rm(media,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
