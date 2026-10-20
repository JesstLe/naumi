/** Pure/server component and local PG checks. No production or supplier call. */
import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {readFile,writeFile,mkdir,mkdtemp} from "node:fs/promises";
import {resolve,join} from "node:path";
import {tmpdir} from "node:os";
import sharp from "sharp";
import {createModelFixture} from "./model-config-fixture";
async function main(){
 const baseline=process.argv.includes("--baseline"),out=resolve(process.env.UPLOAD_EVIDENCE||"output/browser-reference-upload-20261020");await mkdir(out,{recursive:true});
 Object.assign(process.env,{NAUMI_MULTI_USER:"1",MEDIA_PRIVATE:"1",STORAGE_DRIVER:"local",MEDIA_DIR:await mkdtemp(join(tmpdir(),"upload-check-"))});
 const f=await createModelFixture((_req,res)=>{throw Error("No supplier allowed");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",MEDIA_PRIVATE:"1",STORAGE_DRIVER:"local"});
 const db=await import("../src/lib/db"),storage=await import("../src/lib/storage"),assets=await import("../src/lib/media-assets"),route=await import("../src/app/api/artworks/add/route");
 const owner=`upload-${randomUUID()}@example.test`,other=`other-${randomUUID()}@example.test`;
 const large=process.env.UPLOAD_FIXTURE_PNG?await readFile(process.env.UPLOAD_FIXTURE_PNG):await sharp(randomBytes(2304*2048*3),{raw:{width:2304,height:2048,channels:3}}).png({compressionLevel:0}).toBuffer();
 let checks=0;const check=(x:unknown)=>{assert.ok(x);checks++;};
 const {USER_COOKIE,signUserSession}=await import("../src/lib/native-auth");
 const post=async(bytes:Buffer,previews?:{thumbnail:Buffer;preview:Buffer})=>{const form=new FormData();form.set("image",new File([new Uint8Array(bytes)],"original.png",{type:"image/png"}));if(previews)for(const[k,v]of Object.entries(previews))form.set(k,new File([new Uint8Array(v)],k+".webp",{type:"image/webp"}));return route.POST(new Request("http://internal/api/artworks/add",{method:"POST",headers:{cookie:`${USER_COOKIE}=${signUserSession(owner,Date.now())}`},body:form}));};
 try{
  await db.getOrCreateUser(owner);await db.getOrCreateUser(other);
  if(baseline){const r=await post(large);check(r.status===400);check((await r.json()).error.includes("12MB"));console.log("BASELINE=REPRODUCED ORIGINAL_OVER12MIB=REJECTED CLIENT_ARCHIVE=REENCODED SERVER_VARIANTS=FULL_SOURCE SUPPLIER_CALLS=0");return;}
  const {referenceImageBudget,fitReferenceImage}=await import("../src/lib/image-upload-policy"),{browserImageHeader}=await import("../src/lib/browser-reference-image");
  for(let n=1;n<=32;n++){const budget=referenceImageBudget(n);check(budget.maxBytes*n<64*1024*1024);check(budget.maxPixels*n<=80_000_000);const size=fitReferenceImage(8000,6000,budget.maxEdge,budget.maxPixels);check(size.width*size.height<=budget.maxPixels&&size.width<=4096&&size.height<=4096);}
  for(const format of ["png","jpeg","webp"] as const){const bytes=await sharp({create:{width:401,height:251,channels:4,background:{r:10,g:80,b:160,alpha:0.5}}})[format]().toBuffer(),head=await browserImageHeader(new File([new Uint8Array(bytes)],"test."+format,{type:"image/"+format}));check(head.width===401&&head.height===251&&head.mime==="image/"+format);}
  const rotated=await sharp({create:{width:120,height:80,channels:3,background:"red"}}).jpeg().withMetadata({orientation:6}).toBuffer();check((await browserImageHeader(new File([new Uint8Array(rotated)],"exif.jpg"))).height===120);
  const huge=Buffer.from(large);huge.writeUInt32BE(20000,16);huge.writeUInt32BE(20000,20);await assert.rejects(browserImageHeader(new File([new Uint8Array(huge)],"too-many-pixels.png")),/像素/);checks++;
  await assert.rejects(browserImageHeader(new File(["invalid"],"bad.png")));checks++;
  // Exercise upgrade from the real old constraint, not only CREATE TABLE.
  await db.getPool().query("CREATE TABLE app_media_uploads(id uuid PRIMARY KEY,owner text NOT NULL,staging_key text NOT NULL,content_type text NOT NULL,bytes integer NOT NULL CHECK(bytes>0 AND bytes<=12582912),expires_at timestamptz NOT NULL,asset_key text,committed_id text,created_at timestamptz DEFAULT now())");
  await assets.ensureMediaSchema();await db.getPool().query("INSERT INTO app_media_uploads(id,owner,staging_key,content_type,bytes,expires_at) VALUES($1,$2,'fixture','image/png',67108864,now())",[randomUUID(),owner]);checks++;
  await assert.rejects(db.getPool().query("INSERT INTO app_media_uploads(id,owner,staging_key,content_type,bytes,expires_at) VALUES($1,$2,'fixture','image/png',67108865,now())",[randomUUID(),owner]));checks++;
  const {saveCanvasOriginal,originalImageMetadata,validateBrowserPreviews}=await import("../src/lib/canvas-original-upload");
  const previews={thumbnail:await sharp(large).resize(512,512,{fit:"inside"}).webp({quality:76}).toBuffer(),preview:await sharp(large).resize(1600,1600,{fit:"inside"}).webp({quality:84}).toBuffer()};
  const resize=sharp.prototype.resize;let serverResize=0;sharp.prototype.resize=function(){serverResize++;throw Error("Full source resize is forbidden in this upload path");};
  const key=`canvas-uploads/fixture-${randomUUID()}.png`,saved=await saveCanvasOriginal(large,key,owner,previews),original=await storage.readManagedObject(saved.url,64*1024*1024);check(Buffer.compare(original.bytes,large)===0);
  const asset=await assets.getMediaAsset(key);check(asset?.width===2304&&asset.height===2048&&asset.sha256===createHash("sha256").update(large).digest("hex"));check(!!asset?.thumbnail_key&&!!asset.preview_key);
  check((await storage.readManagedObject("/media/"+asset!.thumbnail_key)).bytes.equals(previews.thumbnail));check(await assets.canReadMedia(key,owner));check(!await assets.canReadMedia(key,other));
  const count=(await db.getPool().query("SELECT count(*)::int n FROM app_media_assets WHERE owner=$1",[owner])).rows[0].n;await saveCanvasOriginal(large,key,owner,previews);check((await db.getPool().query("SELECT count(*)::int n FROM app_media_assets WHERE owner=$1",[owner])).rows[0].n===count);
  await assert.rejects(saveCanvasOriginal(large,key,other,previews));checks++;
  const wrong=await sharp({create:{width:80,height:80,channels:3,background:"red"}}).webp().toBuffer();await assert.rejects(validateBrowserPreviews({width:2304,height:2048},{...previews,preview:wrong}));checks++;
  check((await post(large)).status===422);const actual=await post(large,previews);check(actual.status===200);const result=await actual.json();check(result.width===2304&&result.height===2048);check((await storage.readManagedObject(result.image)).bytes.equals(large));
  check(serverResize===0);sharp.prototype.resize=resize;
  const small=await sharp({create:{width:40,height:50,channels:3,background:"#99aabb"}}).png().toBuffer();check((await post(small)).status===200);
  await assert.rejects(originalImageMetadata(Buffer.alloc(64*1024*1024+1)),/64MiB/);checks++;
  // Reference transport assets must not allocate gallery variants on the server.
  const {saveImagegenInput}=await import("../src/lib/imagegen/input-assets"),reference=await saveImagegenInput(small,owner);const refKey=storage.storageKeyFromManagedUrl(reference.url)!;check((await assets.getMediaAsset(refKey))?.thumbnail_key===null);
  const results={checks,largeBytes:large.length,hash:createHash("sha256").update(large).digest("hex"),realSupplierCalls:0,originalBytesUnchanged:true,previewsStoredUnchanged:true,referenceServerVariants:0};await writeFile(join(out,"PG_RESULTS.json"),JSON.stringify(results,null,2));
  console.log(`MODIFIED=PASS CHECKS=${checks} ORIGINAL64MIB=BOUNDED RAW_HASH=UNCHANGED PREVIEWS=BROWSER_BYTES SERVER_RESIZE=0 REFERENCE_VARIANTS=0 OLD_SCHEMA=UPGRADED OWNER_GUARD=PASS SUPPLIER_CALLS=0`);
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
