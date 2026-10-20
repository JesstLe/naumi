/** Local actual upload handlers + browser entry; no production/supplier connection. */
import {createServer} from "node:http";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {mkdtemp,writeFile,mkdir,readFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import sharp from "sharp";
import {build} from "esbuild";
import {createModelFixture} from "./model-config-fixture";
async function main(){
 const out=resolve(process.env.UPLOAD_EVIDENCE||"output/browser-reference-upload-20261020"),baseline=process.argv.includes("--baseline");await mkdir(out,{recursive:true});
 Object.assign(process.env,{NAUMI_MULTI_USER:"1",MEDIA_PRIVATE:"1",STORAGE_DRIVER:"local",MEDIA_DIR:await mkdtemp(join(tmpdir(),"browser-upload-"))});
 const root=process.env.FIXTURE_SOURCE_ROOT?resolve(process.env.FIXTURE_SOURCE_ROOT):process.cwd();
 const f=await createModelFixture((_req,res)=>{res.writeHead(500);res.end("No supplier permitted");});
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${f.schemaName}`,NAUMI_MULTI_USER:"1",MEDIA_PRIVATE:"1",STORAGE_DRIVER:"local",NAUMI_ROUTER_MANAGEMENT_URL:f.origin,MODEL_CONFIG_TRUSTED_ORIGINS:f.origin});
 await f.repo.current();const db=await import("../src/lib/db");await db.getOrCreateUser("browser-upload@example.test","Fixture");
 const {signUserSession,USER_COOKIE}=await import("../src/lib/native-auth");
 const routes={art:await import("../src/app/api/artworks/add/route"),input:await import("../src/app/api/imagegen/inputs/route"),media:await import("../src/app/api/media/uploads/route")};
 const large=await readFile(process.env.UPLOAD_FIXTURE_PNG||join(out,"LARGE_INPUT.png")).catch(()=>sharp(randomBytes(2304*2048*3),{raw:{width:2304,height:2048,channels:3}}).png({compressionLevel:0}).toBuffer());
 const wide=await sharp({create:{width:4001,height:2501,channels:4,background:{r:20,g:120,b:220,alpha:0.5}}}).png().toBuffer();
 const jpeg=await sharp({create:{width:120,height:80,channels:3,background:"#aabbcc"}}).jpeg().withMetadata({orientation:6}).toBuffer();
 await writeFile(join(out,"LARGE_INPUT.png"),large);await writeFile(join(out,"WIDE_INPUT.png"),wide);await writeFile(join(out,"EXIF_INPUT.jpg"),jpeg);
 const entry=baseline?`import {prepareImageUploads} from ${JSON.stringify(root+"/src/lib/client-image-upload.ts")};window.fixture={prepareImageUploads,baseline:true};`:`export * from ${JSON.stringify(root+"/src/lib/browser-reference-image.ts")};export * from ${JSON.stringify(root+"/src/lib/client-image-upload.ts")};export * from ${JSON.stringify(root+"/src/lib/imagegen/canvas-client.ts")};`;
 const js=(await build({stdin:{contents:entry,resolveDir:root,loader:"ts"},bundle:true,platform:"browser",format:"iife",globalName:baseline?"BaselineFixture":"UploadFixture",write:false,define:{"process.env.NODE_ENV":'"test"',"process.env.NEXT_PUBLIC_SUPABASE_URL":'""',"process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY":'""'},tsconfig:join(root,"tsconfig.json")})).outputFiles[0].contents;
 const events:any[]=[];let origin="";
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url!,"http://internal").pathname;
   if(path==="/fixture.js"){res.setHeader("content-type","application/javascript");res.end(js);return;}
   if(path==="/browser-tests.js"){res.setHeader("content-type","application/javascript");res.end(await readFile(resolve("scripts/browser-reference-upload-check.js")));return;}
   const fixture=path==="/large.png"?large:path==="/wide.png"?wide:path==="/exif.jpg"?jpeg:null;
   if(fixture){res.setHeader("content-type",path.endsWith(".jpg")?"image/jpeg":"image/png");res.end(fixture);return;}
   if(path==="/results"){res.setHeader("content-type","application/json");res.end(JSON.stringify(events));return;}
   if(path==="/save-results"){const parts:Buffer[]=[];for await(const c of req)parts.push(Buffer.from(c));await writeFile(join(out,baseline?"browser-baseline.json":"browser-modified.json"),Buffer.concat(parts));res.end("ok");return;}
   if(path==="/"){res.setHeader("set-cookie",`${USER_COOKIE}=${signUserSession("browser-upload@example.test",Date.now())}; Path=/; SameSite=Lax`);res.setHeader("content-type","text/html; charset=utf-8");res.end('<!doctype html><html><body style="background:#fafafa;color:#172033;font-family:system-ui"><h1>图片上传本地验收</h1><pre id="result">READY</pre><script src="/fixture.js"></script></body></html>');return;}
   if(path.startsWith("/api/")){
    const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const bytes=Buffer.concat(chunks),headers=new Headers();for(const[k,v]of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(","):v);
    const request=new Request(origin+req.url,{method:req.method,headers,...(req.method==="POST"?{body:bytes}:{})});
    if(path==="/api/imagegen/plan"){const body=await request.json();events.push({kind:"plan",request:body});res.setHeader("content-type","application/json");res.end(JSON.stringify({request:body,intent:{background:null},steps:[{operation:"edit"}],totalCredits:0,billingVersion:1,modelVersion:1,warnings:[],confirmationRequired:false}));return;}
    if(path==="/api/imagegen"){const body=await request.json();events.push({kind:"generation-fixture",operationId:body.operationId});res.setHeader("content-type","application/json");res.end(JSON.stringify({jobId:"imagegen-"+body.operationId}));return;}
    if(path==="/api/artworks/add"){const form=await request.clone().formData(),file=form.get("image");events.push({kind:"archive",bytes:file instanceof File?file.size:0,sha256:file instanceof File?createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"):null,thumbnail:form.get("thumbnail") instanceof File,preview:form.get("preview") instanceof File});}
    if(path==="/api/imagegen/inputs"){const form=await request.clone().formData(),file=form.get("image") as File;events.push({kind:"reference",bytes:file.size,meta:await sharp(Buffer.from(await file.arrayBuffer())).metadata()});}
    const response=await (path==="/api/artworks/add"?routes.art.POST:path==="/api/imagegen/inputs"?routes.input.POST:routes.media.POST)(request);res.statusCode=response.status;response.headers.forEach((v,k)=>res.setHeader(k,v));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   res.writeHead(404);res.end();
  }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error)}));}
 });
 await new Promise<void>(r=>server.listen(Number(process.env.FIXTURE_PORT||14761),"127.0.0.1",r));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 await writeFile(join(out,"browser-fixture.json"),JSON.stringify({origin,schema:f.schemaName,largeBytes:large.length,hash:createHash("sha256").update(large).digest("hex")}));
 const close=async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await db.getPool().end();await f.cleanup();process.exit(0);};process.on("SIGINT",close);process.on("SIGTERM",close);
 console.log(`BROWSER_UPLOAD_FIXTURE=${origin} ACTUAL_HANDLERS=ARTWORKS_INPUTS SOURCE=${root} SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
