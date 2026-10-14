import "server-only";
import {createHash} from "node:crypto";
import {getPool,ensureSchema} from "../db";
import {getMediaAsset,registerMediaAsset} from "../media-assets";
import {readManagedObject,writeStoredObject,storageEnabled} from "../storage";
import {probeMedia} from "./media";
import {mediaExtension,inspectedMediaMime,recordMediaProbe} from "./media-inspection";
import {getVideoProviderConfig} from "./providers/config";
import {downloadVideoResultAsset} from "./providers/result-fetch";
import type {VideoResultAssetSource} from "./providers/result-fetch";
import type {VideoProviderAdapter,VideoProviderPollResult,VideoTaskSnapshot,VideoProviderFetchResult} from "./types";
import type {VideoTaskRow} from "../db";
import type {MediaJobOutput} from "./media-job-schema";

export type SavedVideoResultAsset=MediaJobOutput&{kind:"video"|"image"|"audio";sourceIndex:number};
type OwnedVideoTask=VideoTaskRow&{email:string};
type Source={kind:SavedVideoResultAsset["kind"];url?:string;identity:string;sourceIndex:number;inline?:boolean};
type Entry=Omit<Source,"url"|"inline">&{saved?:SavedVideoResultAsset};
type Manifest={version:1;entries:Entry[]};
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
function sourceIdentity(url:string){
  const parsed=new URL(url);
  for(const key of [...parsed.searchParams.keys()])if(/^(?:x-amz-|x-goog-)|token|sign|auth|credential|expires|api.?key/i.test(key))parsed.searchParams.delete(key);
  parsed.searchParams.sort();return hash(parsed.href);
}
function sourcesFrom(result:VideoProviderPollResult):Source[]{
  const sources:Source[]=(result.resultAssets||[]).map((asset,index)=>({kind:asset.kind,url:asset.url,identity:sourceIdentity(asset.url),sourceIndex:index}));
  if(result.inlineResult)sources.unshift({kind:"video",identity:hash(result.inlineResult.base64),sourceIndex:-1,inline:true});
  else if(result.resultUrl&&(result.resultAssetsExcludePrimary===true||!sources.some(source=>source.kind==="video"&&source.url===result.resultUrl)))sources.unshift({kind:"video",url:result.resultUrl,identity:sourceIdentity(result.resultUrl),sourceIndex:-1});
  if(!sources.length)sources.push({kind:"video",identity:"native-content-endpoint",sourceIndex:0});
  const firstVideo=sources.findIndex(source=>source.kind==="video");if(firstVideo<0)throw new Error("视频任务没有视频产物");
  if(firstVideo>0)sources.unshift(...sources.splice(firstVideo,1));
  if(sources.length>1000)throw new Error("视频任务产物数量超过处理上限");return sources;
}
async function beginManifest(task:OwnedVideoTask,sources:Source[]):Promise<Manifest>{
  await ensureSchema();const tx=await getPool().connect();
  try{await tx.query("BEGIN");const row=(await tx.query("SELECT parameters,status FROM app_video_tasks WHERE email=$1 AND id=$2 FOR UPDATE",[task.email,task.id])).rows[0];
    if(!row||!["processing","queued"].includes(row.status))throw new Error("视频任务已结束，不能修改产物");
    const old=row.parameters.resultAssetManifest as Manifest|undefined;
    const entries=sources.map(({kind,identity,sourceIndex})=>({kind,identity,sourceIndex}));
    if(old){
      const oldEntries=old.entries.map(({kind,identity,sourceIndex})=>({kind,identity,sourceIndex}));
      // Legacy Gemini decoded only its primary. Append newly decoded outputs only
      // when this task's frozen profile and original primary identity both match.
      const frozenProfile=task.providerSnapshot?.videoProfile,geminiProfile=frozenProfile==="gemini"||((frozenProfile===undefined||frozenProfile==="")&&task.providerSnapshot?.protocol==="gemini");
      if(old.version===1&&geminiProfile&&oldEntries.length===1&&entries.length>1&&oldEntries[0].kind==="video"&&oldEntries[0].sourceIndex===-1&&JSON.stringify(oldEntries[0])===JSON.stringify(entries[0])){
        const expanded:Manifest={...old,entries:[old.entries[0],...entries.slice(1)]};
        await tx.query("UPDATE app_video_tasks SET parameters=jsonb_set(parameters,'{resultAssetManifest}',$3::jsonb),updated_at=now() WHERE email=$1 AND id=$2",[task.email,task.id,JSON.stringify(expanded)]);await tx.query("COMMIT");return expanded;
      }
      if(old.version!==1||JSON.stringify(oldEntries)!==JSON.stringify(entries))throw new Error("上游产物清单改变，需要核对原产物");await tx.query("COMMIT");return old;
    }
    const manifest:Manifest={version:1,entries};await tx.query("UPDATE app_video_tasks SET parameters=jsonb_set(parameters,'{resultAssetManifest}',$3::jsonb),updated_at=now() WHERE email=$1 AND id=$2",[task.email,task.id,JSON.stringify(manifest)]);await tx.query("COMMIT");return manifest;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
async function stageAsset(task:OwnedVideoTask,index:number,asset:SavedVideoResultAsset){
  const tx=await getPool().connect();try{await tx.query("BEGIN");const row=(await tx.query("SELECT parameters,status FROM app_video_tasks WHERE email=$1 AND id=$2 FOR UPDATE",[task.email,task.id])).rows[0];
    if(!row||!["queued","processing"].includes(row.status))throw new Error("视频任务已结束");
    const manifest=row.parameters.resultAssetManifest as Manifest,entry=manifest?.entries[index];if(!entry||entry.kind!==asset.kind)throw new Error("视频产物身份无效");
    if(entry.saved&&entry.saved.sha256!==asset.sha256)throw new Error("已保存的视频产物字节不可覆盖");entry.saved=asset;
    await tx.query("UPDATE app_video_tasks SET parameters=jsonb_set(parameters,'{resultAssetManifest}',$3::jsonb),updated_at=now() WHERE email=$1 AND id=$2",[task.email,task.id,JSON.stringify(manifest)]);await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
async function verifiedSaved(task:OwnedVideoTask,asset:SavedVideoResultAsset){
  const record=await getMediaAsset(asset.storageKey);
  if(!record||record.owner!==task.email.toLowerCase()||record.sha256!==asset.sha256)throw new Error("视频产物归属或字节摘要无法核对");
  const object=await readManagedObject(asset.url,asset.kind==="image"?32*1024*1024:200*1024*1024);
  if(createHash("sha256").update(object.bytes).digest("hex")!==asset.sha256)throw new Error("已保存的视频产物字节已改变");
}
/** Sequential staging bounds memory and lets partial storage failures resume safely. */
export async function collectVideoResultAssets(task:OwnedVideoTask,snapshot:VideoTaskSnapshot,adapter:VideoProviderAdapter,result:VideoProviderPollResult):Promise<SavedVideoResultAsset[]>{
  if(!storageEnabled)throw new Error("必须配置媒体存储才能保存视频产物");
  const sources=sourcesFrom(result),manifest=await beginManifest(task,sources),outputs:SavedVideoResultAsset[]=[];
  let total=0;
  for(let index=0;index<sources.length;index++){
    const source=sources[index],entry=manifest.entries[index];
    if(entry.saved){await verifiedSaved(task,entry.saved);total+=entry.saved.bytes;if(total>1024*1024*1024)throw new Error("视频任务全部产物超过1GiB处理上限");outputs.push(entry.saved);continue;}
    let bytes:Uint8Array|undefined,mimeHint="";
    // A pre-upgrade receipt belongs to this owned task; migrate it to the new inventory.
    if(index===0&&task.videoUrl?.startsWith("/media/")){
      const key=task.videoUrl.slice(7),existing=await getMediaAsset(key);if(existing?.owner&&existing.owner!==task.email.toLowerCase())throw new Error("旧视频产物归属不一致");
      const object=await readManagedObject(task.videoUrl,200*1024*1024);bytes=object.bytes;mimeHint=object.contentType;
    }else{
      let file:VideoProviderFetchResult;
      if(source.url){const asset:VideoResultAssetSource={kind:source.kind,url:source.url};
        if(adapter.fetchResultAsset)file=await adapter.fetchResultAsset(snapshot,asset);
        else{const config=getVideoProviderConfig(task.providerId);if(!config)throw new Error("冻结的视频通道不可用");file=await downloadVideoResultAsset(config,asset);}
      }else file=await adapter.fetchResult(snapshot,result);
      bytes=file.bytes;mimeHint=file.mimeType;
      if(!bytes?.length&&file.url){const config=getVideoProviderConfig(task.providerId);if(!config)throw new Error("冻结的视频通道不可用");const downloaded=await downloadVideoResultAsset(config,{kind:source.kind,url:file.url});bytes=downloaded.bytes;mimeHint=downloaded.mimeType;}
    }
    if(!bytes?.length||bytes.byteLength>(source.kind==="image"?32:200)*1024*1024)throw new Error("视频供应商返回空产物或超限产物");
    total+=bytes.byteLength;if(total>1024*1024*1024)throw new Error("视频任务全部产物超过1GiB处理上限");
    let probeExtension=source.kind==="image"?"png":source.kind==="audio"?"wav":"mp4";
    try{probeExtension=mediaExtension(mimeHint);}catch{/* FFprobe determines the actual container from bytes. */}
    const probe=await probeMedia(bytes,probeExtension);
    const mimeType=inspectedMediaMime(probe,source.kind),extension=mediaExtension(mimeType),sha256=createHash("sha256").update(bytes).digest("hex");
    const artworkId=index===0?`vid-art-${task.id}`:`vid-art-${task.id}-${index}`,storageKey=`videos/${artworkId}.${extension}`,url=`/media/${storageKey}`;
    const prior=await getMediaAsset(storageKey),legacyOwnedReceipt=index===0&&task.videoUrl===url&&prior?.owner===null;
    if(prior&&((prior.owner!==task.email.toLowerCase()&&!legacyOwnedReceipt)||prior.sha256!==sha256))throw new Error("已落盘的视频产物不能被不同字节覆盖");
    const stored=await writeStoredObject(bytes,mimeType,storageKey);await registerMediaAsset(storageKey,bytes,mimeType,stored.remoteReady,task.email);await recordMediaProbe(storageKey,sha256,probe);
    const saved:SavedVideoResultAsset={kind:source.kind,sourceIndex:source.sourceIndex,artworkId,storageKey,url,mimeType,sha256,bytes:bytes.byteLength,name:`result-${index}.${extension}`,probe};
    await stageAsset(task,index,saved);entry.saved=saved;outputs.push(saved);
  }
  return outputs;
}
export function resultMetadataWarnings(task:OwnedVideoTask,outputs:SavedVideoResultAsset[]){
  const warnings:Array<{artworkId:string;code:string;expected:unknown;actual:unknown}>=[];
  const request=task.parameters.request&&typeof task.parameters.request==="object"?task.parameters.request as Record<string,unknown>:task.parameters;
  for(const output of outputs){if(output.kind!=="video"||!output.probe)continue;const p=output.probe,expected=Number(request.durationSeconds??task.parameters.durationSeconds??task.seconds);
    if(expected>0&&Math.abs(p.durationSeconds-expected)>Math.max(0.12,expected*0.03))warnings.push({artworkId:output.artworkId,code:"duration_mismatch",expected,actual:p.durationSeconds});
    for(const field of ["width","height"] as const){const requested=Number(request[field]);if(requested>0&&requested!==p[field])warnings.push({artworkId:output.artworkId,code:`${field}_mismatch`,expected:requested,actual:p[field]});}
    if(request.generateAudio===false&&p.audioCodecs.length)warnings.push({artworkId:output.artworkId,code:"unexpected_audio",expected:false,actual:p.audioCodecs});
    if(request.generateAudio===true&&!p.audioCodecs.length)warnings.push({artworkId:output.artworkId,code:"missing_audio",expected:true,actual:[]});
    if(typeof request.aspectRatio==="string"&&/^\d+:\d+$/.test(request.aspectRatio)){
      const [width,height]=request.aspectRatio.split(":").map(Number);if(width>0&&height>0&&Math.abs(p.width/p.height-width/height)>0.02)warnings.push({artworkId:output.artworkId,code:"aspect_ratio_mismatch",expected:request.aspectRatio,actual:{width:p.width,height:p.height}});
    }
  }return warnings;
}
