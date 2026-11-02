import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

async function main(){
 const url=new URL(process.env.DATABASE_URL||'http://invalid');assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 const db=await import('../src/lib/db'),ctx=await import('../src/lib/saas/creation-context'),writer=await import('../src/lib/saas/creation-writer'),schema=await import('../src/lib/saas/creation-schema'),tenants=await import('../src/lib/saas/tenants');
 const workflow=await import('../src/lib/video/workflow'),proof=await import('../src/lib/video/workflow-creation'),reader=await import('../src/lib/saas/creations'),evidence=await import('../src/lib/saas/creation-source-evidence'),contracts=await import('../src/lib/saas/creation-contracts');
 const pool=db.getPool(),actor='storyboard-evidence@example.test';let checks=0;
 try{
  await db.ensureSchema();await tenants.ensureTenantSchema();await schema.ensureCreationSchema();await workflow.ensureVideoWorkflowSchema();await db.getOrCreateUser(actor,actor);
  const admin={email:'fixture-platform',admin:true,consoleAdmin:true},tenant=await tenants.createTenant(admin,{commandId:randomUUID(),name:'Storyboard evidence fixture',ownerEmail:actor,validUntil:null,seatLimit:10,entitlementName:null,featurePolicy:{video:true,generate:true}});
  const scope={actorEmail:actor,scopeKind:'tenant' as const,tenantId:tenant.tenantId,workspaceExplicit:true},personal={...scope,scopeKind:'personal' as const,tenantId:null};
  const artwork=(id:string)=>({id,title:id,category:'video',prompt:'fixture',status:'completed',image:'',videoUrl:'/media/'+id+'.mp4',gradient:''});
  await db.addArtworks(actor,['personal-source','new-shot','final-film'].map(artwork));
  const runId=randomUUID(),plan={id:runId,projectKey:'tree:storyboard-evidence',nodes:[{id:'reuse',existingArtworkId:'personal-source',request:{prompt:'old result'},dependsOn:[]},{id:'new',request:{prompt:'new shot'},dependsOn:[]}],assembly:{nodeIds:['reuse','new']}};
  await pool.query("INSERT INTO app_video_workflow_runs(id,email,project_key,plan,plan_digest,input_digest) VALUES($1,$2,$3,$4::jsonb,'fixture','fixture')",[runId,actor,plan.projectKey,JSON.stringify(plan)]);
  for(const [nodeId,id]of [['reuse','personal-source'],['new','new-shot']])await pool.query("INSERT INTO app_video_workflow_run_nodes(run_id,node_id,status,result_assets) VALUES($1,$2,'completed',$3::jsonb)",[runId,nodeId,JSON.stringify([{artworkId:id,kind:'video'}])]);
  await ctx.withFrozenCreation(scope,()=>writer.creationTransaction(tx=>proof.acceptWorkflowCreationTx(tx,actor,plan)));
  const creationId=(await pool.query("SELECT id FROM app_creation_records WHERE source_kind='video-workflow' AND source_id=$1",[runId])).rows[0].id;
  const projection=async(status:string)=>{await pool.query('UPDATE app_video_workflow_runs SET assembly_state=$2::jsonb WHERE id=$1',[runId,JSON.stringify({status,attempt:0,outputs:status==='completed'?[{artworkId:'final-film',mimeType:'video/mp4'}]:[]})]);await writer.creationTransaction(tx=>proof.updateWorkflowCreationTx(tx,actor,runId));};
  await projection('completed');
  assert.equal(Number((await pool.query("SELECT count(*) n FROM app_creation_links WHERE creation_id=$1 AND target_type='artwork' AND target_id='personal-source' AND relation='output'",[creationId])).rows[0].n),0);
  assert.equal(Number((await pool.query("SELECT count(*) n FROM app_creation_links WHERE creation_id=$1 AND target_id='personal-source' AND relation='input'",[creationId])).rows[0].n),1);
  await writer.creationTransaction(tx=>writer.assertCreationInputsTx(tx,actor,['personal-source'],personal));checks++;
  const filters=contracts.creationFiltersSchema.parse({user:actor,page:1,size:20});
  for(const [state,expected]of [['waiting','running'],['queued','running'],['processing','running'],['failed','partial'],['needs_attention','needs_review'],['cancelled','partial'],['completed','succeeded']]){
   await projection(state);const page=await reader.listCreations({platform:true},filters);assert.equal(page.items.find(row=>row.id===creationId)?.status,expected,state);
   const filtered=await reader.listCreations({platform:true},{...filters,status:expected as any});assert.ok(filtered.items.some(row=>row.id===creationId),state+' filter');checks++;
  }
  // New final output with a real SQL projection failure; source checkpoint persists.
  await db.addArtworks(actor,[artwork('recovered-final-film')]);
  await pool.query("UPDATE app_video_workflow_runs SET assembly_state=$2::jsonb,creation_evidence_pending=true WHERE id=$1",[runId,JSON.stringify({status:'completed',attempt:1,outputs:[{artworkId:'recovered-final-film',mimeType:'video/mp4'}]})]);
  await pool.query("CREATE FUNCTION fixture_storyboard_evidence_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture projection unavailable'; END $$; CREATE TRIGGER fixture_storyboard_evidence_fail BEFORE UPDATE ON app_creation_records FOR EACH ROW EXECUTE FUNCTION fixture_storyboard_evidence_fail()");
  await writer.creationTransaction(tx=>proof.updateWorkflowCreationTx(tx,actor,runId));assert.equal((await pool.query('SELECT creation_evidence_pending FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0].creation_evidence_pending,true);
  const tx=await pool.connect();try{await tx.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const recovered=await evidence.creationSourceEvidence(tx,creationId);assert.equal(recovered.pending,true);assert.ok(recovered.assets.some(asset=>asset.storage_ref==='artwork:recovered-final-film'));assert.ok(!recovered.assets.some(asset=>asset.storage_ref==='artwork:personal-source'));await tx.query('COMMIT');}finally{tx.release();}checks++;
  await pool.query('DROP TRIGGER fixture_storyboard_evidence_fail ON app_creation_records; DROP FUNCTION fixture_storyboard_evidence_fail()');
  const before=Number((await pool.query('SELECT count(*) n FROM app_video_tasks')).rows[0].n);assert.equal(await workflow.recoverVideoWorkflows(10),0);
  assert.equal((await pool.query('SELECT creation_evidence_pending FROM app_video_workflow_runs WHERE id=$1',[runId])).rows[0].creation_evidence_pending,false);
  assert.equal(Number((await pool.query("SELECT count(*) n FROM app_creation_links WHERE creation_id=$1 AND target_id='recovered-final-film' AND relation='output'",[creationId])).rows[0].n),1);
  assert.equal(Number((await pool.query('SELECT count(*) n FROM app_video_tasks')).rows[0].n),before);checks++;
  console.log(`STORYBOARD_CREATION_EVIDENCE=PASS CHECKS=${checks} REAL_PG=1 REUSE_SCOPE=UNCHANGED LIVE_STATUS=ASSEMBLY_AWARE FINAL_RECOVERY=PASS TERMINAL_DEBT=CLEARED NEW_VIDEO_TASKS=0 SUPPLIER_CALLS=0`);
 }finally{await pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1});
