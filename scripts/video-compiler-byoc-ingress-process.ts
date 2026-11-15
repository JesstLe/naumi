import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {Pool} from 'pg';

/** Full production HTTP boundary: never import a Route, tool, resolver or compiler.
 * The optional Agent callback drives the real /api/agent harness via its scripted
 * text provider. All media/provider side effects are counted independently. */
export async function verifyVideoByocIngressProcess(input:{actor:string;pool:Pool;outputDir:string;workflowId:string;
 http:(url:string,body?:unknown,as?:string)=>Promise<{status:number;value:any}>;otherCookie:string;
 counts:()=>Promise<Record<string,number>>;network:()=>number[];
 agent?:(name:string,tool:string,args:Record<string,unknown>)=>Promise<any>}){
 const {http,pool,actor,workflowId}=input,checks:string[]=[],responses:any[]=[];
 const pass=(name:string)=>{checks.push(name);console.log('BYOC_INGRESS_PROCESS_CHECK='+name+' PASS');};
 // Executing a saved DAG may introspect object_info and persist an encrypted
 // endpoint credential. Only previews promise zero such I/O; rejected execution
 // must create no task/reservation/creation/ledger, upload or provider job.
 const agentAuditCount=async()=>Number((await pool.query("SELECT count(*) n FROM app_creation_records WHERE source_kind='agent-turn'")).rows[0].n);
 const effects=async()=>({...Object.fromEntries(Object.entries(await input.counts()).filter(([table])=>table!=='app_model_credentials')),app_creation_records:Number((await pool.query("SELECT count(*) n FROM app_creation_records WHERE source_kind<>'agent-turn'")).rows[0].n)});
 const originalAgentAudits=await agentAuditCount();
 const network=()=>input.network().slice(0,2),originalCounts=await input.counts();
 const originalEffects=await effects(),originalNetwork=network(),originalObjects=input.network()[2];
 const references=[{id:'image',kind:'image',role:'reference',artworkId:'process-input'}];
 const base={comfyWorkflowId:workflowId,prompt:'FULL_BYOC_DRAFT',references};
 const variants=[
  {name:'intent',change:{intentPreference:'single_image'},code:'WORKFLOW_MODE_CONFLICT'},
  {name:'shots',change:{shots:[{id:'shot',prompt:'Complete exact shot',durationSeconds:1}]},code:'WORKFLOW_STRUCTURE_NOT_MAPPED'},
  {name:'elements',change:{elements:[{id:'subject',name:'Subject',references:[{id:'nested-image',kind:'image',role:'element',artworkId:'process-input'}]}]},code:'WORKFLOW_STRUCTURE_NOT_MAPPED'},
  {name:'camera',change:{camera:{movement:'pan left'}},code:'PARAMETER_MAPPING_MISSING'},
  {name:'dimensions',change:{width:1024,height:768},code:'PARAMETER_MAPPING_MISSING'},
  {name:'provider-options',change:{providerOptions:{toggle:false}},code:'PARAMETER_MAPPING_MISSING'},
 ];
 for(const variant of variants){
  // Deliberately spell the full public request here, independently of the helper
  // under test; otherwise an ingress helper could drop fields on both sides.
  const full={workflowId,prompt:base.prompt,references,...variant.change};
  const previewEffects=await input.counts(),previewNetwork=input.network();
  const preview=await http('/api/video/compile-preview',{byoc:{...full,draftRevision:1}});
  responses.push({name:variant.name,entry:'preview',...preview});
  assert.equal(preview.status,422,JSON.stringify(preview.value));assert.equal(preview.value.diagnostics?.[0]?.code,variant.code,JSON.stringify(preview.value));
  assert.deepEqual(await input.counts(),previewEffects);assert.deepEqual(input.network(),previewNetwork);
  const submitted=await http('/api/comfyui/run',{...full,source:'workbench',idempotencyKey:randomUUID()});responses.push({name:variant.name,entry:'run',...submitted});assert.equal(submitted.status,422,JSON.stringify(submitted.value));assert.equal(submitted.value.code,variant.code);assert.equal(submitted.value.accepted,false);assert(Array.isArray(submitted.value.fields));
  pass('full-public-preview-and-run-'+variant.name+'-agree');
  const saved=await http('/api/canvas/video-nodes',{id:'full-byoc-'+variant.name,expectedRevision:0,operationId:randomUUID(),config:{...base,...variant.change},inputs:[]});assert.equal(saved.status,201,JSON.stringify(saved.value));
  const node=saved.value.node;for(const [key,value]of Object.entries(variant.change))assert.deepEqual(node.config[key],value);
  const nodePreviewEffects=await input.counts(),nodePreviewNetwork=input.network();
  const nodePreview=await http('/api/canvas/video-nodes/'+node.id+'/compile-preview',{expectedRevision:node.revision,draftRevision:1});responses.push({name:variant.name,entry:'node-preview',...nodePreview});assert.equal(nodePreview.status,422,JSON.stringify(nodePreview.value));assert.equal(nodePreview.value.diagnostics?.[0]?.code,variant.code,JSON.stringify(nodePreview.value));
  assert.deepEqual(await input.counts(),nodePreviewEffects);assert.deepEqual(input.network(),nodePreviewNetwork);
  const nodeSubmit=await http('/api/canvas/video-nodes/'+node.id+'/generate',{expectedRevision:node.revision,idempotencyKey:randomUUID()});responses.push({name:variant.name,entry:'node-generate',...nodeSubmit});assert.equal(nodeSubmit.status,422,JSON.stringify(nodeSubmit.value));assert.equal(nodeSubmit.value.code,variant.code);
  assert.deepEqual(await effects(),originalEffects);assert.deepEqual(network(),originalNetwork);
  pass('saved-canvas-preview-and-generate-'+variant.name+'-agree-zero-effects');
  if(input.agent){const auditsBefore=await agentAuditCount(),reply=await input.agent('byoc-full-'+variant.name,'generate_video',{config:{...base,...variant.change},inputs:[],operation_id:randomUUID()});responses.push({name:variant.name,entry:'agent',value:reply});assert.equal(await agentAuditCount(),auditsBefore+1);assert(reply.steps.some((step:any)=>step.isError===true&&step.summary===preview.value.diagnostics[0].reason),JSON.stringify(reply));assert.deepEqual(await effects(),originalEffects);assert.deepEqual(network(),originalNetwork);pass('actual-agent-full-'+variant.name+'-same-compiler-diagnostic');}
 }
 const nodeId='full-byoc-camera',beforeNode=await http('/api/canvas/video-nodes/'+nodeId,undefined,input.otherCookie);assert.equal(beforeNode.status,404);pass('cross-user-node-still-private');
 if(input.agent){
  for(const duration of [2,9]){
   const prompt='AGENT_FULL_STORYBOARD_'+randomUUID(),config={modelId:'video-process',prompt,parameters:{durationSeconds:duration,resolution:'4K',generateAudio:false}},shots=[{id:'first',prompt:'Exact first line',durationSeconds:1},{id:'last',prompt:'Exact last line',durationSeconds:1}];
   const auditsBefore=await agentAuditCount(),reply=await input.agent('full-storyboard-'+duration,'plan_video_storyboard',{mode:'multi_shot',config,shots});responses.push({name:'storyboard-'+duration,entry:'agent',value:reply});assert.equal(await agentAuditCount(),auditsBefore+1);
   const rows=(await pool.query("SELECT id,revision,config FROM app_canvas_video_nodes WHERE email=$1 AND config->>'prompt'=$2",[actor,prompt])).rows;assert.equal(rows.length,1,JSON.stringify(reply));assert.deepEqual(rows[0].config.parameters,config.parameters);assert.deepEqual(rows[0].config.shots,shots);
   const previewEffects=await input.counts(),previewNetwork=input.network();
  const preview=await http('/api/canvas/video-nodes/'+rows[0].id+'/compile-preview',{expectedRevision:Number(rows[0].revision),draftRevision:1});assert.equal(preview.status,422);assert.equal(preview.value.diagnostics?.[0]?.code,'STRUCTURED_SHOTS_MAPPING_MISSING',JSON.stringify(preview.value));assert.deepEqual(await effects(),originalEffects);assert.deepEqual(network(),originalNetwork);pass('actual-agent-storyboard-'+duration+'-saved-exactly-compiler-owns-execution');
  }
 }
 assert.deepEqual(await effects(),originalEffects);assert.deepEqual(network(),originalNetwork);
 await writeFile(path.join(input.outputDir,'BYOC_INGRESS_PROCESS_RESULT.json'),JSON.stringify({ok:true,checks,responses,actualHTTP:true,directToolsOrRoutes:0,agentHarness:!!input.agent,agentTurnAuditsAdded:await agentAuditCount()-originalAgentAudits,agentDiagnosticProjection:"original public sanitized summary, not a structured code field",businessEffectsAdded:0,generationOrUploadAdded:0,objectInfoReads:input.network()[2]-originalObjects,executionCredentialWrites:(await input.counts()).app_model_credentials-originalCounts.app_model_credentials,paidCalls:0},null,2));
 console.log('VIDEO_BYOC_INGRESS_PROCESS=PASS CHECKS='+checks.length+' ACTUAL_HTTP=1 AGENT_HARNESS='+Number(!!input.agent)+' DIRECT_TOOL_OR_ROUTE=0 BUSINESS_EFFECTS_ADDED=0 GENERATION_OR_UPLOAD_ADDED=0 PREVIEW_IO_ADDED=0');return checks.length;
}
