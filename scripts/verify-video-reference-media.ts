import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdtemp,mkdir,realpath,rm,unlink,writeFile} from "node:fs/promises";
import {createServer,type Server} from "node:http";
import {tmpdir} from "node:os";
import path from "node:path";
import {createVideoReferenceMediaUrl,issueVideoReferenceToken,verifyVideoReferenceToken,VIDEO_REFERENCE_MEDIA_PATH,type VideoReferenceMediaAsset} from "../src/lib/video/reference-media-token";
import {createVideoReferenceMediaHandler,readVerifiedVideoReferenceLocal} from "../src/lib/video/reference-media";
import {MEDIA_DIR,storageDriver} from "../src/lib/storage";

/** Synthetic token/storage fixture plus loopback-only HTTP; no database or supplier call. */
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
async function bounded<T>(work:Promise<T>,message:string,milliseconds=1500):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([work,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]);}
  finally{if(timer)clearTimeout(timer);}
}
function pendingCancelResponse(range:string,{invalidLength=false,body=bytes.slice(0,1)}:{invalidLength?:boolean;body?:Uint8Array}={}){
  const observed={cancellations:0,pulls:0};
  const stream=new ReadableStream<Uint8Array>({
    start(controller){controller.enqueue(body);},
    pull(controller){observed.pulls++;controller.close();},
    cancel(){observed.cancellations++;return new Promise<void>(()=>{});},
  });
  const init=rangeHeader(range);if(invalidLength)init.headers["content-length"]="999";
  return {observed,response:new Response(stream,{status:init.status,headers:init.headers})};
}
async function headReleaseRegression(){
  for(const clientRange of [undefined,"bytes=4-7","bytes=-4"]){
    let wire="",probe:ReturnType<typeof pendingCancelResponse>|undefined;
    const handler=createVideoReferenceMediaHandler({...deps,fetchObject:async(_key,range)=>{wire=range;probe=pendingCancelResponse(range);return probe.response;}});
    const response=await bounded(handler(request("HEAD",clientRange),token),"HEAD must finish even when an unread source's cancel promise would never settle");
    equal(wire,"bytes=0-0","Every HEAD probes one source byte regardless of the client Range");
    equal(response.status,clientRange?206:200,"HEAD keeps the client's response status");
    equal(response.headers.get("content-length"),clientRange?"4":String(bytes.length),"HEAD exposes the client's full/range length rather than its one-byte probe length");
    equal(response.headers.get("content-range"),clientRange==="bytes=4-7"?`bytes 4-7/${bytes.length}`:clientRange?`bytes 12-15/${bytes.length}`:null,"HEAD client range metadata is canonicalized");
    equal(await response.text(),"","HEAD carries no response bytes");
    assert(probe);assertions++;
    equal(probe.observed.pulls,1,"HEAD consumes the finite one-byte source through its end");
    safeResponse(response,"Finite HEAD");
  }
  for(const useLocal of [false,true]){
    let released=0,fallbacks=0;
    const handler=createVideoReferenceMediaHandler({...deps,fetchObject:async(_key,range)=>{
      const probe=pendingCancelResponse(range,{invalidLength:true});
      const cancel=probe.response.body!.cancel.bind(probe.response.body);
      Object.defineProperty(probe.response.body,"cancel",{value:()=>{released++;return cancel();}});
      return probe.response;
    },readLocal:async(_claims,range)=>{fallbacks++;return useLocal?mediaResponse(range):null;}});
    const response=await bounded(handler(request("HEAD","bytes=4-7"),token),"Releasing invalid upstream bytes must not block fallback or an unavailable response");
    equal(released,1,"Invalid upstream cancellation is initiated");equal(fallbacks,1,"Invalid upstream still reaches verified local fallback");
    equal(response.status,useLocal?206:503,"Pending cancellation does not change the fallback result");
    equal(await response.text(),"","Fallback HEAD/503 carries no bytes");safeResponse(response,"Pending cancellation failure");
  }
  let localCancellation=0;
  const invalidLocal=createVideoReferenceMediaHandler({...deps,fetchObject:async()=>{throw new Error("synthetic unavailable");},readLocal:async(_claims,range)=>{
    const probe=pendingCancelResponse(range,{invalidLength:true});
    const cancel=probe.response.body!.cancel.bind(probe.response.body);
    Object.defineProperty(probe.response.body,"cancel",{value:()=>{localCancellation++;return cancel();}});return probe.response;
  }});
  equal((await bounded(invalidLocal(request("HEAD"),token),"Invalid local response cancellation must not block 503")).status,503,"Invalid fallback fails closed");
  equal(localCancellation,1,"Invalid fallback release is initiated without waiting");
  for(const body of [new Uint8Array(),bytes.slice(0,2)]){
    const invalidProbe=createVideoReferenceMediaHandler({...deps,fetchObject:async(_key,range)=>pendingCancelResponse(range,{body}).response,readLocal:async()=>null});
    equal((await bounded(invalidProbe(request("HEAD"),token),"Malformed one-byte probe must finish")).status,503,"HEAD rejects a source whose actual body does not match the single byte declared");
  }
  let failedReadFallbacks=0;
  const failedRead=createVideoReferenceMediaHandler({...deps,fetchObject:async(_key,range)=>{
    const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes.slice(0,1));},pull(controller){controller.error(new Error("Synthetic probe read failure"));}});
    return new Response(stream,rangeHeader(range));
  },readLocal:async(_claims,range)=>{failedReadFallbacks++;return mediaResponse(range);}});
  equal((await bounded(failedRead(request("HEAD"),token),"Probe read errors must not block verified fallback")).status,200,"HEAD read rejection uses verified local fallback");
  equal(failedReadFallbacks,1,"HEAD read rejection releases the failed source before fallback");
}
async function listen(server:Server):Promise<string>{
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>{server.off("error",reject);resolve();});});
  const address=server.address();assert(address&&typeof address!=="string");return `http://127.0.0.1:${address.port}`;
}
async function close(server:Server){await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
let loopbackCalls=0;
async function realHTTPHeadRegression(){
  const sourceRequests:Array<{method:string|undefined;range:string|undefined;bytes:number}>=[];
  const origin=createServer((incoming,outgoing)=>{
    const range=String(incoming.headers.range||""),init=rangeHeader(range),match=/^bytes=(\d+)-(\d+)$/.exec(range);
    const body=match?bytes.slice(Number(match[1]),Number(match[2])+1):bytes;
    sourceRequests.push({method:incoming.method,range:incoming.headers.range,bytes:body.byteLength});loopbackCalls++;
    outgoing.writeHead(init.status,{...init.headers,"set-cookie":"origin-private=never-forward","x-api-key":"origin-private"});outgoing.end(body);
  });
  const originURL=await listen(origin);
  const handler=createVideoReferenceMediaHandler({...deps,fetchObject:async(_key,range)=>fetch(originURL+"/synthetic-object",{headers:{range},redirect:"manual"}),readLocal:async()=>null});
  const bridge=createServer((incoming,outgoing)=>{
    loopbackCalls++;
    void handler(new Request("http://127.0.0.1/reference",{method:incoming.method,headers:incoming.headers.range?{range:incoming.headers.range}:{}}),token).then(async response=>{
      outgoing.writeHead(response.status,Object.fromEntries(response.headers));outgoing.end(Buffer.from(await response.arrayBuffer()));
    }).catch(error=>{outgoing.destroy(error instanceof Error?error:new Error("Synthetic bridge failed"));});
  });
  try{
    const bridgeURL=await listen(bridge);
    for(const [range,status,length,contentRange] of [[undefined,200,16,null],["bytes=4-7",206,4,"bytes 4-7/16"],["bytes=-4",206,4,"bytes 12-15/16"]] as const){
      const response=await fetch(bridgeURL+"/reference",{method:"HEAD",headers:range?{range}:{},signal:AbortSignal.timeout(2000)});
      equal(response.status,status,"Real HTTP HEAD exposes the requested full/range status");equal(response.headers.get("content-length"),String(length),"Real HTTP HEAD exposes the requested media length");
      equal(response.headers.get("content-range"),contentRange,"Real HTTP HEAD exposes exact client range metadata");equal(response.headers.get("content-type"),source.contentType,"Real HTTP HEAD exposes MIME");
      equal(response.headers.get("etag"),`"${sha256}"`,"Real HTTP HEAD exposes the frozen digest");equal((await response.arrayBuffer()).byteLength,0,"Actual HTTP HEAD transmits no media body");safeResponse(response,"Loopback HEAD");
    }
    equal(sourceRequests,Array.from({length:3},()=>({method:"GET",range:"bytes=0-0",bytes:1})),"Real storage source only receives bounded one-byte GETs for every HEAD variant");
  }finally{await close(bridge);await close(origin);}
}
async function localDriverRegression(root:string){
  equal(storageDriver,"local","Fresh import uses the actual local storage driver");equal(MEDIA_DIR,path.resolve(root),"Fresh import freezes the isolated synthetic media directory");
  const file=path.join(root,source.key);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);
  // Only metadata is injected: object access and local SHA verification use production defaults.
  const handler=createVideoReferenceMediaHandler({secret,now:()=>now,getAsset:async()=>({...asset})});
  const full=await handler(request(),token);equal(full.status,200,"Default local driver serves the matching frozen object");equal(new Uint8Array(await full.arrayBuffer()),bytes,"Default local driver returns the verified object bytes");
  const head=await bounded(handler(request("HEAD","bytes=4-7"),token),"Default local HEAD must complete");
  equal(head.status,206,"Default local HEAD supports client ranges");equal(head.headers.get("content-range"),"bytes 4-7/16","Default local HEAD preserves range metadata");equal(await head.text(),"","Default local HEAD has no bytes");
  await writeFile(file,Uint8Array.from(bytes,value=>255-value));
  for(const method of ["GET","HEAD"])for(const range of [undefined,"bytes=4-7"]){
    const response=await bounded(handler(request(method,range),token),"Corrupt local object must fail closed promptly");
    equal(response.status,503,"Default local backend cannot bypass frozen SHA verification with a same-length object");equal(await response.text(),"","Corrupt local object exposes no bytes");safeResponse(response,"Corrupt default local object");
  }
  process.stdout.write(`VIDEO_REFERENCE_LOCAL_DRIVER=PASS assertions=${assertions} database_calls=0 http_calls=0 paid_calls=0\n`);
}
async function isolatedLocalDriverRegression(root:string){
  const env:NodeJS.ProcessEnv={NODE_ENV:"test",STORAGE_DRIVER:"local",MEDIA_PRIVATE:"1",MEDIA_DIR:root,DATABASE_URL:""};
  for(const key of ["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","HOME","USERPROFILE","NODE_PATH"])if(process.env[key])env[key]=process.env[key];
  const child=spawnSync(process.execPath,["--conditions=react-server",process.argv[1],"--local-driver-fixture",root],{env,encoding:"utf8",timeout:15_000,windowsHide:true});
  equal(child.status,0,`Fresh local driver integration completes: ${child.stderr}`);assert.match(child.stdout,/VIDEO_REFERENCE_LOCAL_DRIVER=PASS/);assertions++;
}
async function main(){
  const childMode=process.argv.indexOf("--local-driver-fixture");if(childMode>=0){await localDriverRegression(process.argv[childMode+1]);return;}
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
  await headReleaseRegression();await realHTTPHeadRegression();
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
    await isolatedLocalDriverRegression(localRoot);
  }finally{
    // Only remove this freshly created synthetic fixture beneath its checked temp parent.
    assert.equal(path.dirname(localRoot),temporaryParent);assert(path.basename(localRoot).startsWith("naumi-video-reference-fixture-"));
    assert.equal(await realpath(localRoot),localRoot);await rm(localRoot,{recursive:true});
  }
  process.stdout.write(`VIDEO_REFERENCE_MEDIA=PASS assertions=${assertions} loopback_http_calls=${loopbackCalls} external_http_calls=0 database_calls=0 paid_calls=0 fixtures=synthetic-token-storage-and-loopback\n`);
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
