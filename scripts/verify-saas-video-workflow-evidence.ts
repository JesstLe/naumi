import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import path from 'node:path';

async function main(){
 const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const calls:{prompt:string;id:string}[]=[];
 const fake=createServer(async(req,res)=>{let body='';for await(const data of req)body+=data;assert.equal(req.url,'/v1/videos');assert.equal(req.method,'POST');const parsed=req.headers['content-type']?.includes('multipart/form-data')?Object.fromEntries(await new Response(body,{headers:{'content-type':req.headers['content-type']}}).formData()):JSON.parse(body),id=`fake-${calls.length+1}`;calls.push({prompt:parsed.prompt,id});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id,status:'queued'}));});
 await new Promise<void>(resolve=>fake.listen(0,'127.0.0.1',resolve));const port=(fake.address() as {port:number}).port;
 Object.assign(process.env,{SETTINGS_SECRET:'workflow-fixture-only-012345678901234567890123456',STORAGE_DRIVER:'local',MEDIA_DIR:path.resolve('output/saas-video-workflow-fixture/media'),MEDIA_PRIVATE:'1',NAUMI_MULTI_USER:'1',MODEL_CONFIG_TRUSTED_ORIGINS:`http://127.0.0.1:${port}`,VIDEO_API_BASE_URL:`http://127.0.0.1:${port}`,VIDEO_API_KEY:'fixture-local-fake-only',VIDEO_API_MODEL:'grok-imagine-video'});
 process.env.VIDEO_PROVIDERS_JSON=JSON.stringify([{id:'openai-videos',label:'Fixture local fake',protocol:'openai-videos',videoProfile:'openai-videos',baseUrl:process.env.VIDEO_API_BASE_URL,apiKey:process.env.VIDEO_API_KEY,models:['grok-imagine-video'],defaultModel:'grok-imagine-video',idempotencyStrategy:'header'}]);
 const db=await import('../src/lib/db'),ctx=await import('../src/lib/saas/creation-context'),writer=await import('../src/lib/saas/creation-writer'),schema=await import('../src/lib/saas/creation-schema'),tenants=await import('../src/lib/saas/tenants');
 const nodes=await import('../src/lib/canvas/video-node-service'),repo=await import('../src/lib/canvas/video-node-repository'),workflow=await import('../src/lib/video/workflow'),links=await import('../src/lib/video/workflow-links'),batch=await import('../src/lib/video/canvas-batch'),proof=await import('../src/lib/video/workflow-creation');
 const pool=db.getPool();
 try{
 await tenants.ensureTenantSchema();await schema.ensureCreationSchema();await repo.ensureVideoNodeSchema();await workflow.ensureVideoWorkflowSchema();await db.setSetting('credits_metering','0');
 const actor='workflow-owner@evidence.fixture',other='other@evidence.fixture';for(const email of [actor,other])await db.getOrCreateUser(email,email);
 await db.adjustUserCredits(actor,10000,'isolated fixture',{id:randomUUID(),actor:'fixture'});
 const admin={email:'fixture-platform',admin:true,consoleAdmin:true};
 const a=await tenants.createTenant(admin,{commandId:randomUUID(),name:'Workflow fixture A',ownerEmail:actor,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:true,generate:true}}),b=await tenants.createTenant(admin,{commandId:randomUUID(),name:'Workflow fixture B',ownerEmail:other,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:true,generate:true}});
 const scope=(tenantId:string|null=a.tenantId,explicit=true)=>({actorEmail:actor,scopeKind:tenantId?'tenant' as const:'personal' as const,tenantId,workspaceExplicit:explicit});
 const input=(id:string)=>({id,expectedRevision:0,operationId:randomUUID(),title:id,config:{prompt:'节点原始要求',modelId:'grok-imagine-video',mode:'text' as const,durationSeconds:4,resolution:'1280x720',aspectRatio:'16:9'},inputs:[]});
 const root=await ctx.withFrozenCreation(scope(),()=>nodes.saveVideoNode(actor,input('tenant-root')));
 assert.equal((await pool.query("SELECT tenant_id FROM app_creation_contexts WHERE actor_email=$1 AND context_id=$2",[actor,root.projectKey])).rows[0].tenant_id,a.tenantId);
 await assert.rejects(ctx.withFrozenCreation(scope(null),()=>nodes.saveVideoNode(actor,{id:root.id,expectedRevision:root.revision,operationId:randomUUID(),title:'bad'})),/工作空间已固定/);
 await assert.rejects(ctx.withFrozenCreation(scope(),()=>ctx.bindActualCreationProject(actor,'tree:phantom')),/不存在/);
 // Exact new output proof can freeze its real tree. Old unrecorded artwork cannot.
 const art=(id:string)=>({id,title:id,category:'main',prompt:'fixture',status:'completed',image:'/media/fixture.png',gradient:''});
 await db.addArtworks(actor,[art('old-art'),art('new-art')]);
 await ctx.withFrozenCreation(scope(),async()=>{const id=await writer.startCreation('fixture-output','new-art-source',actor);await writer.finishCreation(id!,actor,'succeeded',{artworkIds:['new-art']});});
 await ctx.withFrozenCreation(scope(),()=>ctx.bindActualCreationProject(actor,'tree:new-art'));
 await ctx.withCreationRequest(new Request('http://fixture/api/imagegen',{method:'POST',headers:{'x-naumi-workspace':a.tenantId,'x-naumi-project-context':'tree:new-art'}}),actor,async()=>{assert.equal(ctx.currentCreationContext()?.tenantId,a.tenantId);return Response.json({ok:true});});
 await assert.rejects(ctx.withCreationRequest(new Request('http://fixture/api/imagegen',{method:'POST',headers:{'x-naumi-workspace':a.tenantId,'x-naumi-project-context':'tree:phantom'}}),actor,async()=>Response.json({ok:true})),/不存在/);
 assert.equal((await pool.query("SELECT 1 FROM app_creation_contexts WHERE context_id='tree:phantom'")).rowCount,0);
 await assert.rejects(ctx.withFrozenCreation(scope(),()=>ctx.bindActualCreationProject(actor,'tree:old-art')),/归属未记录/);
 const inherited=scope(null,false);await ctx.withFrozenCreation(inherited,()=>ctx.bindActualCreationProject(actor,root.projectKey));assert.equal(inherited.tenantId,a.tenantId);
 const makePlan=(id:string)=>({id,projectKey:root.projectKey,nodes:[{id:'A',request:{...root.config,prompt:'阶段 A 原始要求'},dependsOn:[]},{id:'B',request:{...root.config,prompt:'阶段 B 独立原话'},dependsOn:['A']}]});
 const runId=randomUUID(),plan=makePlan(runId);await ctx.withFrozenCreation(scope(),()=>workflow.scheduleVideoWorkflow(actor,plan));
 assert.equal(calls.length,1,JSON.stringify(await workflow.getVideoWorkflow(actor,runId)));
 const saved=(await pool.query('SELECT creation_scope,plan,input_digest FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0];assert.equal(saved.creation_scope.tenantId,a.tenantId);assert.equal(saved.plan.creationScope,undefined);
 const roots=(await pool.query("SELECT * FROM app_creation_records WHERE source_kind='video-workflow' AND source_id=$1",[runId])).rows;assert.equal(roots.length,1);const creationId=roots[0].id;
 let children=(await pool.query('SELECT * FROM app_creation_records WHERE parent_id=$1',[creationId])).rows;assert.equal(children.length,1);assert.equal(children[0].request_snapshot.text,'阶段 A 原始要求');assert.equal(children[0].payer_account_id,actor);
 const task=(await db.getVideoTask(actor,(await workflow.getVideoWorkflow(actor,runId)).nodes[0].taskId!))!;
 // Fixture injects a completed business checkpoint; transport remains fake.
 await db.addArtworks(actor,[art('stage-a-output')]);await pool.query("UPDATE app_video_tasks SET status='completed',artwork_id='stage-a-output' WHERE id=$1 AND email=$2",[task.id,actor]);
 await writer.creationTransaction(tx=>links.completeWorkflowTaskTx(tx,actor,runId,'A',task.id,[{artworkId:'stage-a-output',kind:'video',url:'/media/fixture.mp4'}]));
 await pool.query("UPDATE app_enterprise_members SET membership_status='suspended' WHERE enterprise_id=$1 AND email=$2",[a.tenantId,actor]);
 // Recovery is worker-style: no current membership and no request context.
 await ctx.withFrozenCreation(scope(b.tenantId),()=>ctx.withoutCreationContext(()=>workflow.resumeVideoWorkflow(runId)));
 assert.equal(calls.length,2,JSON.stringify(await workflow.getVideoWorkflow(actor,runId)));
 children=(await pool.query('SELECT * FROM app_creation_records WHERE parent_id=$1 ORDER BY accepted_at',[creationId])).rows;assert.equal(children.length,2);assert.equal(children[1].request_snapshot.text,'阶段 B 独立原话');assert.ok(children.every(c=>c.tenant_id===a.tenantId&&c.payer_account_id===actor));
 await workflow.resumeVideoWorkflow(runId);assert.equal(calls.length,2);
 await assert.rejects(ctx.withFrozenCreation(scope(null),()=>workflow.scheduleVideoWorkflow(actor,plan)),/工作空间已固定/);assert.equal(calls.length,2);
 const req=new Request('http://fixture/workflow',{headers:{'x-naumi-workspace':'personal'}});await assert.rejects(proof.withWorkflowContinuation(req,actor,runId,()=>workflow.cancelVideoWorkflow(actor,runId)),/工作空间已固定/);
 await proof.withWorkflowContinuation(new Request('http://fixture/workflow'),actor,runId,()=>workflow.cancelVideoWorkflow(actor,runId));assert.equal(calls.length,2);
 await pool.query("UPDATE app_enterprise_members SET membership_status='active' WHERE enterprise_id=$1 AND email=$2",[a.tenantId,actor]);
 const single=await ctx.withFrozenCreation(scope(),()=>nodes.saveVideoNode(actor,input('single-root'))),singleId=randomUUID();
 const {submitCanvasVideo}=await import('../src/lib/video/node-submission');
 const submittedSingle=await ctx.withFrozenCreation(scope(null,false),()=>submitCanvasVideo(actor,{nodeId:single.id,expectedRevision:single.revision,idempotencyKey:singleId}));
 assert.equal(ctx.frozenCreationScope((await db.getVideoTask(actor,submittedSingle.taskId))?.parameters.creationScope,actor)?.tenantId,a.tenantId);
 await assert.rejects(ctx.withFrozenCreation(scope(null),()=>submitCanvasVideo(actor,{nodeId:single.id,expectedRevision:single.revision,idempotencyKey:singleId})),/工作空间已固定/);
 // A batch receipt, copies and workflow root freeze in one transaction.
 const source=await ctx.withFrozenCreation(scope(),()=>nodes.saveVideoNode(actor,input('batch-root'))),batchId=randomUUID();
 const failedId=randomUUID(),beforeFailure=calls.length;
 await assert.rejects(batch.readCanvasVideoBatch(actor,source.id,failedId));
 await pool.query(`CREATE FUNCTION fixture_batch_accept_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture batch receipt failure'; END $$; CREATE TRIGGER fixture_batch_accept_failure BEFORE INSERT ON app_canvas_video_batches FOR EACH ROW EXECUTE FUNCTION fixture_batch_accept_failure()`);
 await assert.rejects(ctx.withFrozenCreation(scope(),()=>batch.submitCanvasVideoBatch(actor,{nodeId:source.id,expectedRevision:source.revision,idempotencyKey:failedId,count:2,billingVersion:1,billingCredits:40})),/fixture batch receipt failure/);
 assert.equal((await pool.query("SELECT 1 FROM app_creation_records WHERE source_kind='video-workflow' AND source_id=$1",[failedId])).rowCount,0);
 assert.equal((await pool.query('SELECT 1 FROM app_canvas_video_nodes WHERE id=$1',[`video-${failedId}-1`])).rowCount,0);assert.equal(calls.length,beforeFailure);
 await pool.query('DROP TRIGGER fixture_batch_accept_failure ON app_canvas_video_batches; DROP FUNCTION fixture_batch_accept_failure()');
 const submitted=await ctx.withFrozenCreation(scope(),()=>batch.submitCanvasVideoBatch(actor,{nodeId:source.id,expectedRevision:source.revision,idempotencyKey:batchId,count:2,billingVersion:1,billingCredits:40}));
 assert.equal(submitted.nodeIds.length,2);const receipt=(await pool.query('SELECT creation_scope FROM app_canvas_video_batches WHERE id=$1',[batchId])).rows[0];assert.equal(receipt.creation_scope.tenantId,a.tenantId);
 assert.equal(Number((await pool.query("SELECT count(*) n FROM app_creation_records WHERE source_kind='video-workflow' AND source_id=$1 AND parent_id IS NULL",[batchId])).rows[0].n),1);
 const before=calls.length;await assert.rejects(ctx.withFrozenCreation(scope(null),()=>batch.submitCanvasVideoBatch(actor,{nodeId:source.id,expectedRevision:source.revision,idempotencyKey:batchId,count:2,billingVersion:1,billingCredits:40})),/工作空间已固定/);assert.equal(calls.length,before);
 // Copy records source/output identity and rejects another tenant's nodes.
 const copyId=randomUUID(),copied=await ctx.withFrozenCreation(scope(),()=>nodes.copyVideoNodes(actor,[source.id],root.projectKey,copyId));assert.equal(copied.nodes.length,1);
 const copiedRecord=(await pool.query("SELECT id FROM app_creation_records WHERE source_kind='canvas-video-copy' AND source_id=$1",[copyId])).rows[0];assert.ok(copiedRecord);
 assert.equal(Number((await pool.query("SELECT count(*) n FROM app_creation_links WHERE creation_id=$1 AND target_type='video-node'",[copiedRecord.id])).rows[0].n),2);
 const foreign=await ctx.withFrozenCreation(scope(b.tenantId),()=>nodes.saveVideoNode(actor,input('foreign-root')));
 await assert.rejects(ctx.withFrozenCreation(scope(),()=>nodes.copyVideoNodes(actor,[foreign.id],root.projectKey,randomUUID())),/其他企业/);
 // No scope in an old run can be upgraded through ambient ALS.
 const legacyId=randomUUID();await pool.query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,input_digest) VALUES($1,$2,$3,$4::jsonb,'legacy','legacy')",[legacyId,actor,root.projectKey,JSON.stringify({...makePlan(legacyId),nodes:[]})]);
 await ctx.withFrozenCreation(scope(),()=>ctx.withoutCreationContext(()=>workflow.resumeVideoWorkflow(legacyId)));
 assert.equal((await pool.query('SELECT creation_scope FROM app_video_workflow_runs WHERE id=$1',[legacyId])).rows[0].creation_scope,null);
 assert.equal((await pool.query("SELECT 1 FROM app_creation_records WHERE source_kind='video-workflow' AND source_id=$1",[legacyId])).rowCount,0);
 // A secondary evidence outage preserves the already completed source checkpoint.
 await pool.query(`CREATE FUNCTION fixture_workflow_evidence_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture evidence outage'; END $$; CREATE TRIGGER fixture_workflow_evidence_failure BEFORE UPDATE ON app_creation_records FOR EACH ROW EXECUTE FUNCTION fixture_workflow_evidence_failure()`);
 await writer.creationTransaction(tx=>links.completeWorkflowTaskTx(tx,actor,runId,'B',(children[1].source_id),[]));
 assert.equal((await pool.query('SELECT creation_evidence_pending FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0].creation_evidence_pending,true);
 assert.equal((await pool.query("SELECT status FROM app_video_workflow_run_nodes WHERE run_id=$1 AND node_id='B'",[runId])).rows[0].status,'completed');
 console.log('SAAS_VIDEO_WORKFLOW_EVIDENCE=PASS real_isolated_pg=true transport=fake root_children=true project_freeze=true batch_receipt_atomic=true cross_scope409=true legacy_not_upgraded=true evidence_failure_preserves_checkpoint=true real_supplier_calls=0');
 }finally{await pool.end();await new Promise<void>(resolve=>fake.close(()=>resolve()));}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
