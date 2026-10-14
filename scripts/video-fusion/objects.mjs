import { AwsV4Signer } from "aws4fetch";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/** A private, signature-verified fixture store. It never connects to a real bucket. */
export function createFixtureObjects({ root, accessKeyId, secretAccessKey, bucket, calls, allowedOrigins=[] }) {
  root=path.resolve(root);
  return async function handle(req,res,origin) {
    const json=(status,message)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify({error:message}));};
    const browserOrigin=String(req.headers.origin||"");
    if(allowedOrigins.includes(browserOrigin)){
      res.setHeader("access-control-allow-origin",browserOrigin);res.setHeader("vary","Origin");
      res.setHeader("access-control-expose-headers","content-type,content-length,content-disposition,etag,accept-ranges,content-range");
      if(req.method==="OPTIONS"){res.setHeader("access-control-allow-methods","GET,HEAD,PUT");res.setHeader("access-control-allow-headers","content-type,content-length,range");res.writeHead(204);return res.end();}
    }else if(req.method==="OPTIONS")return json(403,"fixture origin denied");
    const url=new URL(req.url,origin), signQuery=url.searchParams.has("X-Amz-Signature");
    const auth=String(req.headers.authorization||"");
    const signature=signQuery?url.searchParams.get("X-Amz-Signature"):auth.match(/Signature=([a-f0-9]{64})/)?.[1];
    const credential=signQuery?url.searchParams.get("X-Amz-Credential"):auth.match(/Credential=([^, ]+)/)?.[1];
    const signedHeaders=(signQuery?url.searchParams.get("X-Amz-SignedHeaders"):auth.match(/SignedHeaders=([^, ]+)/)?.[1])||"";
    const datetime=(signQuery?url.searchParams.get("X-Amz-Date"):req.headers["x-amz-date"])||"";
    if(!signature||!credential?.startsWith(accessKeyId+"/")||!/^\d{8}T\d{6}Z$/.test(datetime))return json(403,"unsigned fixture object");
    const at=Date.parse(datetime.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,"$1-$2-$3T$4:$5:$6Z"));
    const expires=signQuery?Number(url.searchParams.get("X-Amz-Expires")):300;
    if(!Number.isFinite(at)||!Number.isFinite(expires)||expires<1||expires>900||Date.now()>at+expires*1000||at>Date.now()+60_000)return json(403,"expired fixture signature");
    const chunks=[];let total=0;
    for await(const chunk of req){total+=chunk.length;if(total>200*1024*1024)return json(413,"fixture object too large");chunks.push(chunk);}
    const bytes=Buffer.concat(chunks),headers=new Headers();
    for(const header of signedHeaders.split(";"))if(header!=="host"&&req.headers[header]!==undefined)headers.set(header,String(req.headers[header]));
    const payloadHash=headers.get("x-amz-content-sha256");
    if(payloadHash&&payloadHash!=="UNSIGNED-PAYLOAD"&&payloadHash!==createHash("sha256").update(bytes).digest("hex"))return json(403,"fixture payload mismatch");
    url.searchParams.delete("X-Amz-Signature");
    const signer=new AwsV4Signer({method:req.method,url:url.href,headers,body:bytes,accessKeyId,secretAccessKey,service:"s3",region:"us-east-1",datetime,signQuery,allHeaders:true});
    const expected=await signer.signature();
    if(!/^[a-f0-9]{64}$/.test(signature)||!timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex")))return json(403,"invalid fixture signature");
    const prefix=`/objects/${bucket}/`;
    if(!url.pathname.startsWith(prefix))return json(404,"fixture bucket missing");
    const key=decodeURIComponent(url.pathname.slice(prefix.length)),parts=key.split("/");
    if(!key||key.includes("\\")||parts.some(p=>!p||p==="."||p===".."||/[\x00-\x1f]/.test(p)))return json(400,"unsafe fixture key");
    const target=path.resolve(root,...parts);
    if(!target.startsWith(root+path.sep))return json(400,"unsafe fixture path");
    calls.push({phase:req.method==="PUT"?"object-write":"object-read",key,bytes:total,signatureVerified:true});
    if(req.method==="PUT"){
      await mkdir(path.dirname(target),{recursive:true});
      const existing=await readFile(target).catch(()=>null);
      if(existing&&!existing.equals(bytes))return json(409,"fixture object immutable");
      await writeFile(target,bytes);
      await writeFile(target+".fixture-mime",String(req.headers["content-type"]||"application/octet-stream"));
      res.writeHead(200,{etag:`"${createHash("md5").update(bytes).digest("hex")}"`});return res.end();
    }
    if(req.method!=="GET"&&req.method!=="HEAD")return json(405,"fixture method unsupported");
    const info=await stat(target).catch(()=>null);if(!info?.isFile())return json(404,"fixture object missing");
    const mime=await readFile(target+".fixture-mime","utf8").catch(()=>"application/octet-stream");
    const range=String(req.headers.range||"").match(/^bytes=(\d+)-(\d*)$/);
    const start=range?Number(range[1]):0,end=range&&range[2]?Number(range[2]):info.size-1;
    if(start>end||end>=info.size){res.writeHead(416,{"content-range":`bytes */${info.size}`});return res.end();}
    const disposition=url.searchParams.get("response-content-disposition");
    if(disposition&&!/^attachment; filename="[\w.\-]{1,160}"$/.test(disposition))return json(400,"invalid fixture response disposition");
    res.writeHead(range?206:200,{"content-type":mime,"content-length":end-start+1,"accept-ranges":"bytes",...(disposition?{"content-disposition":disposition}:{}),...(range?{"content-range":`bytes ${start}-${end}/${info.size}`}:{})});
    if(req.method==="HEAD")return res.end();
    res.end((await readFile(target)).subarray(start,end+1));
  };
}
