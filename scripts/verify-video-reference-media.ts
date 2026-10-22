import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,realpath,rm,unlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createVideoReferenceMediaUrl,issueVideoReferenceToken,verifyVideoReferenceToken,VIDEO_REFERENCE_MEDIA_PATH,type VideoReferenceMediaAsset} from "../src/lib/video/reference-media-token";
import {createVideoReferenceMediaHandler,readVerifiedVideoReferenceLocal} from "../src/lib/video/reference-media";

/** Local synthetic protocol/security fixture; no database, network or supplier call. */
const secret="synthetic-reference-media-secret-at-least-32-characters";
const now=1_800_000_000_000;
const bytes=Uint8Array.from({length:16},(_,index)=>index);
const sha256=createHash("sha256").update(bytes).digest("hex");
const source={key:"artworks/synthetic-reference.png",sha256,bytes:bytes.length,contentType:"image/png",owner:"private-owner@example.test",public:false};
const asset:VideoReferenceMediaAsset={key:source.key,sha256,bytes:String(bytes.length),content_type:source.contentType,owner:source.owner,public:false};
const token=issueVideoReferenceToken(source,{secret,now});
const claims=verifyVideoReferenceToken(token,{secret,now});
assert(claims);
let assertions=1;
function equal(actual:unknown,expected:unknown,message:string){assert.deepEqual(actual,expected,message);assertions++;}
equal({key:claims.key,sha256:claims.sha256,bytes:claims.bytes,contentType:claims.contentType},{key:source.key,sha256,bytes:bytes.length,contentType:source.contentType},"Token binds the exact asset identity");
equal(claims.expiresAt-claims.issuedAt,900,"Default token lifetime is bounded to 15 minutes");
assert.match(claims.ownerHash,/^[a-f0-9]{64}$/);assertions++;
equal(JSON.stringify(claims).includes(source.owner),false,"Verified claims do not contain the owner's email");
equal(token.includes(source.key)||token.includes(source.owner)||token.includes(sha256),false,"Public token is opaque");
const encryptedBytes=token.split(".").slice(1).map(part=>Buffer.from(part,"base64url").toString("utf8")).join("");
equal(encryptedBytes.includes(source.owner)||encryptedBytes.includes(source.key),false,"Token payload does not merely base64-encode private identity");
const middle=Math.floor(token.length/2),tampered=token.slice(0,middle)+(token[middle]==="A"?"B":"A")+token.slice(middle+1);
equal(verifyVideoReferenceToken(tampered,{secret,now}),null,"Tampered token rejected");
equal(verifyVideoReferenceToken(token,{secret:"different-synthetic-secret-at-least-32-characters",now}),null,"Wrong signing scope/secret rejected");
equal(verifyVideoReferenceToken(token,{secret,now:now+900_000}),null,"Expiry boundary is exclusive");
equal(verifyVideoReferenceToken(token,{secret,now:now-60_000}),null,"Token issued too far in the future rejected");
for(const invalid of ["",token+".extra","vr1.invalid.payload.tag","x".repeat(5000)])equal(verifyVideoReferenceToken(invalid,{secret,now}),null,"Malformed or oversized token rejected");
const short=issueVideoReferenceToken(source,{secret,now,expiresInSeconds:5});
equal(verifyVideoReferenceToken(short,{secret,now:now+4_000})?.key,source.key,"Explicit short lifetime remains valid before expiry");
equal(verifyVideoReferenceToken(short,{secret,now:now+5_000}),null,"Explicit short lifetime expires");
const unicodeKey="artworks/红色木方.png",unicodeToken=issueVideoReferenceToken({...source,key:unicodeKey},{secret,now});
equal(verifyVideoReferenceToken(unicodeToken,{secret,now})?.key,unicodeKey,"Unicode storage identity survives opaque token encoding");
for(const key of ["/absolute.png","../escape.png","artworks/../escape.png","artworks\\escape.png","artworks//escape.png","artworks/./escape.png","artworks/image.png?token=private","artworks/\u0000.png"]){
  assert.throws(()=>issueVideoReferenceToken({...source,key},{secret,now}),`${key}: unsafe storage key rejected`);assertions++;
}
for(const ttl of [0,-1,901,1.5]){assert.throws(()=>issueVideoReferenceToken(source,{secret,now,expiresInSeconds:ttl}),"Invalid TTL must be rejected rather than silently expanded");assertions++;}
for(const length of [0,-1,1.5,251*1024*1024]){assert.throws(()=>issueVideoReferenceToken({...source,bytes:length},{secret,now}),"Invalid asset length rejected");assertions++;}
assert.throws(()=>issueVideoReferenceToken({...source,contentType:"text/html"},{secret,now}));assertions++;
for(const baseUrl of ["https://47.105.59.142","http://media.example.test"]){
  const url=new URL(createVideoReferenceMediaUrl(source,{baseUrl,secret,now}));
  equal(url.origin,new URL(baseUrl).origin,"Reference URL uses only its explicit public origin");
  assert(url.pathname.startsWith(VIDEO_REFERENCE_MEDIA_PATH));assertions++;
  equal(url.search+url.hash,"","Public reference URL carries no query credentials or fragment");
  equal(verifyVideoReferenceToken(url.pathname.slice(VIDEO_REFERENCE_MEDIA_PATH.length),{secret,now})?.key,source.key,"URL carries a verifiable opaque token");
}
for(const baseUrl of ["https://user:secret@media.example.test","https://media.example.test/path","https://media.example.test?token=secret","https://media.example.test#secret","http://127.0.0.1","http://169.254.169.254","http://10.0.0.1","http://localhost","file:///tmp"]){
  assert.throws(()=>createVideoReferenceMediaUrl(source,{baseUrl,secret,now}),"URL minting rejects credentials, paths and private literal origins");assertions++;
}

const rangeHeader=(range:string):{status:number;headers:Record<string,string>}=>{
  if(!range)return {status:200,headers:{"content-type":source.contentType,"content-length":String(bytes.length)}};
  const match=/^bytes=(\d+)-(\d+)$/.exec(range);assert(match,"Handler canonicalizes a single range");
  const start=Number(match[1]),end=Number(match[2]);
  return {status:206,headers:{"content-type":source.contentType,"content-length":String(end-start+1),"content-range":`bytes ${start}-${end}/${bytes.length}`}};
};
function mediaResponse(range:string,extra:Record<string,string>={}){
  const init=rangeHeader(range),match=/^bytes=(\d+)-(\d+)$/.exec(range);
  const body=match?bytes.slice(Number(match[1]),Number(match[2])+1):bytes;
  return new Response(body,{status:init.status,headers:{...init.headers,...extra}});
}
const publicURL="https://media.example.test"+VIDEO_REFERENCE_MEDIA_PATH+token;
const request=(method="GET",range?:string)=>new Request(publicURL,{method,headers:range?{range}:{}});
let reads=0,objectReads=0,localReads=0,lastRange="";
const deps={secret,now:()=>now,getAsset:async(key:string)=>{reads++;equal(key,source.key,"Metadata lookup is confined to signed key");return {...asset};},
  fetchObject:async(key:string,range:string)=>{objectReads++;equal(key,source.key,"Object lookup is confined to signed key");lastRange=range;return mediaResponse(range,{"set-cookie":"private-cookie=never-forward","authorization":"never-forward","x-api-key":"never-forward","location":"https://private.example.test/location"});},
  readLocal:async()=>{localReads++;return null;}};
function safeResponse(response:Response,message:string){
  for(const header of ["set-cookie","authorization","x-api-key","location"])equal(response.headers.has(header),false,`${message}: upstream ${header} is not forwarded`);
  equal([...response.headers.values()].some(value=>value.includes(source.owner)||value.includes(source.key)||value.includes(secret)),false,`${message}: no private asset identity in headers`);
}
async function main(){
  assert(claims);assertions++;
  const handler=createVideoReferenceMediaHandler(deps);
  const get=await handler(request(),token);
  equal(get.status,200,"Valid signed GET needs no browser session");equal(new Uint8Array(await get.arrayBuffer()),bytes,"GET returns the object bytes");
  equal(get.headers.get("content-type"),source.contentType,"GET preserves declared media MIME");safeResponse(get,"GET");
  equal(localReads,0,"Healthy remote object does not need local fallback");
  const head=await handler(request("HEAD"),token);
  equal(head.status,200,"HEAD is supported");equal(await head.text(),"","HEAD returns no body");equal(lastRange,"bytes=0-0","HEAD probes only one object byte");safeResponse(head,"HEAD");
  const ranged=await handler(request("GET","bytes=4-7"),token);
  equal(ranged.status,206,"Single byte range is supported");equal(new Uint8Array(await ranged.arrayBuffer()),bytes.slice(4,8),"Range returns only selected bytes");
  equal(ranged.headers.get("content-range"),`bytes 4-7/${bytes.length}`,"Range response declares exact bounds");equal(lastRange,"bytes=4-7","Range is canonicalized for storage");safeResponse(ranged,"Range");
  for(const range of ["bytes=99-100","bytes=0-1,4-5","not-a-range","bytes=-"]){
    const before=objectReads,response=await handler(request("GET",range),token);
    equal(response.status,416,"Invalid or multiple range is rejected");equal(objectReads,before,"Invalid range does not fetch object");safeResponse(response,"Invalid range");
  }
  equal((await handler(request("POST"),token)).status,405,"Write methods cannot access the reference handler");
  const beforeInvalid={reads,objectReads};
  for(const invalid of [tampered,"bad-token"]){const response=await handler(request(),invalid);equal(response.status,404,"Invalid token is concealed as missing");safeResponse(response,"Invalid token");}
  equal({reads,objectReads},beforeInvalid,"Unauthorized token does not trigger metadata or object access");
  const expired=createVideoReferenceMediaHandler({...deps,now:()=>now+900_000});
  equal((await expired(request(),token)).status,404,"Expired token cannot fetch media");

  for(const change of [null,{...asset,sha256:"a".repeat(64)},{...asset,bytes:17},{...asset,content_type:"video/mp4"},{...asset,owner:"new-owner@example.test"},{...asset,public:true}]){
    const before=objectReads,modified=createVideoReferenceMediaHandler({...deps,getAsset:async()=>change});
    const response=await modified(request(),token);equal(response.status,404,"Deleted or replaced asset revokes existing token");equal(objectReads,before,"Revoked metadata cannot reach object storage");safeResponse(response,"Revoked asset");
  }
  let fallbackRange="";
  const fallback=createVideoReferenceMediaHandler({...deps,fetchObject:async()=>{throw new Error("Synthetic storage unavailable");},readLocal:async(bound,range)=>{
    equal({key:bound.key,sha256:bound.sha256,bytes:bound.bytes},{key:source.key,sha256,bytes:bytes.length},"Local fallback receives exact verified identity");
    fallbackRange=range;return mediaResponse(range,{"x-api-key":"local-private-value"});}});
  const local=await fallback(request("GET","bytes=4-7"),token);
  equal(local.status,206,"Matching local copy is available when remote storage fails");equal(new Uint8Array(await local.arrayBuffer()),bytes.slice(4,8),"Local fallback preserves range bytes");equal(fallbackRange,"bytes=4-7","Local fallback uses the same canonical range");safeResponse(local,"Local fallback");
  const unavailable=createVideoReferenceMediaHandler({...deps,fetchObject:async()=>new Response(null,{status:302,headers:{location:"https://private.example.test/redirect","set-cookie":"secret"}}),readLocal:async()=>null});
  const redirect=await unavailable(request(),token);
  equal(redirect.status,503,"Storage redirect is not followed or exposed");safeResponse(redirect,"Redirect failure");assert(redirect.headers.get("cache-control")?.includes("no-store"),"Failures are not cached");assertions++;
  const incorrectLength=createVideoReferenceMediaHandler({...deps,fetchObject:async()=>new Response(bytes,{status:200,headers:{"content-type":"image/png","content-length":"1000"}}),readLocal:async()=>null});
  equal((await incorrectLength(request(),token)).status,503,"Incorrect object length cannot be published as the signed asset");
  const temporaryParent=await realpath(tmpdir()),localRoot=await mkdtemp(path.join(temporaryParent,"naumi-video-reference-fixture-"));
  try{
    const file=path.join(localRoot,source.key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);
    const complete=await readVerifiedVideoReferenceLocal(claims,"",localRoot);
    assert(complete);assertions++;equal(new Uint8Array(await complete.arrayBuffer()),bytes,"Real local mirror is streamed after hash verification");
    const partial=await readVerifiedVideoReferenceLocal(claims,"bytes=4-7",localRoot);
    assert(partial);assertions++;equal(partial.status,206,"Real local mirror supports a byte range");equal(new Uint8Array(await partial.arrayBuffer()),bytes.slice(4,8),"Real local mirror returns the selected bytes");
    await writeFile(file,Uint8Array.from(bytes,value=>255-value));
    equal(await readVerifiedVideoReferenceLocal(claims,"",localRoot),null,"A same-length stale mirror with a different SHA256 is rejected");
    await unlink(file);equal(await readVerifiedVideoReferenceLocal(claims,"",localRoot),null,"A missing local mirror remains unavailable");
  }finally{
    // Only remove this freshly created synthetic fixture beneath its checked temp parent.
    assert.equal(path.dirname(localRoot),temporaryParent);assert(path.basename(localRoot).startsWith("naumi-video-reference-fixture-"));
    assert.equal(await realpath(localRoot),localRoot);await rm(localRoot,{recursive:true});
  }
  process.stdout.write(`VIDEO_REFERENCE_MEDIA=PASS assertions=${assertions} http_calls=0 paid_calls=0 fixtures=synthetic-token-and-storage\n`);
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
