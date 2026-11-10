import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
async function main(){
  const url=new URL(process.env.DATABASE_URL||"http://invalid");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/naumi_video_fixture_storyboard_director");assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,"1");
  const {getPool,closeDatabasePools}=await import("../src/platform/db/pool");
  const {ensureStoryboardSchema}=await import("../src/lib/storyboard/repository");
  const {saveStoryboardPlan,listStoryboardPlans,storyboardAdoptedResult}=await import("../src/lib/storyboard/service");
  const {ensureCreationSchema}=await import("../src/lib/saas/creation-schema");
  const {withFrozenCreation}=await import("../src/lib/saas/creation-scope");
  const {buildCanvasVideoWorkflow}=await import("../src/lib/video/canvas-workflow");
  const pool=getPool(),actor="director@example.test",project="tree:director-fixture",other="tree:other-fixture";let checks=0;
  const pass=(name:string)=>{checks++;console.log("STORYBOARD_DB_CHECK="+name);};
  try{
    await ensureStoryboardSchema();await ensureCreationSchema();
    for(const [id,key]of [["a",project],["b",project],["other",other]])await pool.query("INSERT INTO app_canvas_video_nodes(email,id,project_key,title,config) VALUES($1,$2,$3,$2,$4::jsonb)",[actor,id,key,JSON.stringify({prompt:"fixture",durationSeconds:4})]);
    const shots=["a","b"].map((nodeId,index)=>({nodeId,number:String(index+1),scene:"station",purpose:"waiting",takes:[],adoptedArtworkId:null}));
    const input={id:randomUUID(),projectKey:project,expectedRevision:0,operationId:randomUUID(),document:{title:"director",assemble:true,shots}};
    const saved=await saveStoryboardPlan(actor,input);assert.equal(saved.revision,1);pass("persist_before_generation");
    assert.deepEqual(await saveStoryboardPlan(actor,input),saved);pass("same_operation_exact_receipt");
    await assert.rejects(()=>saveStoryboardPlan(actor,{...input,document:{...input.document,title:"different"}}),/保存编号/);pass("operation_conflict");
    await assert.rejects(()=>saveStoryboardPlan("other@example.test",input),/无权访问/);pass("cross_account_rejected");
    await assert.rejects(()=>saveStoryboardPlan(actor,{...input,id:randomUUID(),operationId:randomUUID(),document:{...input.document,shots:[{...shots[0],nodeId:"other"}]}}),/当前项目/);pass("cross_project_node_rejected");
    const writes=await Promise.allSettled(Array.from({length:8},(_,i)=>`writer-${i}`).map(title=>saveStoryboardPlan(actor,{...input,expectedRevision:1,operationId:randomUUID(),document:{...input.document,title}})));
    assert.equal(writes.filter(row=>row.status==="fulfilled").length,1);assert.equal(writes.filter(row=>row.status==="rejected").length,7);pass("concurrent_cas_one_winner");
    let plan=(await listStoryboardPlans(actor,project))[0];assert.equal(plan.revision,2);
    await pool.query("UPDATE app_canvas_video_nodes SET x=1000 WHERE email=$1 AND id='a'",[actor]);assert.deepEqual((await listStoryboardPlans(actor,project))[0].document.shots.map(shot=>shot.nodeId),["a","b"]);pass("geometry_does_not_change_order");
    const task="take-task",art="take-art";
    await pool.query("INSERT INTO app_video_tasks(id,email,upstream_id,model,prompt,status,artwork_id,video_url,parameters,source,source_id) VALUES($1,$2,'fixture-upstream','fixture','fixture','completed',$3,'/media/fixture.mp4',$4::jsonb,'canvas','a')",[task,actor,art,JSON.stringify({nodeId:"a",projectKey:project,resultAssets:[{artworkId:art,kind:"video",url:"/media/fixture.mp4"}]})]);
    plan=await saveStoryboardPlan(actor,{...input,expectedRevision:plan.revision,operationId:randomUUID(),document:{...plan.document,shots:plan.document.shots.map(shot=>shot.nodeId==="a"?{...shot,adoptedArtworkId:art,takes:[{artworkId:art,taskId:task,status:"approved",note:"keep"}]}:shot)}});
    assert.equal(await storyboardAdoptedResult(actor,{id:plan.id,revision:plan.revision},project,"a"),art);pass("adoption_bound_to_actual_task_node");
    await assert.rejects(()=>saveStoryboardPlan(actor,{...input,expectedRevision:plan.revision,operationId:randomUUID(),document:{...plan.document,shots:[{...plan.document.shots[0],nodeId:"b"}]}}),/不属于此镜头/);pass("foreign_node_take_rejected");
    assert.equal((await listStoryboardPlans(actor,project))[0].revision,plan.revision);pass("failed_validation_zero_write");
    await pool.query("INSERT INTO app_video_tasks(id,email,upstream_id,model,prompt,status,parameters,source,source_id) VALUES('new-pending',$1,'fixture-upstream','fixture','new','processing',$2::jsonb,'canvas','a')",[actor,JSON.stringify({nodeId:"a",projectKey:project})]);
    await pool.query("UPDATE app_canvas_video_nodes SET last_task_id='new-pending',last_result_id='new-result',display_result_id=NULL WHERE email=$1 AND id='a'",[actor]);
    const workflow=await buildCanvasVideoWorkflow(actor,{id:randomUUID(),projectKey:project,storyboard:{id:plan.id,revision:plan.revision},nodes:[{id:"a",revision:1,reuseCompleted:true}]});assert.equal(workflow.nodes[0].existingArtworkId,art);pass("pending_remake_does_not_replace_adopted_output");
    await assert.rejects(()=>buildCanvasVideoWorkflow(actor,{id:randomUUID(),projectKey:project,storyboard:{id:plan.id,revision:plan.revision-1},nodes:[{id:"a",revision:1,reuseCompleted:true}]}),/方案已改变/);pass("stale_plan_cannot_build_new_run");
    await withFrozenCreation({actorEmail:actor,scopeKind:"tenant",tenantId:randomUUID(),workspaceExplicit:true},async()=>{await assert.rejects(()=>listStoryboardPlans(actor,project),/工作空间/);});pass("workspace_read_isolation");
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM app_video_workflow_runs WHERE email=$1",[actor]).catch(()=>({rows:[{n:0}]}))).rows[0].n,0);
    console.log(`STORYBOARD_DIRECTOR_DB=PASS CHECKS=${checks} REAL_POSTGRES=1 GENERATED_TASKS=0 SUPPLIER_CALLS=0`);
  }finally{await closeDatabasePools();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
