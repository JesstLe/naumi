import assert from "node:assert/strict";
import {readImagegenResponse,ImagegenHttpError} from "../src/lib/imagegen/http";
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
console.log("IMAGEGEN_HTTP=PASS (JSON/HTML/empty/receipt acceptance)");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
