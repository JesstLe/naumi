import "server-only";
import {createHash} from "node:crypto";
import {listArtworksByIds} from "../db";
import {canReadMedia,getMediaAsset,importLegacyMedia} from "../media-assets";
import {storageKeyFromManagedUrl,readManagedObject,writeStoredObject,presignStoredObject,privateMedia} from "../storage";
import {VideoContractError} from "./contract";
import {videoReferenceSchema} from "./references";
import type {VideoGenerationRequest,VideoReference} from "./types";
import {verifiedOwnedMedia} from "./media-inspection";
import {ModelConfigError} from "../model-config/types";

function invalid(message:string):never{throw new VideoContractError("REFERENCE_UNAVAILABLE",message,["references"]);}
/** Resolve every nested input against owned bytes. Never authorize a client-supplied URL by an unrelated artwork ID. */
export async function authorizeVideoReferences(actor:string,request:VideoGenerationRequest):Promise<VideoGenerationRequest>{
  const all=[...request.references,...(request.elements||[]).flatMap(item=>item.references)];
  const ids=[...new Set(all.map(item=>item.artworkId).filter((id):id is string=>!!id))];
  const artworks=new Map((ids.length?await listArtworksByIds(actor,ids):[]).map(item=>[item.id,item]));
  const identity=new Map<string,string>();
  const resolve=async(raw:VideoReference):Promise<VideoReference>=>{
    const ref=videoReferenceSchema.parse(raw),art=ref.artworkId?artworks.get(ref.artworkId):undefined;
    if(ref.artworkId&&!art)invalid("素材不存在或无权访问");
    if(art&&art.status!=="completed")invalid("前序素材尚未完成");
    const artUrl=art?(ref.kind==="image"?art.image:art.videoUrl||art.image):undefined;
    const artKey=artUrl?storageKeyFromManagedUrl(artUrl):null;
    const urlKey=ref.url?storageKeyFromManagedUrl(ref.url):null;
    if(ref.url&&!urlKey)invalid("请先将外部素材上传到媒体库");
    const key=artKey||ref.storageKey||urlKey;
    if(!key||urlKey&&urlKey!==key||ref.storageKey&&ref.storageKey!==key)invalid("素材身份与地址不一致");
    if(!await canReadMedia(key,actor))invalid("素材不存在或无权访问");
    const existing=identity.get(ref.id);
    if(existing&&existing!==key)invalid("同一引用身份对应不同素材");identity.set(ref.id,key);
    const asset=await getMediaAsset(key)||await importLegacyMedia(key,actor);
    if(!asset||!asset.content_type.startsWith(ref.kind+"/"))invalid("素材真实类型与引用类型不一致");
    let verified;
    try{verified=await verifiedOwnedMedia(actor,key,art?.id||null,ref.sha256);}catch(error){
      if(error instanceof ModelConfigError&&["MEDIA_INPUT_CHANGED","MEDIA_INPUT_UNAVAILABLE","INVALID_MEDIA_STREAM"].includes(error.code))invalid(error.message);throw error;
    }
    return {...ref,url:`/media/${key}`,storageKey:key,mimeType:verified.mimeType,bytes:verified.bytes,sha256:verified.sha256,
      width:verified.probe.width||undefined,height:verified.probe.height||undefined,
      durationSeconds:ref.kind==="image"?undefined:verified.probe.durationSeconds};
  };
  const references:VideoReference[]=[];for(const ref of request.references)references.push(await resolve(ref));
  const elements=[];for(const element of request.elements||[]){const refs=[];for(const ref of element.references)refs.push(await resolve(ref));elements.push({...element,references:refs});}
  return {...request,references,...(request.elements?{elements}:{})};
}

/** Signed addresses exist only in this submission copy; stable owned keys remain in the persisted request. */
export async function materializeVideoReferences(actor:string,request:VideoGenerationRequest,options:{multipart?:boolean;inlineImages?:boolean}={}):Promise<VideoGenerationRequest>{
  const authorized=await authorizeVideoReferences(actor,request),urls=new Map<string,string>();
  const materialize=async(ref:VideoReference)=>{
    const key=ref.storageKey!;
    if(options.inlineImages&&ref.kind==="image"){
      const input=await readManagedObject(`/media/${key}`,12*1024*1024);
      if(ref.sha256&&createHash("sha256").update(input.bytes).digest("hex")!==ref.sha256)invalid("已冻结图片字节已改变");
      return {...ref,inlineData:{mimeType:ref.mimeType!,data:Buffer.from(input.bytes).toString("base64")}};
    }
    if(options.multipart)return {...ref};
    let url=urls.get(key);
    if(!url){
      if(privateMedia){
        const asset=await getMediaAsset(key);
        if(!asset?.remote_ready||asset.sha256!==ref.sha256){
          const object=await readManagedObject(`/media/${key}`,250*1024*1024);
          if(ref.sha256&&createHash("sha256").update(object.bytes).digest("hex")!==ref.sha256)invalid("已冻结素材字节已改变");
          const written=await writeStoredObject(object.bytes,ref.mimeType||object.contentType,key);
          if(!written.remoteReady)invalid("素材暂时无法提供给视频供应商，请稍后重试");
        }
        url=await presignStoredObject("GET",key,900);
      }else{
        const base=(process.env.VIDEO_REFERENCE_PUBLIC_BASE_URL||"").trim().replace(/\/+$/,"");
        if(!base||!/^https?:\/\//.test(base))invalid("远程视频供应商无法读取本地素材，请配置媒体访问地址");
        url=`${base}/media/${key}`;
      }
      urls.set(key,url);
    }
    return {...ref,url};
  };
  const references=[];for(const ref of authorized.references)references.push(await materialize(ref));
  const elements=[];for(const element of authorized.elements||[]){const refs=[];for(const ref of element.references)refs.push(await materialize(ref));elements.push({...element,references:refs});}
  return {...authorized,references,...(authorized.elements?{elements}:{})};
}
