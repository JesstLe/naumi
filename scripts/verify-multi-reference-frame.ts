/** Real ratio resolver, Sharp decoding and canvas submitter; fixture HTTP only. */
import assert from "node:assert/strict";
import sharp from "sharp";
import {automaticFrameRatio,defaultFrameSource} from "../src/lib/imagegen/frame-ratio";
import {imagegenRequestSchema} from "../src/lib/imagegen/schema";
import {normalizeLegacyFrameRequest} from "../src/lib/imagegen/legacy-frame-request";
import {submitCanvasImagegen} from "../src/lib/imagegen/canvas-client";
import {ImagegenPreparationCancelled} from "../src/lib/imagegen/http";
import {canvasReceipts,saveCanvasReceipt} from "../src/lib/imagegen/canvas-receipts";

class MemoryStorage implements Storage {
  values=new Map<string,string>();get length(){return this.values.size;}
  key(n:number){return [...this.values.keys()][n]??null;}getItem(k:string){return this.values.get(k)??null;}
  setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}clear(){this.values.clear();}
}
let cases=0;const check=(ok:unknown,label:string)=>{assert.ok(ok,label);cases++;};
const req=()=>imagegenRequestSchema.parse({version:1,operationId:crypto.randomUUID(),entry:"canvas",mode:"edit",prompt:"多图合成",inputs:[{artworkId:"product",role:"edit-target"}],parameters:{ratio:"auto"}});
const target={artworkId:"product",role:"edit-target" as const,width:1000,height:1000};
const a={artworkId:"layout1",role:"reference" as const,width:750,height:1000};
const b={artworkId:"layout2",role:"reference" as const,width:1500,height:2000};

async function main(){
  check(automaticFrameRatio(req(),[target,a,b],"edit")==="3:4","same-ratio multiple references must not block generation");
  for(const inputs of [[target,b,a],[a,target,b],[b,a,target]])check(automaticFrameRatio(req(),inputs,"edit")==="3:4","order/size independent consensus");
  check(defaultFrameSource([target,a,b])?.artworkId!==target.artworkId,"square product does not override layout consensus");
  check(automaticFrameRatio(req(),[target,a,b,{artworkId:"style",role:"style",width:2000,height:500}],"edit")==="3:4","style does not affect frame");
  check(automaticFrameRatio(req(),[target,a,b],"edit","style-transfer")==="1:1","target-edit retains target");
  check(automaticFrameRatio(req(),[target,a,b,{artworkId:"mask",role:"mask"}],"edit")==="1:1","mask retains target");
  const mixed=[target,a,{...b,width:2000}];assert.throws(()=>automaticFrameRatio(req(),mixed,"edit"),/参考图比例不同/);cases++;
  check(automaticFrameRatio({...req(),parameters:{ratio:"9:16"}},mixed,"edit")===undefined,"explicit ratio wins");
  check(automaticFrameRatio({...req(),parameters:{width:768,height:1024}},mixed,"edit")===undefined,"explicit pixels win");
  check(automaticFrameRatio(req(),mixed,"cutout")===undefined,"cutout unchanged");
  check(automaticFrameRatio(req(),mixed,"postprocess")===undefined,"postprocess unchanged");
  check(automaticFrameRatio({...req(),mode:"generate",inputs:[]},[],"generate")===undefined,"text-only auto unchanged");
  assert.throws(()=>automaticFrameRatio(req(),[target,a,{...b,width:undefined}],"edit"),/画幅读取失败/);cases++;
  const image=async(w:number,h:number,orientation?:number)=>{
    const s=sharp({create:{width:w,height:h,channels:3,background:"#8496ae"}});
    const bytes=orientation?await s.jpeg().withMetadata({orientation}).toBuffer():await s.png().toBuffer();
    return new File([new Uint8Array(bytes)],"fixture.png",{type:orientation?"image/jpeg":"image/png"});
  };
  const files=[await image(100,100),await image(75,100),await image(150,200)];
  const form=(ratio="auto",inputs=files)=>{const f=new FormData();f.set("prompt","多图合成");f.set("origin","canvas");f.set("ratio",ratio);f.set("model","gpt-image-2");f.set("imagegenNodeId","node-fixture");inputs.forEach(file=>f.append("image",file));return f;};
  const legacy=await normalizeLegacyFrameRequest(new Request("http://fixture/api/generate-image",{method:"POST",body:form()}));
  const normalized=await legacy.formData();check(normalized.get("ratio")==="3:4"&&normalized.getAll("image").length===3,"legacy same ratio retains all reference files");
  const rotated=form();rotated.delete("image");for(const file of [files[0],files[1],await image(100,75,6)])rotated.append("image",file);
  check((await(await normalizeLegacyFrameRequest(new Request("http://fixture/api/generate-image",{method:"POST",body:rotated}))).formData()).get("ratio")==="3:4","legacy compares EXIF oriented dimensions");
  const conflict=form();conflict.delete("image");for(const file of [files[0],files[1],await image(100,75)])conflict.append("image",file);
  await assert.rejects(normalizeLegacyFrameRequest(new Request("http://fixture/api/generate-image",{method:"POST",body:conflict})),/参考图比例不同/);cases++;
  const bad=form();bad.delete("image");for(const file of [files[0],files[1],new File(["invalid"],"bad.png")])bad.append("image",file);
  await assert.rejects(normalizeLegacyFrameRequest(new Request("http://fixture/api/generate-image",{method:"POST",body:bad})),/读取失败/);cases++;

  const oldFetch=globalThis.fetch;
  try{
    for(const scenario of ["same","mixed","explicit","cancel","scope-change","invalid-choice","resume"]){
      const storage=new MemoryStorage();Object.assign(globalThis,{sessionStorage:storage,window:{localStorage:new MemoryStorage(),confirm:()=>true}});
      let uploads=0,plans=0,posts=0,choices=0,current=true;const payloads:any[]=[];
      const scope={owner:"fixture@example.test",project:"tree:fixture",isCurrent:()=>current,chooseFrame:async(items:{artworkId:string;ratio:string}[])=>{
        choices++;check(plans===0&&posts===0&&canvasReceipts(storage,scope.owner,scope.project).length===0,"choice precedes plan, paid submit and receipt");
        check(items.length===2&&items.map(i=>i.ratio).join(",")==="3:4,4:3","choice uses actual layout candidates");
        if(scenario==="cancel")return null;if(scenario==="scope-change")current=false;
        return scenario==="invalid-choice"?"foreign":items[1].artworkId;
      }};
      globalThis.fetch=async(input,init)=>{
        const path=String(input);
        // Deliberately report square transport metadata: composition and the
        // choice UI must still use dimensions decoded from the original File.
        if(path.endsWith("/inputs")){uploads++;return Response.json({artworkId:`asset-${uploads}`,url:`/media/asset-${uploads}.png`,width:100,height:100});}
        const raw=JSON.parse(String(init?.body));payloads.push(raw);
        if(path.endsWith("/plan")){plans++;return Response.json({request:raw,steps:[{operation:"edit"}],intent:{background:null},totalCredits:6,billingVersion:8,modelVersion:125,warnings:[],confirmationRequired:false});}
        posts++;return Response.json({id:raw.operationId});
      };
      if(scenario==="resume")saveCanvasReceipt(storage,scope.owner,scope.project,{id:crypto.randomUUID(),nodeId:"node-fixture",modelId:"gpt-image-2",x:1,y:2});
      const scenarioFiles=scenario==="same"?files:[files[0],files[1],await image(100,75)];
      const run=submitCanvasImagegen(form(scenario==="explicit"?"9:16":"auto",scenarioFiles),"node-fixture",undefined,scope);
      if(["cancel","scope-change","invalid-choice"].includes(scenario)){
        await assert.rejects(run,error=>scenario!=="cancel"||error instanceof ImagegenPreparationCancelled);cases++;
        check(posts===0&&plans===0&&canvasReceipts(storage,scope.owner,scope.project).length===0,"dismissal/stale/invalid selection creates no task or receipt");
      }else{
        await run;
        if(scenario==="resume")check(uploads===0&&posts===0&&plans===0&&choices===0,"existing receipt bypasses all preparation and submission");
        else{
          check(posts===1&&plans===1&&uploads===3,"one plan and one submit, no repeated uploads");
          check(payloads[0].parameters.ratio===(scenario==="same"?"3:4":scenario==="explicit"?"9:16":"4:3"),"original source consensus or explicit user choice preserved before plan");
          check(payloads[1].parameters.ratio===payloads[0].parameters.ratio&&payloads[1].operationId===payloads[0].operationId,"same user request identity submitted once");
          check(choices===(scenario==="mixed"?1:0),"no interruption for same or explicit ratio");
        }
      }
    }
  }finally{globalThis.fetch=oldFetch;}
  console.log(`MULTI_REFERENCE_FRAME=PASS CASES=${cases} SAME_RATIO=CONSENSUS MIXED_RATIO=USER_CHOICE LEGACY=DECODED CANCEL_POSTS=0 RESUME_POSTS=0 SUPPLIER_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
