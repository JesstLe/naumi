require('tsx/cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=process.cwd(),file=path.join(root,'scripts/audit-canvas-lifecycle.cjs');
const h={require:createRequire(file),process:{cwd:()=>root,argv:['node','test'],env:{}},console,Response,File,FormData,Blob};
vm.createContext(h);vm.runInContext(fs.readFileSync(file,'utf8').split('async function main(){')[0]+';globalThis.make=setup;',h);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function main(){let cases=0;
 for(const outcome of ['unknown','known-result','not-started']){
  const s=h.make(),wait=deferred();let submit=0,position;
  s.c.privateFetchRaw=async(url,init)=>{position=JSON.parse(init.body);return Response.json({ok:true})};
  const task=s.c.landEditResult({id:'source-A'},()=>{submit++;return wait.promise},'扩图');
  const id=s.nodes()[0].id,startedAt=s.nodes()[0].generationStartedAt;
  s.c.rememberGenerationDrag(id,{x:777,y:888});s.switchProject('project-B');assert.equal(s.nodes().length,0);
  wait.resolve(Response.json(outcome==='known-result'?{id:'result-A'}:{error:'fixture',code:outcome==='unknown'?'OPERATION_PENDING':undefined},{status:outcome==='known-result'?200:outcome==='unknown'?409:400}));await task;
  assert.equal(s.nodes().length,0,'inactive task must not appear in B');assert.equal(s.c.editTaskStateRef.current.size,1);
  s.switchProject('project-A');s.c.restoreEditTasks();s.c.restoreEditTasks();assert.equal(s.nodes().length,1,'restore is idempotent');
  assert.equal(s.nodes()[0].x,777);assert.equal(s.nodes()[0].y,888);assert.equal(s.nodes()[0].generationStartedAt,startedAt);
  const kind=outcome==='known-result'?'sync':outcome==='unknown'?'uncertain':'not-started';assert.equal(s.nodes()[0].generationFailure.kind,kind);
  if(outcome==='known-result'){
   const check=s.nodes()[0].onGenerationCheck;s.switchProject('project-B');await check();assert.equal(position,undefined,'hidden source cannot write placement into another project');s.switchProject('project-A');await s.nodes()[0].onGenerationCheck();assert.equal(position.x,777);assert.equal(position.y,888);assert.equal(submit,1);assert.equal(s.nodes().length,0);assert.equal(s.c.editTaskStateRef.current.size,0);assert.equal(s.c.generationOperationRef.current.size,0);s.switchProject('project-B');s.switchProject('project-A');assert.equal(s.nodes().length,0,'completed card never resurrects');
  }else if(outcome==='unknown'){
   await s.c.landEditResult({id:'source-A'},()=>{submit++;return Response.json({id:'result-A'})},'扩图');assert.equal(submit,1,'unknown is never resubmitted');
  }else{
   await s.c.landEditResult({id:'source-A'},()=>{submit++;return Response.json({id:'result-A'})},'扩图');assert.equal(submit,2);assert.equal(s.c.editTaskStateRef.current.size,0);assert.equal(s.nodes().length,0);
  }
  cases++;
 }
 {
  const s=h.make();await s.c.landEditResult({id:'source-A'},async()=>Response.json({error:'pending',code:'OPERATION_PENDING'},{status:409}),'扩图');s.c.canvasAccountRef.current='other-account';s.c.restoreEditTasks();assert.equal(s.nodes().length,0);s.c.canvasAccountRef.current='fixture';s.c.restoreEditTasks();assert.equal(s.nodes().length,1);s.c.readOnly=true;s.c.restoreEditTasks();assert.equal(s.nodes().length,0);s.c.readOnly=false;s.c.restoreEditTasks();assert.equal(s.nodes().length,1);cases++;
 }
 {
  const s=h.make();let ready=false,submits=0;s.c.privateFetchRaw=async()=>Response.json({ok:true},{status:ready?200:503});await s.c.landEditResult({id:'source-A'},async()=>{submits++;return Response.json({id:'result-A'})},'扩图');assert.equal(s.nodes()[0].generationFailure.kind,'sync');s.switchProject('project-B');s.switchProject('project-A');ready=true;await s.nodes()[0].onGenerationCheck();assert.equal(submits,1);assert.equal(s.nodes().length,0);assert.equal(s.c.editTaskStateRef.current.size,0);cases++;
 }
 for(const status of [400,409]){
  const s=h.make();await s.c.landEditResult({id:'source-A'},async()=>Response.json({error:'fixture',code:status===409?'OPERATION_PENDING':undefined},{status}),'扩图');const id=s.nodes()[0].id;s.c.onPendRemove(id);assert.equal(s.nodes().length,status===400?0:1);assert.equal(s.c.editTaskStateRef.current.size,status===400?0:1);s.switchProject('project-B');s.switchProject('project-A');assert.equal(s.nodes().length,status===400?0:1,'explicit definite dismissal stays removed; unknown stays protected');cases++;
 }
 console.log(`EDIT_TASK_LIFECYCLE=PASS CASES=${cases} PROJECT_ACCOUNT_ISOLATION=YES DRAG_RESTORED=YES COMPLETED_REMOVED=YES UNKNOWN_REPLAY=0`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
