import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createVideoFixture} from "./video-fusion/harness";
import {polled,requiredTaskId,sanitizeWirePayload} from "../src/lib/video/providers/wire";
async function main(){


assert.throws(()=>requiredTaskId(undefined));
assert.throws(()=>polled({status:"mystery"},{status:"mystery"}));
assert.throws(()=>polled({status:"completed",url:"https://echo.example.test/input.png"},{status:"completed"}));
assert.deepEqual(sanitizeWirePayload({apiKey:"fixture-key",resultJson:JSON.stringify({resultUrls:["https://media.example.test/result.mp4?token=secret"]})}),
  {apiKey:"[redacted]",resultJson:{resultUrls:["https://media.example.test/result.mp4"]}});
const h=await createVideoFixture();
try{
  const references=Array.from({length:8},(_v,index)=>{
    const kind=(["image","image","video","audio"] as const)[index%4],ref=h.refs[kind];
    return {id:`input-${index}`,kind,role:"reference",artworkId:ref.id,url:ref.url,storageKey:ref.storageKey};
  });
  const request={prompt:"视频私有引用校验",source:"workbench",modelId:"video-a",providerId:"managed-video",mode:"reference",durationSeconds:4,resolution:"720p",aspectRatio:"16:9",references,idempotencyKey:randomUUID()};
  const before=await h.balance("b");
  const forbidden=await h.request("b","POST","/api/video/generate",{...request,idempotencyKey:randomUUID()});
  assert.ok([404,422].includes(forbidden.status));assert.equal(await h.balance("b"),before);
  assert.equal(h.supplierCalls().filter(call=>call.phase==="create").length,0);
  const created=await h.request<{taskId:string}>("a","POST","/api/video/generate",request);
  assert.equal(created.status,200);assert.ok(created.body.taskId);
  await h.tick();
  const calls=h.supplierCalls();assert.equal(calls.filter(call=>call.phase==="create").length,1);
  assert.ok(calls.filter(call=>call.phase==="reference-read").length>=8);
  assert.ok(!JSON.stringify(calls).includes("X-Amz-Signature"));
  process.stdout.write("VIDEO_WIRE=PASS private_reference_reads=8 no_unauthorized_debit=true paid_calls=0\n");
}finally{await h.stop();}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
