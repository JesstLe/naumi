import assert from "node:assert/strict";
import {readImagegenResponse,ImagegenHttpError} from "../src/lib/imagegen/http";
import {build} from "esbuild";
import vm from "node:vm";
import path from "node:path";
async function error(response:Response,status:number,accepted?:boolean){
 await assert.rejects(readImagegenResponse(response,"请求失败"), e=>{
  assert(e instanceof ImagegenHttpError);assert.equal(e.status,status);assert.equal(e.accepted,accepted);
  assert(!e.message.includes("<!DOCTYPE"));assert(!e.message.includes("Unexpected token"));return true;
 });
}
async function main(){
assert.deepEqual(await readImagegenResponse(Response.json({artworkId:"asset-1"}),"上传失败"),{artworkId:"asset-1"});
await error(new Response('<!DOCTYPE html><html>private upstream diagnostic</html>',{status:500}),500);
await error(new Response("Bad Gateway",{status:502}),502);
await error(new Response("",{status:504}),504);
await error(new Response("null"),200);
await error(Response.json({error:"请求未受理",accepted:false},{status:400}),400,false);
await error(Response.json({error:"处理中",accepted:true},{status:503}),503,true);
await error(Response.json({error:"状态未知"},{status:503}),503);
const bundle=await build({entryPoints:[path.resolve("src/lib/imagegen/client.ts")],bundle:true,platform:"node",format:"cjs",write:false,plugins:[{name:"fixture-auth",setup(b){b.onResolve({filter:/^\.\.\/supabase$/},()=>({path:"auth",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:"export async function authHeader(){return {}}",loader:"js"}));}}]});
async function attempt(accepted:boolean|undefined,receiptExists:boolean){
 const calls:string[]=[],module={exports:{} as any};
 const context={module,exports:module.exports,Response,AbortSignal,console,fetch:async(url:string,init?:RequestInit)=>{
  calls.push(`${init?.method||"GET"} ${url}`);
  if(init?.method==="POST")return accepted===undefined?new Response("<!DOCTYPE html>bad gateway",{status:502}):Response.json({error:"拒绝",accepted},{status:400});
  return receiptExists?Response.json({id:"operation-one",status:"running"}):Response.json({error:"不存在"},{status:404});
 }};
 vm.runInNewContext(bundle.outputFiles[0].text,context);
 const run=module.exports.startImagegen({operationId:"operation-one",mode:"edit"});
 await assert.rejects(run);
 assert.deepEqual(calls,["POST /api/imagegen"],"submission client never silently resubmits or polls");
 if(accepted!==false){const receipt=module.exports.pollImagegen("operation-one");if(receiptExists)assert.equal((await receipt).id,"operation-one");else await assert.rejects(receipt);}
 assert.equal(calls.filter(c=>c.startsWith("POST")).length,1);
 assert.deepEqual(calls,accepted===false?["POST /api/imagegen"]:["POST /api/imagegen","GET /api/imagegen?operationId=operation-one"]);
}
await attempt(undefined,true);await attempt(undefined,false);await attempt(false,false);await attempt(true,true);
console.log("IMAGEGEN_HTTP=PASS (JSON/HTML/empty/acceptance/one submission/explicit query of same receipt)");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
