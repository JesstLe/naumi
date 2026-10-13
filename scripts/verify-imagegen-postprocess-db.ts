import assert from "node:assert/strict";
import {randomUUID,createHash} from "node:crypto";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
async function main(){
 const f=await createModelFixture();process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;
 process.env.STORAGE_DRIVER="local";process.env.MEDIA_PRIVATE="1";process.env.MEDIA_DIR=await mkdtemp(join(tmpdir(),"naumi-imagegen-pixels-"));
 const db=await import("../src/lib/db"),post=await import("../src/lib/media-postprocess"),storage=await import("../src/lib/storage");
 try{
  await db.ensureSchema();const owner=`imagegen-${randomUUID()}@example.test`;await db.getOrCreateUser(owner,"Fixture");
  const id=`pixels-${randomUUID()}`,bytes=await sharp({create:{width:16,height:16,channels:4,background:"#ff0000"}}).png().toBuffer();
  const input={id,parentId:`parent-${randomUUID()}`,email:owner,modelVersion:1,bytes,
   policy:{enabled:true as const,kind:"imagegen" as const,output:{format:"webp" as const,compression:0},failure:"hold" as const}};
  const first=await post.runPostprocess(input);assert.equal(first.status,"succeeded");assert.equal(first.mime,"image/webp");
  const parallelId=`pixels-parallel-${randomUUID()}`;
  await Promise.allSettled([post.runPostprocess({...input,id:parallelId}),post.runPostprocess({...input,id:parallelId})]);
  assert.equal((await post.resumePostprocess(parallelId,owner)).status,"succeeded");
  assert.equal((await db.getPool().query("SELECT count(*)::int AS n FROM app_media_postprocess WHERE operation_id=$1",[parallelId])).rows[0].n,1);
  assert.equal((await post.runPostprocess(input)).url,first.url);
  const row=(await db.getPool().query("SELECT * FROM app_media_postprocess WHERE operation_id=$1",[id])).rows[0];
  assert.equal(row.output_mime,"image/webp");assert.equal(Number(row.total_pixels),256);
  const base=await storage.readManagedObject(row.base_url,12*1024*1024),hash=(x:Buffer)=>createHash("sha256").update(x).digest("hex");assert.equal(hash(base.bytes),hash(bytes));
  await assert.rejects(()=>post.runPostprocess({...input,policy:{...input.policy,output:{format:"png" as const}}}),/冻结配置/);
  assert.equal(hash((await storage.readManagedObject(row.base_url,12*1024*1024)).bytes),hash(bytes),"Conflicting ID cannot overwrite base");
  await assert.rejects(()=>post.resumePostprocess(id,"another@example.test"),/不存在/);
  assert.equal((await db.getPool().query("SELECT count(*)::int AS n FROM app_media_postprocess WHERE operation_id=$1",[id])).rows[0].n,1);
  const sourceId=`source-${randomUUID()}`,sourceImage=await storage.uploadImage(bytes,"image/png",`imagegen-fixture/${sourceId}.png`,undefined,owner);
  await db.getPool().query("INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,group_id) VALUES($1,$2,'源图','all','保留原图','completed',$3,'',$1)",[sourceId,owner,sourceImage]);
  const local=await import("../src/lib/canvas-local-image-edit"),operationId=randomUUID();
  const operation={mode:"process" as const,id:sourceId,operationId,output:{format:"webp" as const,compression:0}};
  const version=await local.saveCanvasLocalEdit(owner,operation,f.origin);assert.ok(version.image?.endsWith(".webp"));
  assert.equal((await local.saveCanvasLocalEdit(owner,operation,f.origin)).id,version.id);
  await assert.rejects(()=>local.saveCanvasLocalEdit("another@example.test",{...operation,operationId:randomUUID()},f.origin),/无权|不存在/);
  const created=(await db.getPool().query("SELECT parent_id,image_url FROM app_artworks WHERE id=$1 AND email=$2",[version.id,owner])).rows[0];assert.equal(created.parent_id,sourceId);
  console.log("PASS imagegen postprocess persistence: immutable base, frozen policy, private owner, MIME and idempotency");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
