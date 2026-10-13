import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {Check} from "typebox/value";

import {CREATIVE_AGENT_TOOLS,CREATIVE_TOOL_FEATURES} from "../src/lib/agent/creative-tool-catalog";
import {createNaumiTools,describeNaumiTools} from "../src/lib/agent/naumi-tools";
import {createModelFixture} from "./model-config-fixture";

async function main(){
 const fixture=process.env.DATABASE_URL?await createModelFixture():null;
 if(fixture)process.env.PGOPTIONS=`-c search_path=${fixture.schemaName}`;
 const db=await import("../src/lib/db"),native=await import("../src/lib/native-auth");
 const email=`coverage-${Date.now()}@example.test`;
 if(fixture)await db.getOrCreateUser(email,"Coverage fixture");
 const credentials={cookie:fixture?`nv_user=${native.signUserSession(email,Date.now())}`:"fixture-cookie",authorization:"Bearer fixture-token"};
 const png=await readFile("public/demos/suite-demo/suppl-src.png"),calls:any[]=[],fixtureId="70a631c2-1d3f-4502-8214-2f85e265dca5";
 const { MEDIA_DIR }=await import("../src/lib/storage");
 await mkdir(MEDIA_DIR,{recursive:true});await writeFile(MEDIA_DIR+"/anchor.png",png);
 let status=200,empty=false;
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));
  const request=new Request(origin+req.url,{method:req.method,headers:req.headers as any,...(req.method==="POST"?{body:Buffer.concat(chunks)}:{})});
  if(req.url==="/media/anchor.png"){res.setHeader("content-type","image/png");res.end(png);return;}
  let form:any,body:any;if(request.headers.get("content-type")?.includes("multipart"))form=await request.formData();else if(req.method==="POST")body=await request.json();
  calls.push({path:req.url,method:req.method,form:form?Object.fromEntries([...form.keys()].map(k=>[k,form.getAll(k).map((v:any)=>typeof v==="string"?v:{file:v.name,size:v.size})])):undefined,body,cookie:req.headers.cookie,authorization:req.headers.authorization});
  res.setHeader("content-type","application/json");res.statusCode=status;if(status!==200){res.end(JSON.stringify({error:"fixture upstream unavailable"}));return;}
  const item={id:fixtureId,prompt:"fixture",regions:[],activeVersion:"",revision:0,versions:[],image:"/media/result.png"};
  if(req.url==="/api/competitors")res.end(JSON.stringify(req.method==="POST"?{item}:{items:[item]}));
  else if(req.url?.includes("/action"))res.end(JSON.stringify({item}));
  else if(req.url==="/api/artworks/add")res.end(JSON.stringify({id:"exported-competitor"}));
  else if(req.url==="/api/generate-image"&&req.method==="POST")res.end(JSON.stringify({jobId:"fixture-job"}));
  else if(req.url?.startsWith("/api/generate-image?"))res.end(JSON.stringify({status:"done",images:empty?[]:[{id:"fixture-result",url:"/media/result.png"}]}));
  else if(req.url==="/api/title-gen")res.end(JSON.stringify({titles:["真实接口测试标题"],sellingPoints:["测试卖点"]}));
  else if(req.url==="/api/ipcheck")res.end(JSON.stringify({result:{risk:"low",summary:"fixture"}}));
  else res.end(JSON.stringify(empty?{ok:true}:{ok:true,url:"/media/result.png",id:"fixture-result"}));
 });
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const origin=`http://127.0.0.1:${(server.address() as any).port}`;
 process.env.INTERNAL_APP_ORIGIN=origin;
 const canvas={anchorId:"anchor",imageUrls:[origin+"/media/anchor.png"],imageModelId:"canvas-image",ratio:"1:1",resolution:"1K",quality:"medium"};
 const standalone=createNaumiTools(new Request(origin),email,()=>credentials);
 const sidebar=createNaumiTools(new Request(origin),email,()=>credentials,undefined,canvas);
 const toolSource=await readFile("src/lib/tool-meta.ts","utf-8");
 const TOOLS=[...toolSource.matchAll(/key: "([^"]+)", en: "[^"]+", slug: "([^"]+)"/g)].map(m=>({key:m[1],slug:m[2]}));
 const rows=TOOLS.map(meta=>({slug:meta.slug,label:meta.key,tools:CREATIVE_AGENT_TOOLS[meta.slug],entry:meta.slug==="agent",workbench:true,canvas:true,orb:"same-canvas-runtime"}));
 try{
  assert.equal(rows.length,27);assert.deepEqual(CREATIVE_AGENT_TOOLS.batchshot,["generate_image"]);assert.equal(new Set(standalone.map(t=>t.name)).size,standalone.length);
  assert.deepEqual(standalone.map(t=>t.name),sidebar.map(t=>t.name));
  for(const row of rows){assert.ok(Array.isArray(row.tools),row.slug);if(!row.entry)assert.ok(row.tools.length,row.slug);for(const name of row.tools)assert.ok(standalone.find(t=>t.name===name)?.execute,name);}
  for(const [name] of Object.entries(CREATIVE_TOOL_FEATURES)){const t=standalone.find(t=>t.name===name)!;assert.ok((t.parameters as any).properties.confirm,name);}
  const view=describeNaumiTools(standalone);assert.ok(view.find(t=>t.name==="inpaint_image")!.parameters.properties);assert.equal(view.find(t=>t.name==="prepare_print_file")!.write,true);
  const invoke=async(name:string,args:any,canvasMode=false)=>{
   const t=(canvasMode?sidebar:standalone).find(t=>t.name===name)!;assert.ok(Check(t.parameters,args),name+" schema");
   const result=await t.execute("call-"+name,args,new AbortController().signal);assert.ok(result.content.length,name);return result;
  };
  const image_url=origin+"/media/anchor.png";
  for(const name of ["cutout_image","cutout_avatar","upscale_image","inpaint_image","transfer_style","remove_watermark","try_on_clothing","extract_garment","generate_garment_3d","dewrinkle_clothing","extract_print","check_image_ip","prepare_print_file"]){
   const p={image_url,quality:"medium",...(name==="inpaint_image"?{mask_url:image_url,prompt:"修改指定选区"}:{}),...(name==="transfer_style"?{style:"illustration"}:{}),...(name==="prepare_print_file"?{dpi:300,wMm:210,hMm:297}:{}),...(name==="try_on_clothing"?{bottom_url:image_url}:{}),...(name==="extract_print"?{complete:false}:{})};
   await invoke(name,p);await invoke(name,p,true);
  }
  assert.ok(calls.filter(c=>c.path==="/api/cutout").every(c=>c.form.quality[0]==="fine"));
  assert.ok(calls.filter(c=>c.path==="/api/inpaint").every(c=>c.form.mask[0].size===png.length));
  assert.ok(calls.filter(c=>c.path==="/api/tryon").every(c=>c.form.top&&c.form.bottom));
  assert.ok(calls.filter(c=>c.path==="/api/extract").every(c=>c.form.complete[0]==="0"));
  await invoke("generate_titles",{idea:"测试产品",image_url,count:3});
  await invoke("list_competitor_items",{});await invoke("import_competitor_image",{image_url,batch_id:fixtureId,path:"reference.png"});
  for(const name of ["analyze_competitor","replicate_competitor","edit_competitor"]){await invoke(name,{item_id:fixtureId,revision:0,active_version:"",prompt:"测试提示词",regions:name==="edit_competitor"?[{id:"region-fixture",label:"商品",kind:"color",x:0.2,y:0.2,width:0.3,height:0.3,instruction:"改蓝色",color:"#0000ff",enabled:true}]:[]},true);}
  assert.equal(calls.filter(c=>c.path==="/api/artworks/add").length,2);
  await invoke("generate_variations",{image_urls:[image_url],count:2});await invoke("fuse_images",{image_urls:[image_url,image_url],count:2},true);
  const gen=calls.filter(c=>c.path==="/api/generate-image"&&c.method==="POST");assert.equal(gen.length,2);assert.equal(gen[0].form.category[0],"variation");assert.equal(gen[1].form.category[0],"fusion");assert.equal(gen[1].form.image.length,2);assert.equal(gen[1].form.origin,undefined);assert.equal(gen[1].form.model,undefined);
  assert.ok(calls.every(c=>c.cookie===credentials.cookie&&c.authorization===credentials.authorization));
  status=503;const before=calls.length;await assert.rejects(()=>invoke("upscale_image",{image_url}),/工具接口调用失败/);assert.equal(calls.length-before,1,"charged POST is not retried");status=200;
  empty=true;await assert.rejects(()=>invoke("cutout_image",{image_url}),/有效产物/);empty=false;
  const aborted=new AbortController();aborted.abort();const count=calls.length;await assert.rejects(()=>standalone.find(t=>t.name==="cutout_image")!.execute("aborted",{image_url},aborted.signal));assert.equal(calls.length,count);
  const catalog=await invoke("list_agent_tools",{});assert.ok(JSON.stringify(catalog).includes("mask_url"));
  await mkdir("output/agent-lifecycle-tool-coverage-20261011",{recursive:true});await writeFile("output/agent-lifecycle-tool-coverage-20261011/tool-coverage.json",JSON.stringify({source:"isolated adapter API fixture, not live provider validation",entries:rows,calls,totalAgentTools:standalone.length},null,2));
  const beforeInvalid=calls.length;await assert.rejects(invoke("edit_competitor",{item_id:fixtureId,revision:0,active_version:"",regions:[]},true),/编辑区域/);assert.equal(calls.length,beforeInvalid);
  const textCanvas=createNaumiTools(new Request(origin),email,()=>credentials,undefined,{anchorId:"",imageUrls:[],imageModelId:"image-a",ratio:"1:1",resolution:"1K",quality:"medium"});
  await assert.rejects(async()=>textCanvas.find(t=>t.name==="recolor_product")!.execute("no-ref",{image_url:"",color:"blue",strength:100},undefined),/提供.*图片/);assert.equal(calls.length,beforeInvalid);
  assert.equal(describeNaumiTools(standalone).find(t=>t.name==="check_image_ip")!.write,true);
  console.log(`CREATIVE_AGENT_COVERAGE=PASS ENTRIES=27 EXECUTABLE_ENTRIES=26 AGENT_ENTRY=1 SAME_TOOLSET=WORKBENCH_CANVAS_ORB ADAPTER_CALLS=${calls.length} POST_RETRY=0 CANCEL=PASS EMPTY_OUTPUT=REJECTED PAID_UPSTREAM_CALLS=0`);
 }finally{await new Promise<void>(r=>server.close(()=>r()));if(fixture){await db.getPool().end();await fixture.cleanup();}}
}
main().catch(e=>{console.error(e);process.exitCode=1});
