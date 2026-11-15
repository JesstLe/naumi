const assert = require('node:assert/strict');
const path = require('node:path');
const {build} = require('esbuild');

// Execute the actual entry module, replacing its I/O ports only. The separate
// PG server-exit suite exercises the real compiler, repositories and history.
async function main() {
  const fixture = {};
  const dependencies = `
    const f=__fixture;
    export class ModelConfigError extends Error {constructor(code,message,status,fields){super(message);Object.assign(this,{code,status,fields});}}
    export class BillingError extends ModelConfigError {}
    export const getVideoTaskByIdempotencyKey=async(actor,key)=>{f.reads.push(['receipt',actor,key]);return f.existing;};
    export const getVideoNode=async(actor,id)=>{f.reads.push(['node',actor,id]);return f.node;};
    export const currentCreationContext=()=>f.context;
    export const frozenCreationScope=(scope)=>scope;
    export const bindActualCreationProject=async(actor,key)=>{f.project.push([actor,key]);if(f.projectError)throw f.projectError;};
    export const withVideoCreationModel=async(model,run)=>{f.selections.push(model);return run();};
    export const currentModelExecution=()=>f.bound?{frozen:{video:{execution:{}}}}:undefined;
    export const createVideoGeneration=async(actor,input)=>{f.created.push({actor,input});if(!f.bound)throw new ModelConfigError('VIDEO_EXECUTION_NOT_CONFIGURED','missing binding',422,['binding']);return {taskId:'new-task',cost:17};};
    export const videoByocDraft=(config,inputs)=>{f.byocDrafts.push({config,inputs});return {workflowId:config.comfyWorkflowId,prompt:config.prompt,orderedInputs:inputs};};
    export const submitByocComfyVideo=async(actor,input)=>{f.byoc.push({actor,input});return {taskId:'byoc-task',cost:0};};
    const old=async()=>{f.legacy++;throw new ModelConfigError('LEGACY_CANVAS_PATH_REACHED','old input assembly reached',500);};
    export const authorizeNodeInputs=old, getVideoTask=old, listArtworksByIds=old,
      readOwnedVideoWorkflow=old, requireOwnedVideoText=old, resolveCanvasNodeInputs=old;
  `;
  const bundled=await build({entryPoints:[path.resolve('src/lib/video/node-submission.ts')],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'entry-io-ports',setup(b){b.onResolve({filter:/.*/},args=>args.kind==='entry-point'?undefined:{path:'ports',namespace:'fixture'});b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:dependencies,loader:'js'}));}}]});
  const module={exports:{}};
  new Function('module','exports','__fixture',bundled.outputFiles[0].text)(module,module.exports,fixture);
  const {submitCanvasVideo}=module.exports;
  const fresh=()=>{for(const key of Object.keys(fixture))delete fixture[key];Object.assign(fixture,{bound:true,legacy:0,existing:null,context:null,reads:[],project:[],selections:[],created:[],byoc:[],byocDrafts:[],node:{id:'node-a',projectKey:'tree:project-a',revision:7,inputs:[{id:'ordinary',nodeId:'image:owned',kind:'image',role:'reference',value:'UI-only'}],config:{modelId:'public-model',providerId:'managed-video',prompt:'Exact original prompt',mode:'text',parameters:{resolution:'4K',seed:0,generateAudio:false},batchCount:3,comfyInputs:[],comfyOverrides:{}}}});};
  const args={nodeId:'node-a',expectedRevision:7,idempotencyKey:'original-operation',billingConfirmation:{version:2,credits:17}};
  const run=()=>submitCanvasVideo('OWNER@FIXTURE.TEST',args);
  if(process.argv.includes('--baseline')){
    fresh();fixture.bound=false;await assert.rejects(run,{code:'LEGACY_CANVAS_PATH_REACHED'});assert.equal(fixture.legacy,1);assert.equal(fixture.created.length,0);
    console.log('CANVAS_SUBMIT_OWNER_BASELINE=OLD_INPUT_PATH_REACHED LEGACY_CALLS=1 SHARED_CREATE_CALLS=0');return;
  }
  let checks=0;
  const check=async(name,fn)=>{fresh();await fn();assert.equal(fixture.legacy,0);checks++;console.log('CANVAS_SUBMIT_OWNER_CASE='+name+' PASS');};
  await check('missing-binding-reaches-one-application-owner',async()=>{fixture.bound=false;await assert.rejects(run,{code:'VIDEO_EXECUTION_NOT_CONFIGURED'});assert.equal(fixture.created.length,1);});
  await check('missing-binding-does-not-expand-composite-or-text-inputs',async()=>{fixture.bound=false;fixture.node.inputs=[{id:'scene',nodeId:'scene:owned',kind:'text',role:'context',value:'untrusted'},{id:'timeline',nodeId:'timeline-node:owned',kind:'video',role:'source_video',value:'untrusted'}];await assert.rejects(run,{code:'VIDEO_EXECUTION_NOT_CONFIGURED'});assert.deepEqual(fixture.created[0].input.orderedInputs,fixture.node.inputs);});
  await check('mapped-draft-is-forwarded-without-rewriting',async()=>{assert.deepEqual(await run(),{taskId:'new-task',cost:17});const {actor,input}=fixture.created[0];assert.equal(actor,'owner@fixture.test');assert.equal(input.prompt,fixture.node.config.prompt);assert.equal(input.mode,'text');assert.deepEqual(input.parameters,{resolution:'4K',seed:0,generateAudio:false});assert.deepEqual(input.orderedInputs,fixture.node.inputs);assert.equal(input.references,undefined);assert.equal(input.batchCount,undefined);assert.equal(input.comfyInputs,undefined);assert.deepEqual(input.billingConfirmation,args.billingConfirmation);assert.deepEqual(fixture.selections,['public-model']);assert.deepEqual(fixture.project,[['owner@fixture.test','tree:project-a']]);});
  await check('no-input-config-references-and-workflow-source-preserved',async()=>{fixture.node.inputs=[];fixture.node.config.references=[{id:'stored',kind:'image',role:'last_frame',artworkId:'original'}];fixture.node.config.workflowTaskId='owned-history';await run();const input=fixture.created[0].input;assert.deepEqual(input.references,fixture.node.config.references);assert.equal(input.orderedInputs,undefined);assert.equal(input.workflowTaskId,'owned-history');});
  await check('advanced-fields-and-explicit-intent-preserved',async()=>{Object.assign(fixture.node.config,{intentPreference:'reference',shots:[{id:'shot',prompt:'Exact'}],elements:[{id:'person',references:[]}],camera:{type:'original'},negativePrompt:'Exact negative',width:1024,height:576,providerOptions:{audio:false}});await run();for(const key of ['intentPreference','shots','elements','camera','negativePrompt','width','height','providerOptions'])assert.deepEqual(fixture.created[0].input[key],fixture.node.config[key]);});
  await check('byoc-keeps-independent-profile-owner',async()=>{fixture.bound=false;fixture.node.config.comfyWorkflowId='workflow-a';assert.deepEqual(await run(),{taskId:'byoc-task',cost:0});assert.equal(fixture.created.length,0);assert.equal(fixture.selections.length,0);assert.equal(fixture.byoc.length,1);assert.equal(fixture.byoc[0].input.nodeId,'node-a');assert.equal(fixture.byoc[0].input.expectedRevision,7);});
  await check('existing-receipt-precedes-node-and-model-lookups',async()=>{fixture.existing={id:'accepted',cost:7,parameters:{nodeId:'node-a',nodeRevision:7}};fixture.node=null;assert.deepEqual(await run(),{taskId:'accepted',cost:7});assert.equal(fixture.reads.length,1);assert.equal(fixture.created.length,0);assert.equal(fixture.selections.length,0);});
  await check('existing-receipt-node-conflict-remains',async()=>{fixture.existing={id:'accepted',parameters:{nodeId:'other',nodeRevision:7}};await assert.rejects(run,{code:'OPERATION_CONFLICT'});assert.equal(fixture.created.length,0);});
  await check('existing-receipt-revision-conflict-remains',async()=>{fixture.existing={id:'accepted',parameters:{nodeId:'node-a',nodeRevision:6}};await assert.rejects(run,{code:'OPERATION_CONFLICT'});});
  await check('existing-workspace-mismatch-remains',async()=>{fixture.context={workspaceExplicit:true,scopeKind:'tenant',tenantId:'new'};fixture.existing={id:'accepted',parameters:{nodeId:'node-a',nodeRevision:7,creationScope:{scopeKind:'tenant',tenantId:'old'}}};await assert.rejects(run,{code:'CREATION_SCOPE_CONFLICT'});});
  await check('missing-node-remains-rejected',async()=>{fixture.node=null;await assert.rejects(run,{code:'VIDEO_NODE_UNAVAILABLE'});assert.equal(fixture.selections.length,0);});
  await check('stale-revision-remains-rejected',async()=>{fixture.node.revision=8;await assert.rejects(run,{code:'VIDEO_NODE_REVISION_CONFLICT'});assert.equal(fixture.project.length,0);});
  await check('project-authorization-precedes-creation',async()=>{fixture.projectError=Object.assign(new Error('project mismatch'),{code:'PROJECT_DENIED'});await assert.rejects(run,{code:'PROJECT_DENIED'});assert.equal(fixture.created.length,0);});
  console.log('CANVAS_SUBMIT_OWNER=PASS CHECKS='+checks+' OLD_INPUT_CALLS=0 NETWORK=0 PRODUCTION_WRITES=0');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
