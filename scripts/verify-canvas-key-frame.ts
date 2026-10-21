import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {resolve} from "node:path";
import {readFileSync} from "node:fs";
import sharp from "sharp";
const source=resolve(process.env.SOURCE_ROOT||"."),require=createRequire(resolve(source,"package.json"));
const {automaticFrameRatio,defaultFrameSource}=require(source+"/src/lib/imagegen/frame-ratio.ts");
const {imagegenRequestSchema}=require(source+"/src/lib/imagegen/schema.ts");
const parameters=require(source+"/src/lib/canvas/generation-parameters.ts");
const baseline=process.argv.includes("--baseline");let cases=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);cases++;};
const req=(extra:any={})=>{if(extra.inputs)extra={...extra,inputs:extra.inputs.map(({artworkId,role}:any)=>({artworkId,role}))};return imagegenRequestSchema.parse({version:1,operationId:crypto.randomUUID(),entry:"canvas",mode:"edit",prompt:"将产品替换到布局图，沿用布局",inputs:[{artworkId:"product",role:"edit-target"},{artworkId:"layout",role:"reference"}],parameters:{ratio:"auto"},...extra});};
const product={artworkId:"product",role:"edit-target",width:1000,height:1000},layout={artworkId:"layout",role:"reference",width:750,height:2250};
async function main(){
 const canvas=readFileSync(source+"/src/components/canvas/canvas-client.tsx","utf8"),agent=readFileSync(source+"/src/lib/agent/canvas.ts","utf8");
 if(baseline){
  check(parameters.normalizeCanvasRatio("1:3")==="auto","long ratio lost");
  check(parameters.validateCanvasParameters({ratio:"1:2"})!==null,"long canvas rejected");
  check(!parameters.canvasCombinationSupported({combinations:["1K:3:4"]},"auto","1K"),"auto falsely square");
  check(canvas.includes('ratio: genRatio === "auto" ? source?.ratio || "1:1" : genRatio'),"canvas auto rewritten");
  check(agent.includes('anchor?.ratio || "1:1"'),"agent auto rewritten");
  check(!imagegenRequestSchema.safeParse({...req(),frameSourceId:"layout"}).success,"key frame absent");
  console.log("BASELINE=REPRODUCED CASES=6 LONG_1:2=REJECTED LONG_1:3=auto AUTO_PORTRAIT_COMBO=false AGENT_AUTO=1:1 FRAME_SOURCE=UNSUPPORTED");return;
 }
 check(!parameters.CANVAS_RATIO_OPTIONS.some((r:any)=>r.id==="1:3"),"no separate long-image preset");
 for(const ratio of ["1:2","2:1","1:3","3:1","1:4","4:1","47:113"]){
  check(parameters.normalizeCanvasRatio(ratio)===ratio,"preserve long/custom ratio "+ratio);
  check(parameters.validateCanvasParameters({ratio})===null,"admission syntax "+ratio);
 }
 for(const ratio of ["0:1","-1:3","1:0","1.5:2","NaN:1","1:2x"]){check(parameters.normalizeCanvasRatio(ratio)==="auto","invalid normalize");check(!!parameters.validateCanvasParameters({ratio}),"invalid rejected");}
 check(parameters.canvasCombinationSupported({combinations:["1K:3:4"]},"auto","1K"),"auto not square");
 check(!parameters.canvasCombinationSupported({combinations:["1K:3:4"]},"auto","4K"),"no nonexistent resolution");
 check(!parameters.canvasCombinationSupported({combinations:["1K:3:4"]},"1:1","1K"),"explicit combo authoritative");
 check(parameters.canvasModelParameters({ratios:["47:113","1:2"],resolutions:["2K"]}).ratios.join(",")==="auto,47:113,1:2","declared ratios visible not expanded");
 for(const inputs of [[product,layout],[layout,product]]){
  const request=req({inputs,frameSourceId:"layout"});check(automaticFrameRatio(request,inputs,"edit")==="1:3","semantic layout independent of upload order");
  check(automaticFrameRatio({...request,parameters:{ratio:"3:4"}},inputs,"edit")===undefined,"explicit user wins");
  check(automaticFrameRatio({...request,parameters:{width:768,height:1024}},inputs,"edit")===undefined,"explicit pixels win");
 }
 const roles=[{...product,role:"insert"},{...layout,role:"edit-target"},{artworkId:"style",role:"style",width:2000,height:100}];
 check(automaticFrameRatio(req({inputs:roles}),roles,"edit")==="1:3","insert and style do not override target");
 check(automaticFrameRatio(req(),[product,layout],"edit")==="1:3","explicit role compatibility");
 const request=req({framePolicy:"all-inputs"});
 assert.throws(()=>automaticFrameRatio(request,[product,layout],"edit"),/参考图比例不同/);cases++;
 check(automaticFrameRatio(request,[layout,{...product,width:100,height:300}],"edit")==="1:3","implicit same-ratio consensus");
 check(automaticFrameRatio(req({inputs:[{...layout,role:"edit-target"}]}),[layout],"edit")==="1:3","actual dimensions without ratio metadata");
 check(automaticFrameRatio(request,[product,layout],"cutout")===undefined,"cutout preserved");
 check(automaticFrameRatio(request,[product,layout],"postprocess")===undefined,"postprocess preserved");
 check(!imagegenRequestSchema.safeParse({...req(),frameSourceId:"foreign"}).success,"foreign frame rejected");
 check(!imagegenRequestSchema.safeParse({...req(),inputs:[product,{artworkId:"mask",role:"mask"}],frameSourceId:"mask"}).success,"mask not layout");
 assert.throws(()=>automaticFrameRatio(req({frameSourceId:"layout"}),[product,{...layout,width:undefined}],"edit"),/画幅读取失败/);cases++;
 check(!canvas.includes('ratio: genRatio === "auto" ? source?.ratio || "1:1" : genRatio'),"canvas does not rewrite auto");
 check(!agent.includes('anchor?.ratio || "1:1"'),"agent does not rewrite auto");
 const {expansionUsesMask}=require(source+"/src/lib/canvas/expand-capabilities.ts");
 const scope:any={connection:{protocol:"openai-images"},capabilities:{imagegen:{mask:{state:"supported"}}}};
 check(expansionUsesMask(null),"legacy mask compatibility");check(expansionUsesMask(scope),"verified mask used");
 check(!expansionUsesMask({...scope,capabilities:{}}),"edit-only works without mask");
 check(!expansionUsesMask({...scope,connection:{protocol:"new-api-flow"}}),"Flow mask omitted");
 check(!expansionUsesMask({...scope,businessOption:{parameters:{inputTypes:["image"]}}}),"admin mask restriction preserved");
 check(!expansionUsesMask({...scope,supplierRouting:{targets:[{scope},{scope:{...scope,capabilities:{}}}]}}),"mixed fallback no unsupported mask");
 check(expansionUsesMask({...scope,routing:{targets:{a:scope,b:scope}}}),"all frozen candidates mask support");
 const {imageRequestAdmission}=require(source+"/src/lib/imagegen/request-admission.ts");
 check(imageRequestAdmission("1:3","gpt-image-2",true,{model:"gpt-image-2",parameterMap:{}}).length===0,"native 1:3 allowed");
 check(imageRequestAdmission("1:4","gpt-image-2",true,{model:"gpt-image-2",parameterMap:{}}).includes("EXACT_RATIO_UNSUPPORTED"),"real upstream physical limit not bypassed");
 check(imageRequestAdmission("1:4","long-native",false,{model:"long-native",parameterMap:{apimartImages:{ratios:["1:4"]}}}).length===0,"long-native 1:4 allowed");
 check(imageRequestAdmission("1:4","long-native",false,{model:"long-native",parameterMap:{apimartImages:{ratios:["1:2"]}}}).includes("ADAPTER_RATIO_UNSUPPORTED"),"admin adapter ratios remain authoritative");
 const {normalizeAplusFrameRequest}=require(source+"/src/lib/imagegen/aplus-frame-request.ts");
 const make=async(w:number,h:number,orientation?:number)=>{let image=sharp({create:{width:w,height:h,channels:3,background:"#64748b"}});return new File([new Uint8Array(await(orientation?image.jpeg().withMetadata({orientation}).toBuffer():image.png().toBuffer()))],"frame.png",{type:orientation?"image/jpeg":"image/png"});};
 for(const scenario of ["single","same","mixed","selected","explicit","exif"]){
  const form=new FormData();form.set("format",scenario==="explicit"?"3:4":"auto");form.set("prepared","1");form.append("image",await make(100,300));
  if(scenario!=="single")form.append("image",await make(scenario==="same"?200:300,scenario==="same"?600:100,scenario==="exif"?6:undefined));
  if(scenario==="selected")form.set("frameSourceIndex","1");
  const raw=new Request("http://local/api/aplus",{method:"POST",body:form}),rawBytes=await raw.clone().text();
  if(scenario==="mixed"){await assert.rejects(()=>normalizeAplusFrameRequest(raw),/参考图比例不同/);cases++;continue;}
  const result=await normalizeAplusFrameRequest(raw),normalized=await result.formData();
  const ratio=scenario==="explicit"?"3:4":scenario==="selected"?"3:1":"1:3";
  check(normalized.get("format")===ratio&&normalized.get("ratio")===ratio,"Aplus freeze "+scenario);
  check(await raw.text()===rawBytes,"raw receipt not mutated");
 }
 console.log(`KEY_FRAME=PASS CASES=${cases} SEMANTIC_LAYOUT=ORDER_INDEPENDENT ACTUAL_RATIO=1:3 EXPLICIT=3:4 EXTRA_LONG_UI=NONE ADMIN_MAPPING=RETAINED AUTO_COMBO=ANY_SUPPORTED FRAME_HINT=VALIDATED APLUS=FROZEN EXTERNAL_SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
