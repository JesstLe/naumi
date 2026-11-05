import "server-only";
import { readManagedObject } from "../../object-storage/managed-read";
import {readBounded} from "../../supplier-cost/io";
import {field,string,unsupportedWire} from "./wire-helpers";
import type {VideoWireContext} from "./wire-contracts";
import {videoWireEndpoint} from "./wire-endpoint";
import {createHash} from "node:crypto";
import {mediaExtension} from "../media-formats";

/** Upload bounded owned originals before graph submission; never store temporary names as reference identity. */
export async function uploadWorkflowReferences(context:VideoWireContext,transport:typeof fetch){
  if(!["comfyui","runninghub"].includes(context.profile))return context.request;
  const references=[];
  for(const ref of context.request.references){
    const input=ref.storageKey?await readManagedObject(`/media/${ref.storageKey}`,250*1024*1024):ref.inlineData?{bytes:Buffer.from(ref.inlineData.data,"base64"),contentType:ref.inlineData.mimeType}:undefined;
    if(!input?.bytes.length)unsupportedWire(context,"工作流引用需要已拥有的原始素材");
    if(ref.sha256&&createHash("sha256").update(input.bytes).digest("hex")!==ref.sha256)unsupportedWire(context,"已冻结工作流素材字节已改变");
    const form=new FormData(),filename=`naumi-${ref.id.replace(/[^A-Za-z0-9]/g,"").slice(0,40)}.${mediaExtension(ref.mimeType||input.contentType)}`;
    const blob=new Blob([Uint8Array.from(input.bytes)],{type:ref.mimeType||input.contentType});
    const headers:Record<string,string>={};
    if(context.profile==="runninghub"){form.set("apiKey",context.provider.apiKey);form.set("fileType","input");form.set("file",blob,filename);}
    else{form.set("image",blob,filename);form.set("overwrite","true");if(context.provider.apiKey)headers.authorization=`Bearer ${context.provider.apiKey}`;}
    const path=context.profile==="runninghub"?"/task/openapi/upload":"/upload/image";
    const response=await transport(videoWireEndpoint(context.provider,path),{method:"POST",headers,body:form,signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw new Error(`工作流素材上传失败(${response.status})`);
    let payload:unknown;try{payload=JSON.parse(await readBounded(response,512*1024));}catch{throw new Error("工作流素材上传响应无效");}
    const name=string(field(payload,context.profile==="runninghub"?"data.fileName":"name")),subfolder=context.profile==="comfyui"?string(field(payload,"subfolder")):"";
    if(!name||/[\\\u0000]/.test(name)||name.split("/").some(part=>part==="..")||subfolder.split("/").some(part=>part===".."))throw new Error("工作流未返回可用上传名称");
    references.push({...ref,submissionName:subfolder?`${subfolder}/${name}`:name});
  }
  return {...context.request,references};
}
