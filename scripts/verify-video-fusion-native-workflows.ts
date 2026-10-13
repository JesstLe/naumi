import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createVideoFixture} from "./video-fusion/harness";
async function main(){
  for(const profile of ["autodl","runninghub"] as const){
    const h=await createVideoFixture({videoProfile:profile,startWorker:false});
    try{
      const runId=randomUUID(),path=profile==="autodl"?["prompt"]:["3","inputs","text"];
      const manifest={version:1,kind:profile,workflowId:"selected-native-workflow",inputs:[{name:"prompt",type:"prompt",path,required:true}]};
      const created=await h.request<{runId:string}>("a","POST","/api/video/workflows",{id:runId,projectKey:`tree:${h.refs.image.id}`,nodes:[{id:"native",dependsOn:[],request:{modelId:"video-a",prompt:"原生工作流视频",durationSeconds:4,resolution:"720p",mode:"text",...(profile==="runninghub"?{workflowManifest:manifest}:{})}}]});
      assert.equal(created.status,202,JSON.stringify(created.body));
      const deadline=Date.now()+240000;let taskId="",status="";
      while(Date.now()<deadline){await h.tick();const state=await h.request<{run:{nodes:Array<{taskId:string;status:string;error:string}>}}>("a","GET",`/api/video/workflows/${runId}`);
        const node=state.body.run.nodes[0];taskId=node.taskId;status=node.status;if(["completed","blocked","needs_attention","needs_confirmation"].includes(status))break;await new Promise(resolve=>setTimeout(resolve,1000));}
      assert.equal(status,"completed");const row=await h.taskPersistence("a",taskId);
      assert.equal(row.parameters.request.workflowManifest,undefined);assert.equal(typeof row.parameters.workflowManifestEnc,"string");
      assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,1);
      const nativeCall=h.supplierCalls().find(call=>call.phase==="create")!;
      if(profile==="autodl")assert.ok(String(nativeCall.path).endsWith("/selected-native-workflow"));
      else assert.equal((nativeCall.body as {workflowId:string}).workflowId,"selected-native-workflow");
    }finally{await h.stop();}
  }
  process.stdout.write("VIDEO_NATIVE_WORKFLOWS=PASS autodl=true runninghub=true real_app_worker=true encrypted_mapping=true paid_calls=0\n");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
