import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,readdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import type {Pool} from 'pg';

export type ProductionInputSession=Pick<Parameters<typeof import('./video-compiler-input-equivalence').verifyVideoInputEquivalence>[0],'snapshotCounts'|'foreignPreview'|'observeNode'|'readPlan'|'complete'|'observeLedger'|'observeParent'>&{files:Array<{kind:'image'|'video'|'audio';name:string;mimeType:string;file:string}>};

/** Interactive, file-receipted acceptance bridge for the actual shared browser.
 * No browser/React injection, replacement responses or direct workflow calls.
 * Setup, observation and an explicitly labelled historical budget seed only. */
export async function videoStoryboardSession(input:{actor:string;pool:Pool;origin:string;cookie:string;root:string;posts:()=>number;
 inputEquivalence?:ProductionInputSession;historyTaskId?:string;runtime?:{mode:string;commit:string};
 http:(url:string,body?:unknown)=>Promise<{status:number;value:any}>;resume:()=>Promise<unknown>;drain:()=>Promise<unknown>}){
 const {actor,pool,http,root}=input;const commands=path.join(root,'commands');await mkdir(commands,{recursive:true});
 // Cross-OS bind mounts expose a newly created file before writeFile finishes.
 // Readers must only observe a complete receipt, never an empty JSON prefix.
 const publish=async(file:string,value:unknown)=>{const temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2));await rename(temp,file);};
 const first=await http('/api/canvas/video-nodes',{id:'storyboard-browser-a',title:'镜头甲',expectedRevision:0,operationId:randomUUID(),x:0,y:0,config:{modelId:'video-process',mode:'text',prompt:'Storyboard shot A original',parameters:{durationSeconds:1,resolution:'4K'}},inputs:[]});assert.equal(first.status,201,JSON.stringify(first.value));
 const project=first.value.node.projectKey;
 const second=await http('/api/canvas/video-nodes',{id:'storyboard-browser-b',title:'镜头乙',projectKey:project,expectedRevision:0,operationId:randomUUID(),x:500,y:0,config:{modelId:'video-process',mode:'text',prompt:'Storyboard shot B original',parameters:{durationSeconds:1,resolution:'4K'}},inputs:[]});assert.equal(second.status,201,JSON.stringify(second.value));
 // Dev compilation warmup is not production cold-start evidence. Production
 // leaves these Canvas routes untouched until the real browser requests them.
 if(!process.argv.includes('--production-package'))for(const route of ['/api/account','/api/projects','/api/canvas/text-nodes','/api/canvas/video-nodes','/api/canvas/director-nodes','/api/canvas/comfy-nodes','/api/canvas/character-nodes','/api/canvas/scene-nodes','/api/canvas/audio-nodes','/api/canvas/timeline-nodes','/api/canvas/workflow-import','/api/canvas/image-tasks','/api/video/media-jobs']){const r=await http(route);assert.equal(r.status,200,route);}
 const baselineLedger=(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE email=$1 AND kind='consume'",[actor])).rows[0],posts=input.posts(),receipts:any[]=[];
 const snapshot=async()=>{
  const plans=await http('/api/canvas/storyboards?projectKey='+encodeURIComponent(project));assert.equal(plans.status,200);
  const nodes=(await pool.query('SELECT id,title,revision,config,inputs,last_task_id,last_result_id,display_result_id FROM app_canvas_video_nodes WHERE email=$1 AND project_key=$2 AND deleted_at IS NULL ORDER BY created_at,id',[actor,project])).rows;
  const runs=(await pool.query('SELECT id,plan,assembly_state,public_frozen_nodes,confirmations FROM app_video_workflow_runs WHERE email=$1 AND project_key=$2 ORDER BY created_at,id',[actor,project])).rows;
  const taskView=await http('/api/video/tasks?projectKey='+encodeURIComponent(project));assert.equal(taskView.status,200);const tasks=taskView.value.tasks;
  const ledger=(await pool.query("SELECT count(*)::int n,COALESCE(-sum(delta),0)::int amount FROM app_ledger WHERE email=$1 AND kind='consume'",[actor])).rows[0];
  return {projectKey:project,plans:plans.value.plans,nodes,runs,tasks,postsAdded:input.posts()-posts,ledgerAdded:{n:ledger.n-baselineLedger.n,amount:ledger.amount-baselineLedger.amount}};
 };
 await publish(path.join(root,'STORYBOARD_SESSION.json'),{origin:input.origin,cookie:input.cookie,historyTaskId:input.historyTaskId,runtime:input.runtime,inputEquivalence:input.inputEquivalence?{files:input.inputEquivalence.files}:undefined,projectKey:project,nodeIds:[first.value.node.id,second.value.node.id],url:input.origin+'/canvas?project='+encodeURIComponent(project)+'&node='+first.value.node.id,commands});
 console.log('STORYBOARD_SESSION_READY='+root);
 const handled=new Set<string>();let finished=false,aborted=false,inputBoundary:Awaited<ReturnType<typeof snapshot>>|undefined;
 while(!finished){for(const name of (await readdir(commands)).filter(n=>/^cmd-[a-f0-9-]+\.json$/.test(n)&&!handled.has(n)).sort()){
  const file=path.join(commands,name);let command:any;try{command=JSON.parse(await readFile(file,'utf8'));}catch{continue;}handled.add(name);
  try{
   let value:any;
   if(command.action==='abort'){finished=true;aborted=true;value={aborted:true};}
   else if(command.action==='snapshot')value=await snapshot();
   else if(command.action==='run'){
    assert.match(command.runId,/^[a-f0-9-]{36}$/);const before=await http('/api/video/workflows/'+command.runId);assert.equal(before.status,200);assert.equal(before.value.run.projectKey,project);await input.resume();
    const until=Date.now()+150000;for(;;){const r=await http('/api/video/workflows/'+command.runId);assert.equal(r.status,200);value=r.value.run;assert(!value.nodes.some((n:any)=>['blocked','failed'].includes(n.status)),JSON.stringify(value));if(command.expect==='needs_confirmation'?value.nodes.some((n:any)=>n.status==='needs_confirmation'):value.progress===100)break;if(Date.now()>until)throw Error('Storyboard run deadline '+JSON.stringify(value));await new Promise(resolve=>setTimeout(resolve,150));}await input.drain();
   }else if(command.action==='underbudget'){
    assert.match(command.runId,/^[a-f0-9-]{36}$/);const original=(await pool.query('SELECT * FROM app_video_workflow_runs WHERE email=$1 AND id=$2 AND project_key=$3',[actor,command.runId,project])).rows[0];assert(original);
    const {decryptAtRest,encryptAtRest}=await import('../src/lib/settings');const frozen=JSON.parse(decryptAtRest(original.frozen_nodes_enc)!);const stage=Object.keys(frozen)[0];assert(stage);const nodes=(await pool.query('SELECT status,task_id FROM app_video_workflow_run_nodes WHERE run_id=$1',[command.runId])).rows;assert(nodes.every(n=>n.status==='pending'&&!n.task_id));const required=frozen[stage].quote.credits;assert(required>1);frozen[stage].quote.credits=1;frozen[stage].quote.authorizedCredits=1;await pool.query('UPDATE app_video_workflow_runs SET frozen_nodes_enc=$2,public_frozen_nodes=$3::jsonb WHERE id=$1',[command.runId,encryptAtRest(JSON.stringify(frozen)),JSON.stringify({...original.public_frozen_nodes,[stage]:frozen[stage].quote})]);value={runId:command.runId,stage,seed:'explicit isolated historical budget',authorized:1,required};
   }else if(command.action==='check'){
    value=await snapshot();const plan=value.plans.find((p:any)=>p.id===command.planId)||value.plans[0];
    if(command.shots!==undefined)assert.equal(plan.document.shots.length,command.shots);
    if(command.title!==undefined)assert.equal(plan.document.title,command.title);
    if(command.posts!==undefined)assert.equal(value.postsAdded,command.posts);
    if(command.completedTasks!==undefined)assert.equal(value.tasks.filter((t:any)=>t.status==='completed').length,command.completedTasks);
    if(command.adopted!==undefined)assert.equal(plan.document.shots.filter((s:any)=>s.adoptedArtworkId).length,command.adopted);
    if(command.annotations!==undefined)assert.equal(plan.document.shots.flatMap((s:any)=>s.takes).reduce((n:number,t:any)=>n+(t.annotations?.length||0),0),command.annotations);
    assert(command.name);console.log('STORYBOARD_SESSION_CHECK='+command.name+' PASS');
   }else if(command.action==='finish'){value=await snapshot();assert(value.tasks.length>=2&&value.tasks.every((t:any)=>t.status==='completed'));assert(value.runs.some((r:any)=>r.assembly_state?.status==='completed'));if(input.inputEquivalence)inputBoundary=value;else finished=true;}
   else if(command.action==='input-equivalence'){
    assert(input.inputEquivalence&&inputBoundary,'Production input session unavailable or storyboard not finished');const ports=input.inputEquivalence;let result:unknown;
    switch(command.op){
     case 'counts':result=await ports.snapshotCounts();break;
     case 'node':assert(typeof command.id==='string'&&command.id.startsWith('input-eq-'));result=await ports.observeNode(command.id);break;
     case 'plan':assert(typeof command.id==='string');result=await ports.readPlan(command.id);break;
     case 'complete':assert(typeof command.id==='string');result=await ports.complete(command.id);break;
     case 'ledger':assert(typeof command.id==='string');result=await ports.observeLedger(command.id);break;
     case 'parent':assert(typeof command.id==='string');result=await ports.observeParent(command.id);break;
     case 'foreign':assert(command.asset&&typeof command.asset.artworkId==='string'&&['image','video','audio'].includes(command.asset.kind));result=await ports.foreignPreview(command.asset);break;
     case 'finish':{const after=await snapshot();assert.equal(after.postsAdded-inputBoundary.postsAdded,10);assert.equal(after.ledgerAdded.n-inputBoundary.ledgerAdded.n,10);assert.equal(after.ledgerAdded.amount-inputBoundary.ledgerAdded.amount,170);result={ledgerAdded:{n:10,amount:170},postsAdded:10};finished=true;break;}
     default:throw Error('Unknown input equivalence observation');
    }
    value={result,posts:input.posts()};
   }
   else throw Error('Unknown fixture command');
   receipts.push({command,ok:true,value});await publish(path.join(commands,name.replace('cmd-','result-')),{ok:true,value});
  }catch(error){receipts.push({command,ok:false,error:String(error)});await publish(path.join(commands,name.replace('cmd-','result-')),{ok:false,error:String(error)});}
  await publish(path.join(root,'STORYBOARD_SESSION_RECEIPTS.json'),receipts);
 }if(!finished)await new Promise(resolve=>setTimeout(resolve,200));}
 if(aborted)throw Error('STORYBOARD_SESSION_ABORTED_BY_DRIVER');
 console.log('STORYBOARD_SESSION=PASS CHECKS='+receipts.filter(r=>r.command.action==='check'&&r.ok).length);return (await snapshot()).ledgerAdded;
}
