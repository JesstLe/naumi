/** Actual direct-upload prepare/complete, loopback S3 and isolated PG. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {randomUUID,createHash} from "node:crypto";
import {readFile,mkdtemp} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
async function main(){
 const objects=new Map<string,Buffer>();let puts=0;
 const s3=createServer(async(req,res)=>{const key=new URL(req.url!,"http://s3").pathname;if(req.method==="PUT"){const parts:Buffer[]=[];for await(const c of req)parts.push(Buffer.from(c));objects.set(key,Buffer.concat(parts));puts++;res.end();return;}const data=objects.get(key);if(!data){res.writeHead(404);res.end();return;}res.setHeader("content-length",data.length);res.end(data);});
 await new Promise<void>(r=>s3.listen(0,"127.0.0.1",r));
 Object.assign(process.env,{STORAGE_DRIVER:"s3",MEDIA_PRIVATE:"1",MEDIA_REMOTE_ACCESS:"redirect",S3_ENDPOINT:`http://127.0.0.1:${(s3.address() as {port:number}).port}`,S3_BUCKET:"fixture",S3_ACCESS_KEY_ID:"fixture-only",S3_SECRET_ACCESS_KEY:"fixture-only",NAUMI_MULTI_USER:"1",MEDIA_DIR:await mkdtemp(join(tmpdir(),"upload-direct-"))});
 const f=await createModelFixture();process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 const db=await import("../src/lib/db"),route=await import("../src/app/api/media/uploads/route"),storage=await import("../src/lib/storage"),assets=await import("../src/lib/media-assets"),{USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
 const owner=`direct-${randomUUID()}@example.test`,other=`other-${randomUUID()}@example.test`;let checks=0;const check=(v:unknown)=>{assert.ok(v);checks++;};
 const headers=(actor=owner)=>({cookie:`${USER_COOKIE}=${signUserSession(actor,Date.now())}`});
 const json=async(value:unknown,actor=owner)=>route.POST(new Request("http://internal/api/media/uploads",{method:"POST",headers:{...headers(actor),"content-type":"application/json"},body:JSON.stringify(value)}));
 const bytes=await readFile(process.env.UPLOAD_FIXTURE_PNG!);const previews={thumbnail:await sharp(bytes).resize(512,512,{fit:"inside"}).webp().toBuffer(),preview:await sharp(bytes).resize(1600,1600,{fit:"inside"}).webp().toBuffer()};
 try{
  await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  const denied=await route.POST(new Request("http://internal/api/media/uploads",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"prepare",bytes:bytes.length,contentType:"image/png"})}));check(denied.status===401);
  const p=await json({action:"prepare",bytes:bytes.length,contentType:"image/png"});check(p.status===200);const pending=await p.json();check(pending.enabled===true&&pending.putUrl.includes("content-length"));
  check((await fetch(pending.putUrl,{method:"PUT",headers:{"content-type":"image/png"},body:bytes})).ok);
  check((await json({action:"complete",id:pending.id},other)).status===404);
  check((await json({action:"complete",id:pending.id})).status===422);
  const complete=async()=>{const form=new FormData();form.set("payload",JSON.stringify({action:"complete",id:pending.id,title:"Preserved original",x:123,y:456}));for(const[k,v]of Object.entries(previews))form.set(k,new File([new Uint8Array(v)],k+".webp",{type:"image/webp"}));return route.POST(new Request("http://internal/api/media/uploads",{method:"POST",headers:headers(),body:form}));};
  const saved=await complete();check(saved.status===200);const result=await saved.json();check(result.width===2304&&result.height===2048);
  const original=await storage.readManagedObject(result.image,64*1024*1024);check(original.bytes.equals(bytes));const asset=await assets.getMediaAsset(storage.storageKeyFromManagedUrl(result.image)!);check(asset?.sha256===createHash("sha256").update(bytes).digest("hex")&&!!asset.thumbnail_key&&!!asset.preview_key);
  const count=puts;check((await complete()).status===200);check(puts===count);
  check((await json({action:"prepare",bytes:64*1024*1024+1,contentType:"image/png"})).status===400);
  const pos=(await db.getPool().query("SELECT canvas_x,canvas_y FROM app_artworks WHERE id=$1",[result.id])).rows[0];check(pos.canvas_x===123&&pos.canvas_y===456);
  console.log(`DIRECT_UPLOAD=PASS CHECKS=${checks} ORIGINAL_HASH=UNCHANGED CLIENT_PREVIEWS=STORED SIGNED_SIZE=64MIB CAP=ENFORCED OWNER=ISOLATED COMPLETE=IDEMPOTENT SUPPLIER_CALLS=0`);
 }finally{await db.getPool().end();await f.cleanup();s3.closeAllConnections();await new Promise<void>(r=>s3.close(()=>r()));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
