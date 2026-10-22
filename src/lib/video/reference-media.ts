import "server-only";
import {createHash} from "node:crypto";
import {open,realpath} from "node:fs/promises";
import path from "node:path";
import {Readable} from "node:stream";
import {getMediaAsset} from "../media-assets";
import {fetchStoredObject,MEDIA_DIR} from "../storage";
import {matchesVideoReferenceMediaAsset,verifyVideoReferenceToken,type VideoReferenceMediaAsset,type VideoReferenceMediaClaims} from "./reference-media-token";

type ByteRange={start:number;end:number;length:number;partial:boolean;wire:string};
export type VideoReferenceMediaDependencies={
  secret?:string;now?:()=>number;
  verifyToken?:(token:string)=>VideoReferenceMediaClaims|null;
  getAsset?:(key:string)=>Promise<VideoReferenceMediaAsset|null>;
  fetchObject?:(key:string,range:string)=>Promise<Response>;
  readLocal?:(claims:VideoReferenceMediaClaims,range:string)=>Promise<Response|null>;
};
function byteRange(raw:string,size:number):ByteRange|null{
  if(!raw)return {start:0,end:size-1,length:size,partial:false,wire:""};
  const match=/^bytes=(\d*)-(\d*)$/.exec(raw.trim());if(!match||!match[1]&&!match[2])return null;
  let start:number,end:number;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return null;start=Math.max(0,size-suffix);end=size-1;}
  else{start=Number(match[1]);const requestedEnd=match[2]?Number(match[2]):size-1;if(!Number.isSafeInteger(requestedEnd))return null;end=Math.min(requestedEnd,size-1);}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)return null;
  return {start,end,length:end-start+1,partial:true,wire:`bytes=${start}-${end}`};
}
function headers(claims?:VideoReferenceMediaClaims,range?:ByteRange){
  const result=new Headers({"cache-control":"private, no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'none'; sandbox"});
  if(claims){result.set("content-type",claims.contentType);result.set("accept-ranges","bytes");result.set("etag",`"${claims.sha256}"`);result.set("content-disposition","attachment");}
  if(range){result.set("content-length",String(range.length));if(range.partial)result.set("content-range",`bytes ${range.start}-${range.end}/${claims!.bytes}`);}
  return result;
}
function errorResponse(status:number,extra?:Record<string,string>){return new Response(null,{status,headers:{...Object.fromEntries(headers()),...extra}});}
function validObjectResponse(response:Response,claims:VideoReferenceMediaClaims,range:ByteRange){
  return response.status===(range.partial?206:200)&&Number(response.headers.get("content-length"))===range.length&&!!response.body&&
    (!range.partial||response.headers.get("content-range")===`bytes ${range.start}-${range.end}/${claims.bytes}`);
}
/** A mirror may be stale after an interrupted NAS upload. Check its frozen hash
 * through one file descriptor before exposing any bytes or handling a Range. */
export async function readVerifiedVideoReferenceLocal(claims:VideoReferenceMediaClaims,rawRange:string,mediaDir=MEDIA_DIR):Promise<Response|null>{
  let file:Awaited<ReturnType<typeof open>>|undefined;
  try{
    const root=await realpath(mediaDir),target=await realpath(path.resolve(root,claims.key));
    if(!target.startsWith(root+path.sep))return null;
    file=await open(target,"r");const before=await file.stat();
    if(!before.isFile()||before.size!==claims.bytes)return null;
    const digest=createHash("sha256"),source=file.createReadStream({start:0,autoClose:false});
    for await(const chunk of source)digest.update(chunk);
    const after=await file.stat();
    if(digest.digest("hex")!==claims.sha256||after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)return null;
    const range=byteRange(rawRange,claims.bytes);if(!range)return null;
    const stream=file.createReadStream({start:range.start,end:range.end,autoClose:true});file=undefined;
    return new Response(Readable.toWeb(stream) as ReadableStream,{status:range.partial?206:200,headers:headers(claims,range)});
  }catch{return null;}finally{await file?.close().catch(()=>{});}
}
export function createVideoReferenceMediaHandler(deps:VideoReferenceMediaDependencies={}){
  return async(request:Request,token:string):Promise<Response>=>{
    if(!["GET","HEAD"].includes(request.method))return errorResponse(405,{allow:"GET, HEAD"});
    const claims=(deps.verifyToken??(value=>verifyVideoReferenceToken(value,{secret:deps.secret,now:deps.now?.()})))(token);
    if(!claims)return errorResponse(404);
    let asset:VideoReferenceMediaAsset|null;
    try{asset=await (deps.getAsset??getMediaAsset)(claims.key);if(!asset||!matchesVideoReferenceMediaAsset(claims,asset,{secret:deps.secret}))return errorResponse(404);}
    catch{return errorResponse(503);}
    const range=byteRange(request.headers.get("range")||"",claims.bytes);
    if(!range)return errorResponse(416,{"content-range":`bytes */${claims.bytes}`,"accept-ranges":"bytes"});
    const probeRange=request.method==="HEAD"&&!range.partial?byteRange("bytes=0-0",claims.bytes)!:range;
    let response:Response|null=null;
    try{
      response=await (deps.fetchObject??fetchStoredObject)(claims.key,probeRange.wire);
      if(!validObjectResponse(response,claims,probeRange)){await response.body?.cancel().catch(()=>{});response=null;}
    }catch{response=null;}
    if(!response){
      response=await (deps.readLocal??readVerifiedVideoReferenceLocal)(claims,probeRange.wire).catch(()=>null);
      if(response&&!validObjectResponse(response,claims,probeRange)){await response.body?.cancel().catch(()=>{});response=null;}
    }
    if(!response)return errorResponse(503);
    if(request.method==="HEAD"){await response.body?.cancel().catch(()=>{});return new Response(null,{status:range.partial?206:200,headers:headers(claims,range)});}
    return new Response(response.body,{status:range.partial?206:200,headers:headers(claims,range)});
  };
}
