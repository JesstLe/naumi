import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createVideoFixture} from './video-fusion/harness';
import type {PublicVideoTaskView} from '../src/lib/video/service';

async function main(){
  const evidence=[];
  const evidenceDirectory=path.resolve('output/canvas-video-fusion-20261013/checkpoint-b');await mkdir(evidenceDirectory,{recursive:true});const evidenceFile=path.join(evidenceDirectory,`results-${randomUUID()}.json`);
  const profiles=['autodl','runninghub','compshare-wan','tfrouter-generic','byoc-comfyui'] as const,selected=process.argv.find(arg=>arg.startsWith('--profiles='))?.slice(11).split(',');
  if(selected?.some(profile=>!profiles.includes(profile as typeof profiles[number])))throw new Error('Unknown result verification profile');
  for(const profile of profiles.filter(profile=>!selected||selected.includes(profile))){
    const h=await createVideoFixture({startWorker:false,videoProfile:profile==='byoc-comfyui'?'ark':profile});
    try{
      h.setScenario(profile==='compshare-wan'?'multi-output':profile==='tfrouter-generic'?'tfrouter-inline':'success');
      const quote=await h.request<{version:number;credits:number;authorizedCredits:number;mode:string}>('a','POST','/api/billing/quote',{feature:'video.generate',quantity:1,modelId:'video-a',resolution:'720p'});assert.equal(quote.status,200);
      const input={prompt:'完整真实产物验收',modelId:'video-a',mode:'text',durationSeconds:4,resolution:'720p',aspectRatio:'16:9',generateAudio:false,idempotencyKey:randomUUID(),billingVersion:quote.body.version,billingCredits:quote.body.mode==='api-cost-plus'?quote.body.authorizedCredits:quote.body.credits};
      const originalBalance=await h.balance('a');
      const generated=profile==='byoc-comfyui'?await h.request<{taskId:string}>('a','POST','/api/comfyui/run',{workflowId:h.byocWorkflowId,artworkId:h.refs.image.id,mediaType:'video',idempotencyKey:randomUUID(),seed:0,prompt:input.prompt}):await h.request<{taskId:string}>('a','POST','/api/video/generate',input);assert.equal(generated.status,profile==='byoc-comfyui'?202:200,JSON.stringify(generated.body));
      const id=generated.body.taskId;let task:PublicVideoTaskView|undefined;const deadline=Date.now()+180000;
      let unblock=profile==='autodl'?await h.blockVideoOutput(id,1,'wav'):undefined,recoveredPartial=false;
      while(Date.now()<deadline){const response=await h.request<{task:PublicVideoTaskView}>('a','GET',`/api/video/tasks?id=${id}`);assert.equal(response.status,200);task=response.body.task;
        if(unblock){const persisted=await h.taskPersistence('a',id),manifest=persisted.parameters.resultAssetManifest;if(manifest?.entries[0]?.saved&&!manifest.entries[1]?.saved){assert.equal(task.status,'processing');assert.equal(await h.balance('a'),originalBalance);assert.ok(Number((await h.creditState('a')).credits_used)>0);await unblock();unblock=undefined;await h.restartApp();await h.forceVideoPollDue(id);recoveredPartial=true;}}
        if(task.status==='completed')break;assert.ok(!['failed','needs_attention','cancelled'].includes(task.status),JSON.stringify(task));await new Promise(resolve=>setTimeout(resolve,500));}
      assert.equal(task?.status,'completed');const assets=task!.resultAssets;assert.ok(assets&&assets.length===(profile==='tfrouter-generic'?1:profile==='byoc-comfyui'?3:2));
      if(profile==='autodl')assert.equal(recoveredPartial,true);
      assert.equal(new Set(assets.map(asset=>asset.artworkId)).size,assets.length);
      for(const asset of assets){const response=await h.request<ArrayBuffer>('a','GET',asset.url);assert.equal(response.status,200);const bytes=Buffer.from(response.body);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.ok(asset.kind==='image'?asset.probe?.width:asset.probe?.durationSeconds);assert.equal((await h.request('b','GET',asset.url)).status,404);assert.equal(await h.dbCount('app_artworks',{id:asset.artworkId}),1);}
      if(profile==='tfrouter-generic'){assert.ok(assets[0].bytes>512*1024);assert.ok(task!.resultMetadataWarnings.some(warning=>warning.code==='duration_mismatch'));}
      else if(profile!=='compshare-wan')assert.equal(assets.filter(asset=>asset.kind==='audio').length,1);
      if(profile==='byoc-comfyui'){assert.equal(assets.filter(asset=>asset.kind==='image').length,1);assert.equal(await h.balance('a'),originalBalance);}
      const state=await h.creditState('a'),createCount=h.supplierCalls().filter(call=>call.phase==='create').length;await h.restartApp();await h.tick();assert.deepEqual(await h.creditState('a'),state);assert.equal(h.supplierCalls().filter(call=>call.phase==='create').length,createCount);
      evidence.push({profile,outputs:assets.length,actualHashes:true,owned:true,once:true,recoveredPartial});
      await writeFile(evidenceFile,JSON.stringify({owner:'canvas-video-fusion-20261013',evidence,paidSupplierCalls:0,realVideoQualityValidated:false}));
    }finally{await h.stop();}
  }
  console.log('VIDEO_RESULTS=PASS '+JSON.stringify({evidence,paidSupplierCalls:0,realVideoQualityValidated:false}));
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
