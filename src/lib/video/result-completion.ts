import "server-only";
import {completeVideoTask} from "@/lib/video/task-transitions";
import {type VideoTaskRow} from "@/lib/video/task-types";
import {listArtworksByIds} from "@/lib/artworks/repository";
import {type ArtworkRecord} from "@/lib/artworks/types";
import {collectVideoResultAssets,resultMetadataWarnings} from "./result-assets";
import type {VideoProviderAdapter,VideoProviderPollResult,VideoTaskSnapshot} from "./types";

/** All verified video/image/audio artifacts and the frozen bill complete together. */
export async function completeVideoResultSet(email:string,task:VideoTaskRow,snapshot:VideoTaskSnapshot,adapter:VideoProviderAdapter,result:VideoProviderPollResult,lastResponse:unknown){
  const ownedTask={...task,email},assets=await collectVideoResultAssets(ownedTask,snapshot,adapter,result),primary=assets[0];
  if(primary?.kind!=="video")throw new Error("主视频产物缺失");
  const nested=(task.parameters.request as {elements?:Array<{references?:Array<{artworkId?:string}>}>}|undefined)?.elements||[];
  const candidateIds=[...new Set([
    ...(task.source==="canvas"&&task.sourceId?[task.sourceId]:[]),
    ...(task.videoReferences||[]).map(ref=>String((ref as {artworkId?:string}).artworkId||"")),
    ...nested.flatMap(element=>(element.references||[]).map(ref=>ref.artworkId||""))
  ].filter(Boolean))];
  const ownedParents=candidateIds.length?await listArtworksByIds(email,candidateIds):[],parents=new Set(ownedParents.map(art=>art.id)),parentIds=candidateIds.filter(id=>parents.has(id));
  const artworks:Omit<ArtworkRecord,"createdAt">[]=assets.map((asset,index)=>({
    id:asset.artworkId,title:`${asset.kind==="video"?"视频":asset.kind==="image"?"图片":"音频"} · ${task.prompt.slice(0,24)}${assets.length>1?` · ${index+1}`:""}`,
    category:asset.kind==="image"?"main":asset.kind,prompt:task.prompt,status:"completed",image:asset.kind==="audio"?"":asset.url,
    videoUrl:asset.kind==="image"?null:asset.url,gradient:"from-slate-100 to-zinc-100",style:null,ratio:asset.probe?.width&&asset.probe.height?`${asset.probe.width}:${asset.probe.height}`:null,resolution:null,
    source:null,parentId:parentIds[0]||null,parentIds:parentIds.slice(1),origin:task.source==="canvas"||task.parameters.projectKey?"canvas":null,width:asset.probe?.width||null,height:asset.probe?.height||null,
    creationProvenance:{version:1,operation:"video",entry:"video",ref:task.id,evidence:"server-route"},
  }));
  await completeVideoTask({email,id:task.id,artworkId:primary.artworkId,videoUrl:primary.url,resultStorageKey:primary.storageKey,lastResponse,artworks,
    resultAssets:assets,resultMetadataWarnings:resultMetadataWarnings(ownedTask,assets)});
}
