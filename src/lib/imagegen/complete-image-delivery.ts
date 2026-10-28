import {createImageDeliveryBytes} from "./delivery-bytes";
import "server-only";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {addArtworksTx,ensureTemplateRoot} from "@/lib/artworks/writer";
import {getPool} from "@/platform/db/pool";
import {readCanvasOutput} from "../canvas-image-input";
import { storageEnabled,dataUrlToBytes } from "../object-storage/runtime";
import { uploadImage } from "../media-upload";
import {runPostprocess,PostprocessPending} from "../media-postprocess";
import {provenanceEntry} from "../artwork-provenance";
import type {Postprocess} from "../model-config/business-schema";
import type {ImageRatioValidationPolicy} from "./request-size";
import type {GenParams,GeneratedImage} from "./generation-types";
import type {StoredImage} from "./delivery-checkpoint";
import type {ImagegenResult} from "./types";
import {finishStoredImage} from "./finish-stored-image";
import {inspectImagegenPixels} from "./postprocess";
import {imageOutputNotice,imageRatioWarning} from "./output-advisory";
import {JOBS} from "./generation-jobs";
import {readDeliveryBilling} from "./delivery-billing";

export type DeliveryPolicy={known:boolean;modelVersion?:number;imageParameterPlanVersion?:1;post?:Postprocess;preset:boolean;ratio?:ImageRatioValidationPolicy};
type DeliveryInput={
  jobId:string;owner:string;params:Partial<GenParams>;images:StoredImage[];final:boolean;
  policy:DeliveryPolicy;useDb:boolean;legacyCost:number;recovery?:boolean;mock?:boolean;
  sourceNodeId?:string;entry?:string;transparent?:boolean;
  stage:(stage:string)=>void;
};
const PROCESSING_WARNING="图片已生成，附加尺寸处理未完成，已保留完整原图";
const dimensions=async(bytes:Buffer)=>{const m=await sharp(bytes).metadata();return m.orientation&&m.orientation>=5?{width:m.height,height:m.width}:{width:m.width,height:m.height};};
const ratio=(w:number,h:number)=>{const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;const d=gcd(w,h);return `${w/d}:${h/d}`;};

async function existingArtwork(id:string,owner:string,useDb:boolean){
  if(!useDb)return undefined;
  const row=(await getPool().query<{email:string;deleted_at:unknown;image_url:string}>("SELECT email,deleted_at,image_url FROM app_artworks WHERE id=$1",[id])).rows[0];
  if(row&&(row.email!==owner||row.deleted_at))throw Error("原结果已删除或无权恢复");
  return row;
}

/** One local continuation, shared by leased execution and terminal recovery.
 * Inputs are paid bytes plus frozen facts, never a supplier/client/current plan.
 * The callers own their lease/recovery lock and final parent receipt transaction. */
export async function completeImageDelivery(input:DeliveryInput){
  const {jobId,policy,useDb,stage}=input,owner=input.owner.toLowerCase(),p=input.params;
  const saved=await JOBS.get(jobId,false);
  const notice=imageOutputNotice(saved?.imagegenOutputError,saved?.imagegenOutputWarning,!!saved?.images?.length);
  let imagegenOutputError=notice.error,complete=input.final?saved?.deliveryComplete!==false:true;
  const warnings=new Set<string>(notice.warning?[notice.warning]:[]),images:GeneratedImage[]=[],artifacts:ImagegenResult["artifacts"]=[];
  if(!policy.known){complete=false;warnings.add("已保留原图，原处理配置缺失，未按当前配置改写");}
  const fresh:GeneratedImage[]=[],deliveryBytes=createImageDeliveryBytes(dataUrlToBytes);
  for(const [index,image] of input.images.entries()){
    try {
    const baseId=`art-${jobId}-${index}`;
    let id=input.final&&image.id===baseId+"-delivery"?image.id:baseId,existing=await existingArtwork(id,owner,useDb);
    const metadata={id,gradient:"",prompt:p.userPrompt||p.prompt||"",ratio:p.ratio||"",createdAt:new Date(saved?.createdAt||Date.now()).toISOString(),...image};
    // Database-free preview images are not paid checkpoints and need no fetch.
    if(input.mock&&!image.url.startsWith("data:")&&!image.url.startsWith("/media/")){
      const result={...metadata,id} as GeneratedImage;images.push(result);if(!existing)fresh.push(result);continue;
    }
    stage("output-processing");
    const source=await readCanvasOutput(input.final&&existing?existing.image_url:image.url,"http://internal",owner,deliveryBytes);
    let bytes=source.buffer,processingKind=metadata.processingKind,postprocessStatus=metadata.postprocessStatus;
    const transparent=input.transparent??p.transparent;
    if(transparent){const pixels=await inspectImagegenPixels(bytes);if(!pixels.transparentPixels||!pixels.visiblePixels){imagegenOutputError="模型未返回有效透明主体；已生成原图保留，请调整透明能力配置";complete=false;}}
    const nativeRatio=!policy.post?.enabled&&!policy.preset&&!(p.targetWidth&&p.targetHeight);
    if(!input.final&&nativeRatio&&p.ratioContractVersion&&p.origin==="canvas"){
      const warning=imageRatioWarning(p.ratio||"",await dimensions(bytes),policy.ratio);if(warning)warnings.add(warning);
    }
    if(!input.final&&!imagegenOutputError){
      if(!policy.known){complete=false;warnings.add("已保留原图，原处理配置缺失，未按当前配置改写");}
      else if(policy.post?.enabled){
        // Same stage identity, original base digest and attempt budget on BOTH entrances.
        try{
          const result=await runPostprocess({id:`${jobId}:postprocess:${index}`,parentId:jobId,email:owner,modelVersion:policy.modelVersion!,bytes,policy:policy.post});
          bytes=(await readCanvasOutput(result.url,"http://internal",owner,deliveryBytes)).buffer;
          processingKind=result.kind;postprocessStatus=result.status;
          if(result.status!=="succeeded"){complete=false;warnings.add(PROCESSING_WARNING);}
        }catch(error){
          // Active execution retains the existing stage lease/backoff. Terminal
          // recovery can deliver its known base, never claim the held stage done.
          if(!input.recovery||!(error instanceof PostprocessPending))throw error;
          complete=false;postprocessStatus="pending";warnings.add(PROCESSING_WARNING);
        }
      }else{
        try{bytes=await finishStoredImage(bytes,{final:false,preset:policy.preset,imageParameterPlanVersion:policy.imageParameterPlanVersion,resolution:p.resolution,targetWidth:p.targetWidth,targetHeight:p.targetHeight,transparent});}
        catch{complete=false;warnings.add(PROCESSING_WARNING);}
      }
    }
    if(postprocessStatus==="failed-kept-base"){complete=false;warnings.add(PROCESSING_WARNING);}
    // An older partial recovery or a user edit is immutable. A transformed
    // result gets a deterministic derivative, never an overwrite or resurrection.
    if(existing&&!input.final&&!bytes.equals(source.buffer)){
      const prior=(await readCanvasOutput(existing.image_url,"http://internal",owner,deliveryBytes)).buffer;
      if(!bytes.equals(prior)){id+="-delivery";existing=await existingArtwork(id,owner,useDb);}
    }
    if(existing)bytes=(await readCanvasOutput(existing.image_url,"http://internal",owner,deliveryBytes)).buffer;
    const pixels=await inspectImagegenPixels(bytes),meta=await sharp(bytes).metadata();
    if(!pixels.visiblePixels)throw Error("原结果没有可见图片内容");
    if(transparent&&!pixels.transparentPixels){complete=false;warnings.add("已保留生成图片，实际图片不是透明背景");}
    if(!nativeRatio&&p.ratioContractVersion&&p.origin==="canvas"&&!(p.targetWidth&&p.targetHeight)){
      const warning=imageRatioWarning(p.ratio||"",pixels,policy.ratio);if(warning)warnings.add(warning);
    }
    const mime=meta.format==="jpeg"?"image/jpeg":`image/${meta.format}`,ext=meta.format==="jpeg"?"jpg":meta.format!;
    stage("storage");
    let url=existing?.image_url;
    if(!url&&storageEnabled)try{url=await uploadImage(bytes,mime,`image-delivery/${jobId}/${createHash("sha256").update(bytes).digest("hex")}.${ext}`,undefined,owner);}
    catch{warnings.add("图片已保留，独立媒体保存暂未完成");}
    // Retain the established inline fallback. A storage outage must not discard
    // a valid paid result already durably checkpointed in the job/DB.
    url||=deliveryBytes.encode(bytes,mime);
    const result={...metadata,id,url,width:pixels.width,height:pixels.height,ratio:ratio(pixels.width,pixels.height),processingKind,postprocessStatus} as GeneratedImage;
    images.push(result);artifacts.push({artworkId:id,url,mime,...pixels});if(!existing)fresh.push(result);
    } finally { deliveryBytes.clear(); }
  }
  let sourceUrl=saved?.sourceUrl||null;
  const first=p.images?.[0];
  if(!sourceUrl&&first&&storageEnabled&&Buffer.isBuffer(first.buf))try{
    const mime=first.type||"image/png";sourceUrl=await uploadImage(first.buf,mime,`sources/${jobId}.${mime.split("/")[1]||"png"}`,undefined,owner);
  }catch{/* Source preview is optional; original input remains in the job payload. */}
  const imagegenOutputWarning=[...warnings].join("；")||undefined;
  stage("image-checkpoint");
  await JOBS.patch(jobId,{images,sourceUrl,deliveryComplete:complete,imagegenOutputError,imagegenOutputWarning});
  if(useDb){
    let parent=p.parentId||null;
    if(!parent&&p.templateId&&p.templateImage)parent=await ensureTemplateRoot(owner,{templateId:p.templateId,image:p.templateImage,prompt:p.templatePrompt||p.prompt||"",title:p.templatePrompt||p.prompt||""}).catch(()=>null);
    const lineage=await listArtworksByIds(owner,[...new Set([parent,input.sourceNodeId,...(p.parentIds||[])].filter((id):id is string=>!!id))]);
    const root=lineage.find(work=>work.id===parent)||lineage[0];
    stage("artworks");
    const tx=await getPool().connect();try{
      await tx.query("BEGIN");
      const current=(await tx.query("SELECT id,email,deleted_at FROM app_artworks WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",[images.map(image=>image.id)])).rows;
      if(current.some(row=>row.email!==owner||row.deleted_at))throw Error("原结果已删除或无权恢复");
      const prompt=p.userPrompt||p.prompt||"生成图片",title=prompt.length>16?`${prompt.slice(0,16)}…`:prompt;
      await addArtworksTx(tx,owner,fresh.filter(im=>!current.some(row=>row.id===im.id)).map(im=>({
        id:im.id,title,category:p.category||"main",prompt,status:"completed",image:im.url,gradient:im.gradient,
        style:p.style||null,ratio:im.ratio||p.ratio||null,resolution:p.resolution||null,source:p.imagegen?.request.canvasTarget?"canvas-node-version":sourceUrl,
        parentId:root?.id||null,parentIds:lineage.filter(work=>work.id!==root?.id).map(work=>work.id),groupId:p.projectGroupId||root?.groupId||undefined,
        origin:p.origin||input.entry||null,width:im.width??null,height:im.height??null,processingKind:im.processingKind??null,postprocessStatus:im.postprocessStatus??null,
        creationProvenance:{version:1,operation:"generate",entry:p.origin==="canvas"?"canvas":provenanceEntry(input.entry||p.entry),ref:jobId,evidence:input.recovery?"stored-paid-checkpoint":"server-route"},
      })),`b-${jobId}`,"preserve");
      const owned=(await tx.query("SELECT id,email,deleted_at FROM app_artworks WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",[images.map(image=>image.id)])).rows;
      if(owned.length!==images.length||owned.some(row=>row.email!==owner||row.deleted_at))throw Error("原结果已删除或无权恢复");
      await tx.query("COMMIT");
    }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
    stage("settlement");
    await JOBS.settleResults(jobId,input.legacyCost*images.length/Math.max(1,p.count||1),`生成 ${images.length} 张图`,{state:"succeeded",items:images.map(image=>({id:image.id,state:"succeeded",executedQuality:image.execution?.quality||p.quality||"medium",platformFunded:image.execution?.platformFunded}))});
  }
  const billing=useDb?await readDeliveryBilling(owner,[jobId]).catch(()=>({chargedCredits:saved?.creditsUsed??0,confirmed:false})):{chargedCredits:0,confirmed:true};
  return {images,artifacts,complete,sourceUrl,imagegenOutputError,imagegenOutputWarning,billing};
}
