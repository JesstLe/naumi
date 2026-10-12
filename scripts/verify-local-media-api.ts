import assert from "node:assert/strict";
import {createModelFixture} from "./model-config-fixture";
async function main(){
 let providerCalls=0;const baseline=process.argv.includes("--baseline");
 const f=await createModelFixture((_req,res)=>{providerCalls++;res.writeHead(500);res.end("No provider call permitted");});
 process.env.PGOPTIONS=`-c search_path=${f.schemaName}`;process.env.NAUMI_MULTI_USER="1";
 const db=await import("../src/lib/db");
 try{
  await db.ensureSchema();await db.setSetting("multi_user_enabled","1");
  const email="history-media@example.test",other="history-other@example.test";
  await db.getOrCreateUser(email,"Fixture");await db.getOrCreateUser(other,"Other");
  const original={id:"local-art-fixture",title:"Local artwork",category:"main",prompt:"fixture",status:"completed",image:"/media/fixture.png",source:"/media/reference.png",gradient:"",width:320,height:320};
  await db.addArtworks(email,[original]);await db.addArtworks(email,[{...original,id:"invalid-url-fixture",image:"javascript:fixture"}]);
  const {signUserSession}=await import("../src/lib/native-auth");
  const {setAdminPassword,authenticateAdminPassword}=await import("../src/lib/admin-auth");await setAdminPassword("FixtureHistoryMedia2026!");
  const cookie=`nv_user=${signUserSession(email,Date.now())}`,otherCookie=`nv_user=${signUserSession(other,Date.now())}`;
  const adminCookie=`${cookie}; nv_admin=${await authenticateAdminPassword("FixtureHistoryMedia2026!")}`;
  const {POST:add}=await import("../src/app/api/artworks/add/route"),{POST:importTemplate}=await import("../src/app/api/admin/artworks/route");
  const request=(path:string,body:unknown,auth=cookie)=>new Request("http://fixture.test"+path,{method:"POST",headers:{cookie:auth,"content-type":"application/json"},body:JSON.stringify(body)});
  const ledgerBefore=Number((await f.sql.query("SELECT count(*) FROM app_ledger")).rows[0].count);
  const copied=await add(request("/api/artworks/add",{src:original,parentId:original.id,x:300,y:400}));assert.equal(copied.status,200);const copy=await copied.json();assert.notEqual(copy.id,original.id);
  const row=(await db.listArtworksByIds(email,[copy.id]))[0];assert.equal(row!.image,original.image);assert.equal(row!.parentId,original.id);assert.equal(row!.canvasX,300);assert.equal(row!.canvasY,400);
  assert.equal((await add(request("/api/artworks/add",{src:original},otherCookie))).status,404);
  const imported=await importTemplate(request("/api/admin/artworks",{action:"import",artworkId:original.id},adminCookie));
  if(baseline){assert.equal(imported.status,400);console.log("BASELINE_LOCAL_TEMPLATE=CONFIRMED LOCAL_MEDIA_REJECTED COPY_AUTH=INTACT");return;}
  assert.equal(imported.status,200);const result=await imported.json();assert.equal(result.template.image,original.image);assert.equal(result.template.sourceImage,original.source);
  assert.equal((await importTemplate(request("/api/admin/artworks",{action:"import",artworkId:original.id},otherCookie))).status,403);
  assert.equal((await importTemplate(request("/api/admin/artworks",{action:"import",artworkId:"invalid-url-fixture"},adminCookie))).status,400);
  assert.equal(Number((await f.sql.query("SELECT count(*) FROM app_ledger")).rows[0].count),ledgerBefore);assert.equal(providerCalls,0);assert.equal((await db.getArtworkById(original.id))!.image,original.image);
  console.log("LOCAL_MEDIA_API=PASS COPY=NEW_NODE PARENT_POSITION=KEPT SOURCE=UNCHANGED CROSS_ACCOUNT=REJECTED ADMIN_TEMPLATE=PASS AUTH=INTACT INVALID_URL=REJECTED LEDGER=UNCHANGED PROVIDER_CALLS=0");
 }finally{await db.getPool().end();await f.cleanup();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
