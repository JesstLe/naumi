import assert from 'node:assert/strict';
import {selectWorkspace} from '../src/lib/saas/workspace-client';
import {submitCanvasImagegen} from '../src/lib/imagegen/canvas-client';

async function main(){
 const originalFetch=globalThis.fetch,calls:{path:string;headers:Headers}[]=[];
 let changeSpace=false;
 globalThis.fetch=async(input,init)=>{
  const path=String(input);calls.push({path,headers:new Headers(init?.headers)});
  if(path.endsWith('/plan')){if(changeSpace)selectWorkspace('tenant-b-fixture');return Response.json({steps:[],warnings:[],totalCredits:0,confirmationRequired:false,intent:{background:null}});}
  return Response.json({jobId:'fixture-no-upstream'});
 };
 const form=()=>{const body=new FormData();body.set('prompt','fixture context');body.set('ratio','1:1');body.set('count','1');return body;};
 try{
  selectWorkspace('tenant-a-fixture');
  const response=await submitCanvasImagegen(form(),undefined,undefined,{owner:'member@fixture.invalid',project:'tree:fixture',isCurrent:()=>true});assert.equal(response.status,200);
  assert.deepEqual(calls.map(c=>c.path),['/api/imagegen/plan','/api/imagegen']);
  for(const call of calls){assert.equal(call.headers.get('x-naumi-project-context'),'tree:fixture');assert.equal(call.headers.get('x-naumi-workspace'),'tenant-a-fixture');}
  calls.length=0;changeSpace=true;selectWorkspace('tenant-a-fixture');
  await assert.rejects(submitCanvasImagegen(form(),undefined,undefined,{owner:'member@fixture.invalid',project:'tree:fixture',isCurrent:()=>true}),/工作空间已切换/);
  assert.deepEqual(calls.map(c=>c.path),['/api/imagegen/plan']);
  calls.length=0;changeSpace=false;selectWorkspace('personal');
  await submitCanvasImagegen(form(),undefined,undefined,{owner:'member@fixture.invalid',project:'workspace',isCurrent:()=>true});
  for(const call of calls)assert.equal(call.headers.has('x-naumi-project-context'),false);
  console.log('SAAS_CLIENT_CONTEXT_FIXTURE_PASS actual_client_transport=1 project_header=1 frozen_workspace=1 switch_before_submit_blocks=1 workspace_sentinel_not_project=1 supplier_calls=0');
 }finally{globalThis.fetch=originalFetch;selectWorkspace('personal');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
