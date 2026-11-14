import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool} from 'pg';

/** All calls hit the actual packaged Web; no Route/module replacement. */
export async function verifyVideoAdmissionProcess(input:{origin:string;secret:string;pool:Pool;root:string;base:Record<string,unknown>;originalTaskId:string;cancelledTaskId:string;posts:()=>number;byoc:{posts:number;uploads:number;objects:number};http:(url:string,body?:unknown)=>Promise<{status:number;value:any}>;publish:()=>Promise<unknown>}){
 const {http,pool}=input,checks:string[]=[],responses:unknown[]=[];const pass=(name:string)=>{checks.push(name);console.log('ADMISSION_PROCESS_CHECK='+name+' PASS');};
 await input.publish();
 const saved=await http('/api/canvas/video-nodes',{id:'admission-node',expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-process',prompt:'Admission-only draft',parameters:{durationSeconds:1,resolution:'4K'}},inputs:[]});assert.equal(saved.status,201,JSON.stringify(saved));const node=saved.value.node;
 const workflow=await http('/api/comfyui/workflows',{name:'Admission-only workflow',json:JSON.stringify({text:{class_type:'CLIPTextEncode',inputs:{text:'not executed'}},save:{class_type:'SaveVideo',inputs:{text:['text',0]}}})});assert.equal(workflow.status,200);
 const counts=async()=>{const values:Record<string,number>={};for(const table of ['app_video_tasks','app_creation_records','app_gen_reservations','app_ledger','app_video_workflow_runs','app_canvas_video_batches','app_canvas_video_nodes']){const exists=(await pool.query('SELECT to_regclass($1) n',[table])).rows[0].n;values[table]=exists?Number((await pool.query('SELECT count(*) n FROM '+table)).rows[0].n):0;}return values;};
 const control=async(action:string)=>{const status=await fetch(input.origin+'/api/internal/release/status',{headers:{'x-release-control-secret':input.secret}}).then(r=>r.json());const response=await fetch(input.origin+'/api/internal/release/control',{method:'POST',headers:{'content-type':'application/json','x-release-control-secret':input.secret},body:JSON.stringify({action,instanceId:status.identity.instanceId,bootId:status.identity.bootId,expectedRevision:status.admission.revision,operationId:randomUUID()})});assert.equal(response.status,200,await response.text());};
 await control('drain');const before=await counts(),network=[input.posts(),input.byoc.posts,input.byoc.uploads,input.byoc.objects];
 try{
  const reject=async(name:string,url:string,body:unknown)=>{const response=await http(url,body);responses.push({name,status:response.status,value:response.value});assert.equal(response.status,503,JSON.stringify({name,response}));assert.equal(response.value.code,'VIDEO_RELEASE_DRAINING',JSON.stringify({name,response}));assert.deepEqual(await counts(),before,name+' business writes');assert.deepEqual([input.posts(),input.byoc.posts,input.byoc.uploads,input.byoc.objects],network,name+' supplier calls');pass(name+'-rejects-before-business-write-or-supplier-io');};
  await reject('workbench','/api/video/generate',{...input.base,prompt:'DRAINED_WORKBENCH',idempotencyKey:randomUUID()});
  await reject('canvas','/api/canvas/video-nodes/admission-node/generate',{expectedRevision:node.revision,idempotencyKey:randomUUID()});
  await reject('canvas-batch','/api/canvas/video-nodes/admission-node/batch',{expectedRevision:node.revision,idempotencyKey:randomUUID(),count:2});
  await reject('workflow','/api/video/workflows',{id:randomUUID(),projectKey:node.projectKey,nodes:[{id:'one',dependsOn:[],request:{modelId:'video-process',prompt:'DRAINED_WORKFLOW',parameters:{durationSeconds:1,resolution:'4K'},references:[]}}]});
  await reject('byoc','/api/comfyui/run',{workflowId:workflow.value.savedId,mediaType:'video',source:'workbench',prompt:'DRAINED_BYOC',references:[],idempotencyKey:randomUUID()});
  await reject('explicit-retry','/api/video/tasks/'+input.cancelledTaskId+'/retry',{idempotencyKey:randomUUID()});
  const replay=await http('/api/video/generate',input.base);assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.value.taskId,input.originalTaskId);assert.deepEqual(await counts(),before);pass('drained-web-replays-original-operation-without-new-task');
  const preview=await http('/api/video/compile-preview',{modelId:'video-process',draftRevision:1,draft:{prompt:'Preview during drain',parameters:{durationSeconds:1,resolution:'4K'},inputs:[]}});assert.equal(preview.status,200,JSON.stringify(preview));assert.equal((await http('/api/video/tasks/'+input.originalTaskId)).status,200);assert.deepEqual(await counts(),before);assert.deepEqual([input.posts(),input.byoc.posts,input.byoc.uploads,input.byoc.objects],network);pass('preview-and-original-result-read-remain-available-during-drain');
  await writeFile(path.join(input.root,'ADMISSION_PROCESS_RESULT.json'),JSON.stringify({ok:true,checks,responses,before,after:await counts(),networkBefore:network,networkAfter:[input.posts(),input.byoc.posts,input.byoc.uploads,input.byoc.objects],paidCalls:0,productionWrites:0},null,2));console.log('VIDEO_ADMISSION_PROCESS=PASS CHECKS='+checks.length+' REAL_HTTP=1 ZERO_NEW_TASKS=1 ZERO_NEW_LEDGER=1 ZERO_SUPPLIER_IO=1 PAID_CALLS=0');
 }finally{await control('resume');}
}
