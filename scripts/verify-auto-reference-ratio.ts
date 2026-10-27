/** Local image bytes and real pure/normalization functions; no DB or supplier. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import ts from "typescript";
import { exactImageRequestSize, exactRatioPixels } from "../src/lib/imagegen/request-size";
import { automaticFrameRatio, defaultFrameSource } from "../src/lib/imagegen/frame-ratio";
import { normalizeLegacyFrameRequest } from "../src/lib/imagegen/legacy-frame-request";
import { imagegenRequestSchema } from "../src/lib/imagegen/schema";
import { imageRequestAdmission } from "../src/lib/imagegen/request-admission";
import { mapResolution } from "../src/lib/model-config/resolution-policy";

const baseline = process.argv.includes("--baseline");
let checks=0;
const check=(value:unknown,message:string)=>{assert.ok(value,message);checks++;};
const request=(ratio="auto")=>imagegenRequestSchema.parse({version:1,operationId:"1472c152-3faa-4f06-a047-815e3f34848f",entry:"canvas",mode:"edit",prompt:"Keep the entire reference layout",inputs:[{artworkId:"fixture",role:"edit-target"}],parameters:{ratio}});
async function legacy(width:number,height:number,ratio="auto",orientation?:number){
 const image=sharp({create:{width,height,channels:3,background:"#638467"}});
 const bytes=orientation?await image.jpeg().withMetadata({orientation}).toBuffer():await image.png().toBuffer();
 const form=new FormData();form.set("origin","canvas");form.set("prompt","Keep the entire reference layout");form.set("ratio",ratio);form.set("image",new File([new Uint8Array(bytes)],"fixture.png"));
 const req=new Request("http://fixture/api/generate-image",{method:"POST",body:form});
 const normalized=await normalizeLegacyFrameRequest(req);return {original:req,normalized,form:await normalized.formData()};
}
async function main(){
 if(baseline){
  assert.throws(()=>exactImageRequestSize("658:877","gpt-image-2",true));
  assert.throws(()=>automaticFrameRatio(request(),[{artworkId:"fixture",role:"edit-target",width:1316,height:1755}],"edit"));
  await assert.rejects(legacy(1060,1580),/比例暂未开放/);
  console.log("BASELINE=REPRODUCED CUSTOM_SIZE=REJECTED COPRIME_REFERENCE=REJECTED LEGACY_AUTO_53_79=REJECTED SUPPLIER_CALLS=0");return;
 }
 const models=["gpt-image-2","gpt-image-2-2026-04-21","gpt-image-2.5-flare","gpt-image-2.5-sunburst-2026-09-08"];
 for(const model of models)for(const [rw,rh] of [[53,79],[658,877],[1316,1755],[877,658],[9,21],[3,1],[1,3],[99991,100000]]){
  const ratio=`${rw}:${rh}`;const size=exactImageRequestSize(ratio,model,true)!;const [w,h]=size.split("x").map(Number);
  check(w%16===0&&h%16===0&&Math.max(w,h)<=1536&&w*h>=655360&&w*h<=1572864,"bounded native grid, not more expensive huge exact pixels");
  check(Math.max(w/h,h/w)<=3,"supplier aspect limit");
  check(Math.abs(w/h-rw/rh)/(rw/rh)<0.012,"follow reference within the native grid, not broad direction or square fallback");
  if(ratio==="53:79")check(w*rh===h*rw,"representable ratio stays exact");
 }
 for(const ratio of ["0:1","1:0","NaN:1","100:1","1:100","3.1:4","1:2:3","1000000:1"]){assert.throws(()=>exactImageRequestSize(ratio,"gpt-image-2",true));checks++;}
 check(exactImageRequestSize("3:4","gpt-image-2",true)==="1152x1536","standard pixels unchanged");
 check(exactImageRequestSize("auto","gpt-image-2",true)==="auto","text-only auto unchanged");
 check(exactImageRequestSize("53:79","gpt-image-1",true)===undefined,"old model not granted custom support by name resemblance");
 assert.throws(()=>exactImageRequestSize("53:79","gpt-image-2"));checks++;
 const odd=request();const before=JSON.stringify(odd);
 check(automaticFrameRatio(odd,[{...odd.inputs[0],width:1316,height:1755}],"edit")==="1316:1755","coprime frame accepted");
 check(JSON.stringify(odd)===before,"caller and fingerprint unchanged");
 const target={artworkId:"product",role:"edit-target" as const,width:1024,height:1024},ref={artworkId:"layout",role:"reference" as const,width:1060,height:1580};
 check(defaultFrameSource([target,ref])===ref,"layout reference not square product supplies frame");
 check(defaultFrameSource([ref,target])===ref,"role not array order");
 check(defaultFrameSource([target,ref,{artworkId:"mask",role:"mask"}])===target,"mask retains target canvas");
 check(automaticFrameRatio(request("3:4"),[target,ref],"edit")===undefined,"explicit choice wins");
 check(automaticFrameRatio(odd,[target,ref,{...ref,artworkId:"second-ref",width:530,height:790}],"edit")==="53:79","same ratio references agree independently of dimensions");
 assert.throws(()=>automaticFrameRatio(odd,[target,ref,{...ref,artworkId:"wide-ref",width:1580,height:1060}],"edit"),/参考图比例不同/);checks++;
 check(automaticFrameRatio({...odd,inputs:[]},[],"generate")===undefined,"text-only auto unchanged");
 for(const [w,h,ratio] of [[1060,1580,"53:79"],[1316,1755,"1316:1755"],[750,1000,"3:4"]] as const){const result=await legacy(w,h);check(result.form.get("ratio")===ratio,"legacy auto follows decoded pixels");}
 check((await legacy(1060,1580,"3:4")).form.get("ratio")==="3:4","legacy explicit choice wins");
 check((await legacy(1060,1580,"auto",6)).form.get("ratio")==="79:53","EXIF display orientation");
 const up={model:"gpt-image-2",parameterMap:{}};
 check(imageRequestAdmission("658:877","gpt-image-2",false,up).length===0,"new admission accepts supported grid contract");
 // Follow-reference ratios outside the channel's named list ride the gpt-image
 // exact pixel contract instead of being rejected (apib probe 2026-10-27:
 // size=960x1248 accepted, output exactly those pixels).
 check(imageRequestAdmission("658:877","gpt-image-2",false,{...up,parameterMap:{apimartImages:{ratios:["3:4"]}}}).length===0,"unlisted custom ratio rides exact pixel contract");
 check(imageRequestAdmission("658:877","gemini-3.0-pro-image-portrait",false,{model:"gemini-3.0-pro-image-portrait",parameterMap:{apimartImages:{ratios:["3:4"]}}}).includes("ADAPTER_RATIO_UNSUPPORTED"),"models without the exact-size contract stay allowlist-bound");
 check(JSON.stringify(exactRatioPixels("277:360","gpt-image-2"))===JSON.stringify({width:960,height:1248}),"probe ratio sizes to the verified grid");
 check(exactRatioPixels("277:360","wire-image-one")===undefined && exactRatioPixels("auto","gpt-image-2")===undefined,"pixel helper is contract-scoped");
 check(exactRatioPixels("100:1","gpt-image-2")===undefined && exactRatioPixels("NaN:1","gpt-image-2")===undefined,"unrepresentable ratios remain admission rejections rather than throwing");
 check(imageRequestAdmission("100:1","gpt-image-2",false,{...up,parameterMap:{apimartImages:{ratios:["3:4"]}}}).includes("ADAPTER_RATIO_UNSUPPORTED"),"unsupported custom ratio keeps controlled rejection");
 check(imageRequestAdmission("1:1","gpt-image-2",false,{...up,parameterMap:{apimartImages:{ratios:["3:4"]}}}).includes("ADAPTER_RATIO_UNSUPPORTED"),"explicitly excluded named ratio remains excluded");
 const mapped:Record<string,unknown>={size:"848x1264",quality:"medium"};mapResolution(mapped,{mode:"map",field:"size",values:{"4K":"1024x1024"}},"4K","53:79");
 check(mapped.size==="1024x1024","administrator explicit size overrides suggested auto frame");
 const source=require("./lib/image-generation-source.cjs")(),ast=ts.createSourceFile("route.ts",source,99,true);
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==="sizeFor")!;
 const js=ts.transpileModule(node.getText(ast)+";return sizeFor;",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const sizeFor=new Function("exactImageRequestSize",js)(exactImageRequestSize);
 check(sizeFor("658:877","gpt-image-2",true,true)===exactImageRequestSize("658:877","gpt-image-2",true),"real route size function uses new contract");
 assert.throws(()=>sizeFor("658:877","gpt-image-2",true,false));checks++;
 check(sizeFor("658:877","gpt-image-2",false)==="1024x1536","old unversioned frozen directional behavior unchanged");
 check(source.includes("currentImagegenStep()!.ratioContractVersion : 2"),"new HTTP contract stamped internally, no client opt-out");
 console.log(`MODIFIED=PASS CHECKS=${checks} AUTO_REFERENCE=CUSTOM_GRID LEGACY_AUTO=SUPPORTED EXIF=RESPECTED ROLE_SELECTION=REFERENCE ADMIN_MAPPING=UNCHANGED FROZEN_V1=UNCHANGED SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
