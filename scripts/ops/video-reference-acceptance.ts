/** Real candidate HTTP/storage/reference acceptance. Never submits a model request.
 * Bundle for Node with server-only replaced by the existing CLI shim and native
 * dependencies external. Feed {cookie,root?,publicCheck?} through stdin only.
 */
import "server-only";
import sharp from "sharp";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {constants,lstatSync,mkdirSync,openSync,closeSync,readFileSync,readdirSync,realpathSync,writeFileSync} from "node:fs";
import path from "node:path";
import {dbEnabled,getPool} from "../../src/lib/db";
import {deleteImageByUrl,managedObjectExists,privateMedia,remoteMediaAccess,storageDriver,storageKeyFromManagedUrl} from "../../src/lib/storage";
import {materializeVideoReferences} from "../../src/lib/video/reference-materialization";
import {matchesVideoReferenceMediaAsset,verifyVideoReferenceMediaPathSegment,VIDEO_REFERENCE_MEDIA_PATH} from "../../src/lib/video/reference-media-token";
import type {VideoGenerationRequest} from "../../src/lib/video/types";
import {MEDIA_JOB_DIR,mediaWorkerHealth,probeVideo} from "../../src/lib/video/media";

const LOCAL_ORIGIN="http://127.0.0.1:3000",PUBLIC_ORIGIN="https://47.105.59.142";
const PREFIX="VIDEO_REFERENCE_ACCEPTANCE_",MAX_HTTP_BYTES=1024*1024;
type Input={cookie:string;root?:string;publicCheck?:boolean;mediaProbePath?:string;mediaProbeSha256?:string};
type Asset={key:string;owner:string;public:boolean;remote_ready:boolean;driver:string;sha256:string;bytes:string|number;content_type:string;thumbnail_key:string|null;preview_key:string|null};
type Artwork={id:string;email:string;title:string;image_url:string;deleted_at:string|null;status:string};
type Expected={sha256:string;bytes:number;mime:string};
class AcceptanceFailure extends Error{constructor(readonly code:string){super(code);}}
function check(value:unknown,code:string):asserts value{if(!value)throw new AcceptanceFailure(code);}
function sha(bytes:Uint8Array){return createHash("sha256").update(bytes).digest("hex");}
function errorCode(error:unknown){return error instanceof AcceptanceFailure?error.code:"UNEXPECTED_ACCEPTANCE_FAILURE";}
function inputFromStdin():Input{
  const raw=readFileSync(0,"utf8");check(raw.length<=64*1024,"INPUT_TOO_LARGE");
  let value:unknown;try{value=JSON.parse(raw);}catch{throw new AcceptanceFailure("INPUT_INVALID_JSON");}
  check(value&&typeof value==="object"&&!Array.isArray(value),"INPUT_INVALID");
  const input=value as Input;
  check(typeof input.cookie==="string"&&input.cookie.length>0&&input.cookie.length<=16384&&!/[\r\n\0]/.test(input.cookie),"INPUT_COOKIE_INVALID");
  check(input.root===undefined||typeof input.root==="string"&&input.root.length>0,"INPUT_ROOT_INVALID");
  check(input.publicCheck===undefined||typeof input.publicCheck==="boolean","INPUT_PUBLIC_CHECK_INVALID");
  check(input.mediaProbePath===undefined&&input.mediaProbeSha256===undefined||
    typeof input.mediaProbePath==="string"&&/^\/data\/isolated-provider-probes\/provider-video-probe-20261023\/[A-Za-z0-9_.-]+\.mp4$/.test(input.mediaProbePath)&&
    typeof input.mediaProbeSha256==="string"&&/^[a-f0-9]{64}$/.test(input.mediaProbeSha256),"INPUT_MEDIA_PROBE_INVALID");
  return input;
}
function privateRecorder(root:string|undefined,id:string){
  if(!root)return (_name:string,_value:unknown)=>{};
  const directory=path.resolve(root);
  check(path.isAbsolute(root)&&directory!==path.parse(directory).root,"PRIVATE_ROOT_INVALID");
  mkdirSync(directory,{recursive:true,mode:0o700});
  const info=lstatSync(directory);
  check(info.isDirectory()&&!info.isSymbolicLink()&&realpathSync(directory)===directory&&
    (info.mode&0o077)===0&&(!process.getuid||info.uid===process.getuid()),"PRIVATE_ROOT_NOT_PROTECTED");
  return (name:string,value:unknown)=>{
    check(/^[A-Z_]+$/.test(name),"PRIVATE_RECORD_NAME_INVALID");
    const fd=openSync(path.join(directory,`${id}-${name}.json`),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    try{writeFileSync(fd,JSON.stringify(value,null,2)+"\n");}finally{closeSync(fd);}
  };
}
async function request(url:string,options:RequestInit={}){
  const target=new URL(url);
  check([LOCAL_ORIGIN,PUBLIC_ORIGIN].includes(target.origin)&&!target.username&&!target.password&&!target.hash,"HTTP_TARGET_INVALID");
  return fetch(target,{...options,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(60000)});
}
async function bytes(response:Response){
  const declared=Number(response.headers.get("content-length")||0);check(declared<=MAX_HTTP_BYTES,"HTTP_BODY_TOO_LARGE");
  const reader=response.body?.getReader();if(!reader)return Buffer.alloc(0);
  let size=0;const chunks:Uint8Array[]=[];
  try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;check(size<=MAX_HTTP_BYTES,"HTTP_BODY_TOO_LARGE");chunks.push(item.value);}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}
async function json(response:Response){try{return JSON.parse((await bytes(response)).toString("utf8")) as Record<string,unknown>;}catch(error){if(error instanceof AcceptanceFailure)throw error;throw new AcceptanceFailure("HTTP_JSON_INVALID");}}
function checkedHeaders(response:Response){
  check(!["set-cookie","authorization","x-api-key","location"].some(name=>response.headers.has(name)),"REFERENCE_HEADER_LEAK");
  check(response.headers.get("cache-control")?.includes("no-store"),"REFERENCE_CACHE_NOT_PRIVATE");
  check(response.headers.get("content-type")?.split(";",1)[0]==="image/png","REFERENCE_MIME_CHANGED");
}
async function proveReference(origin:string,signed:URL,image:string,body:Buffer){
  const target=new URL(signed.pathname,origin).href;
  const get=await request(target);check(get.status===200,"REFERENCE_GET_STATUS");checkedHeaders(get);
  const original=await bytes(get);check(original.length===body.length&&sha(original)===sha(body),"REFERENCE_GET_BYTES_CHANGED");
  const metadata=await sharp(original,{failOn:"error"}).metadata();await sharp(original,{failOn:"error"}).raw().toBuffer();
  check(metadata.width===96&&metadata.height===64&&metadata.format==="png","REFERENCE_GET_NOT_ORIGINAL_IMAGE");
  const head=await request(target,{method:"HEAD"});check(head.status===200,"REFERENCE_HEAD_STATUS");checkedHeaders(head);
  check(Number(head.headers.get("content-length"))===body.length&&head.headers.get("accept-ranges")==="bytes"&&(await bytes(head)).length===0,"REFERENCE_HEAD_INVALID");
  const range=await request(target,{headers:{range:"bytes=5-104"}});check(range.status===206,"REFERENCE_RANGE_STATUS");checkedHeaders(range);
  check(range.headers.get("content-range")===`bytes 5-104/${body.length}`&&(await bytes(range)).equals(body.subarray(5,105)),"REFERENCE_RANGE_BYTES_CHANGED");
  const parts=signed.pathname.slice(VIDEO_REFERENCE_MEDIA_PATH.length).split(".");check(parts.length===5&&parts[4]==="png","REFERENCE_TOKEN_SHAPE");
  parts[3]=(parts[3][0]==="A"?"B":"A")+parts[3].slice(1);
  const invalid=await request(new URL(VIDEO_REFERENCE_MEDIA_PATH+parts.join("."),origin).href);
  check(invalid.status===404,"INVALID_REFERENCE_TOKEN_NOT_DENIED");await invalid.body?.cancel();
  const denied=await request(new URL(image,origin).href);check(denied.status===401,"ORDINARY_MEDIA_ANONYMOUS_ACCESS");await denied.body?.cancel();
  return {get:200,HEAD:200,Range:206,invalidToken:404,ordinaryMediaAnonymous:401,decodedOriginal:true};
}

async function verify(input:Input){
  const verificationId=randomUUID(),title=PREFIX+verificationId,startedAt=new Date().toISOString();
  const record=privateRecorder(input.root,verificationId),pool=getPool(),auth={cookie:input.cookie};
  const proof:Record<string,unknown>={passed:false,verificationId,sourceCommit:process.env.SOURCE_COMMIT||"",buildVersion:process.env.BUILD_VERSION||"",
    observedAt:startedAt,publicCheck:input.publicCheck===true,actualUpload:false,signatureDirectDownload:false,HEAD:false,Range:false,verificationDataCleaned:false,supplierCalls:0};
  let stage="PREFLIGHT",actor="",uploadStarted=false,uploadResponseKnown=false,uploadStatus:number|undefined,flowPassed=false;
  let receipt:{id:string;image:string}|undefined,body:Buffer|undefined,originalSha="";
  const expectedVariants=new Map<string,Expected>();let error:unknown,cleanupError:unknown;
  record("STARTED",{verificationId,title,startedAt,sourceCommit:proof.sourceCommit,buildVersion:proof.buildVersion});
  try{
    check(dbEnabled&&privateMedia&&remoteMediaAccess==="proxy"&&storageDriver==="s3","PRIVATE_PROXY_STORAGE_REQUIRED");
    check(process.env.VIDEO_REFERENCE_PUBLIC_BASE_URL===PUBLIC_ORIGIN,"PUBLIC_REFERENCE_ORIGIN_NOT_FIXED");
    check(/^[a-f0-9]{40}$/.test(String(proof.sourceCommit))&&/^\d{10,13}$/.test(String(proof.buildVersion)),"CANDIDATE_SOURCE_PIN_INVALID");
    const sessionResponse=await request(LOCAL_ORIGIN+"/api/auth/session",{headers:auth});check(sessionResponse.status===200,"AUTH_SESSION_HTTP");
    const session=await json(sessionResponse),user=session.user as {email?:unknown}|undefined;
    check(typeof user?.email==="string"&&user.email.length>0&&user.email.length<=320,"AUTH_SESSION_ACTOR_MISSING");actor=user.email.toLowerCase();
    body=await sharp(randomBytes(96*64*3),{raw:{width:96,height:64,channels:3}}).png().toBuffer();originalSha=sha(body);
    const preview=await sharp(body).webp({quality:80}).toBuffer(),ownerKey=sha(Buffer.from(actor)).slice(0,16);
    for(const name of ["thumbnail","preview"]){const key=`media-variants/${ownerKey}-${originalSha}-${name}-${sha(preview).slice(0,16)}.webp`;expectedVariants.set(key,{sha256:sha(preview),bytes:preview.length,mime:"image/webp"});}
    const preexisting=await pool.query("SELECT (SELECT count(*) FROM app_media_assets WHERE key=ANY($1::text[]) OR sha256=$2)::int AS assets,(SELECT count(*) FROM app_artworks WHERE email=$3 AND title=$4)::int AS artworks",[[...expectedVariants.keys()],originalSha,actor,title]);
    check(preexisting.rows[0]?.assets===0&&preexisting.rows[0]?.artworks===0,"VERIFICATION_IDENTITY_ALREADY_EXISTS");
    record("UPLOAD_INTENT",{verificationId,title,actor,originalSha256:originalSha,bytes:body.length,expectedVariantKeys:[...expectedVariants.keys()]});
    const form=new FormData();form.set("image",new File([new Uint8Array(body)],"video-reference-acceptance.png",{type:"image/png"}));
    form.set("thumbnail",new File([new Uint8Array(preview)],"thumbnail.webp",{type:"image/webp"}));form.set("preview",new File([new Uint8Array(preview)],"preview.webp",{type:"image/webp"}));
    form.set("title",title);form.set("entry","canvas");form.set("canvasGroupId","video-reference-verification-"+verificationId);form.set("x","-99999");form.set("y","-99999");
    stage="UPLOAD";uploadStarted=true;
    const uploaded=await request(LOCAL_ORIGIN+"/api/artworks/add",{method:"POST",headers:auth,body:form});uploadResponseKnown=true;uploadStatus=uploaded.status;
    const value=await json(uploaded);
    check(uploaded.status===200&&value.ok===true&&typeof value.id==="string"&&/^art-\d+-\d+$/.test(value.id)&&value.image===`/media/canvas-uploads/${value.id}.png`,"UPLOAD_RECEIPT_INVALID");
    receipt={id:value.id,image:String(value.image)};proof.actualUpload=true;
    const key=storageKeyFromManagedUrl(receipt.image);check(key,"UPLOADED_STORAGE_KEY_INVALID");
    const artwork=(await pool.query<Artwork>("SELECT id,email,title,image_url,deleted_at,status FROM app_artworks WHERE id=$1 AND email=$2 AND title=$3",[receipt.id,actor,title])).rows[0];
    check(artwork?.image_url===receipt.image&&artwork.status==="completed"&&!artwork.deleted_at,"UPLOADED_ARTWORK_BINDING_INVALID");
    const asset=(await pool.query<Asset>("SELECT key,owner,public,remote_ready,driver,sha256,bytes,content_type,thumbnail_key,preview_key FROM app_media_assets WHERE key=$1",[key])).rows[0];
    check(asset?.owner===actor&&asset.public===false&&asset.driver==="s3"&&asset.sha256===originalSha&&Number(asset.bytes)===body.length&&asset.content_type==="image/png","UPLOADED_MEDIA_BINDING_INVALID");
    check(expectedVariants.has(asset.thumbnail_key||"")&&expectedVariants.has(asset.preview_key||"")&&asset.thumbnail_key!==asset.preview_key,"UPLOADED_VARIANTS_NOT_EXACT");
    record("UPLOAD_RECEIPT",{verificationId,title,actor,artworkId:receipt.id,image:receipt.image,asset});
    stage="MATERIALIZATION";
    const canonical:VideoGenerationRequest={source:"workbench",providerId:"apib-video",modelId:"kling-v3",prompt:"Synthetic reference acceptance. No model call.",mode:"single_image",durationSeconds:5,resolution:"720p",aspectRatio:"16:9",idempotencyKey:verificationId,
      references:[{id:"verification-reference",kind:"image",role:"first_frame",artworkId:receipt.id,url:receipt.image,sha256:originalSha}]};
    const frozen=JSON.stringify(canonical),materialized=await materializeVideoReferences(actor,canonical);
    check(JSON.stringify(canonical)===frozen,"MATERIALIZATION_MUTATED_CANONICAL_REQUEST");
    check(materialized.references.length===1&&materialized.references[0].storageKey===key&&materialized.references[0].sha256===originalSha,"MATERIALIZED_REFERENCE_IDENTITY_CHANGED");
    const signed=new URL(materialized.references[0].url||"");
    check(signed.origin===PUBLIC_ORIGIN&&signed.pathname.startsWith(VIDEO_REFERENCE_MEDIA_PATH)&&!signed.search&&!signed.hash&&!signed.username&&!signed.password,"MATERIALIZED_REFERENCE_NOT_PUBLIC_PROXY");
    const pathSegment=signed.pathname.slice(VIDEO_REFERENCE_MEDIA_PATH.length);
    check(/^vr1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.png$/.test(pathSegment),"MATERIALIZED_REFERENCE_SUFFIX_NOT_PNG");
    const claims=verifyVideoReferenceMediaPathSegment(pathSegment);
    check(claims&&claims.key===key&&claims.sha256===originalSha&&claims.bytes===body.length&&claims.expiresAt-claims.issuedAt<=900&&matchesVideoReferenceMediaAsset(claims,asset),"MATERIALIZED_SIGNATURE_NOT_EXACT");
    record("SIGNED_REFERENCE",{verificationId,artworkId:receipt.id,signedReferenceURL:signed.href,expiresAt:claims.expiresAt});
    if(input.mediaProbePath){
      stage="REAL_VIDEO_PROBE";
      const sampleInfo=lstatSync(input.mediaProbePath);
      check(sampleInfo.isFile()&&!sampleInfo.isSymbolicLink()&&sampleInfo.size>0&&sampleInfo.size<=16*1024*1024&&realpathSync(input.mediaProbePath)===input.mediaProbePath,"MEDIA_PROBE_FILE_NOT_REGULAR");
      const sample=readFileSync(input.mediaProbePath);check(sha(sample)===input.mediaProbeSha256,"MEDIA_PROBE_SAMPLE_SHA_CHANGED");
      const health=await mediaWorkerHealth();
      check(health.ok===true&&health.sandbox===true&&health.version===process.env.SOURCE_COMMIT&&health.draining===false,"REAL_MEDIA_WORKER_NOT_READY");
      const jobs=()=>new Set(readdirSync(MEDIA_JOB_DIR,{withFileTypes:true}).filter(item=>item.isDirectory()&&/^[a-f0-9-]{36}$/.test(item.name)).map(item=>item.name));
      const beforeJobs=jobs();let videoProbe:Awaited<ReturnType<typeof probeVideo>>|undefined;
      try{videoProbe=await probeVideo(sample);}
      finally{const leftover=[...jobs()].filter(id=>!beforeJobs.has(id));proof.mediaProbeCleaned=leftover.length===0;record("MEDIA_PROBE_CLEANUP",{verificationId,newJobDirectoriesRemaining:leftover,originalSampleSha256:input.mediaProbeSha256,originalSamplePreserved:true});check(!leftover.length,"MEDIA_PROBE_JOB_CLEANUP_PENDING");}
      check(videoProbe&&videoProbe.videoCodec&&videoProbe.width>0&&videoProbe.height>0&&videoProbe.durationSeconds>0,"REAL_VIDEO_PROBE_NO_STREAM");
      proof.mediaProbe={passed:true,sourceSha256:input.mediaProbeSha256,sourceBytes:sample.length,originalSamplePreserved:true,...videoProbe};
    }
    stage="LOCAL_SIGNED_HTTP";const local=await proveReference(LOCAL_ORIGIN,signed,receipt.image,body);
    let publicResult:Awaited<ReturnType<typeof proveReference>>|undefined;
    if(input.publicCheck){stage="PUBLIC_SIGNED_HTTP";publicResult=await proveReference(PUBLIC_ORIGIN,signed,receipt.image,body);}
    Object.assign(proof,{signatureDirectDownload:true,HEAD:true,Range:true,rangeStatus:206,headStatus:200,invalidTokenStatus:404,ordinaryMediaAnonymousStatus:401,
      originalSha256:originalSha,bytes:body.length,decodedOriginal:true,remoteReady:asset.remote_ready,local,...(publicResult?{public:publicResult}:{}),signatureLifetimeSeconds:claims.expiresAt-claims.issuedAt});
    flowPassed=true;
  }catch(caught){error=caught;proof.errorCode=errorCode(caught);proof.errorStage=stage;}
  finally{
    try{
      if(uploadStarted&&actor&&body){
        const found=(await pool.query<Artwork>("SELECT id,email,title,image_url,deleted_at,status FROM app_artworks WHERE email=$1 AND title=$2",[actor,title])).rows;
        check(found.length<=1,"CLEANUP_ARTWORK_AMBIGUOUS");
        const art=found[0];
        if(art){
          check(!receipt||receipt.id===art.id&&receipt.image===art.image_url,"CLEANUP_ARTWORK_RECEIPT_CHANGED");
          check(/^art-\d+-\d+$/.test(art.id)&&art.image_url===`/media/canvas-uploads/${art.id}.png`&&art.status==="completed","CLEANUP_ARTWORK_IDENTITY_CHANGED");
          receipt={id:art.id,image:art.image_url};
          const removed=await request(LOCAL_ORIGIN+"/api/artworks/delete",{method:"POST",headers:{...auth,"content-type":"application/json"},body:JSON.stringify({ids:[art.id]})});
          const removedBody=await json(removed);check(removed.status===200&&removedBody.ok===true&&[0,1].includes(Number(removedBody.deleted)),"CLEANUP_SOFT_DELETE_FAILED");
        }else check(uploadResponseKnown,"UPLOAD_ACCEPTANCE_UNKNOWN_RETAIN_VERIFICATION_INTENT");
        const originals=(await pool.query<Asset>("SELECT key,owner,public,remote_ready,driver,sha256,bytes,content_type,thumbnail_key,preview_key FROM app_media_assets WHERE owner=$1 AND sha256=$2 AND key LIKE 'canvas-uploads/%'",[actor,originalSha])).rows;
        check(originals.length<=1,"CLEANUP_ORIGINAL_AMBIGUOUS");
        const original=originals[0],expected=new Map(expectedVariants);
        if(!art&&!original)check(uploadResponseKnown&&uploadStatus!==undefined&&uploadStatus>=400&&uploadStatus<500,"CLEANUP_UPLOAD_WRITES_UNKNOWN");
        if(original){
          check(original.public===false&&original.content_type==="image/png"&&Number(original.bytes)===body.length&&/^canvas-uploads\/art-\d+-\d+\.png$/.test(original.key),"CLEANUP_ORIGINAL_IDENTITY_CHANGED");
          check(!receipt||storageKeyFromManagedUrl(receipt.image)===original.key,"CLEANUP_ORIGINAL_KEY_CHANGED");
          check(!original.thumbnail_key||expectedVariants.has(original.thumbnail_key),"CLEANUP_THUMBNAIL_CHANGED");
          check(!original.preview_key||expectedVariants.has(original.preview_key),"CLEANUP_PREVIEW_CHANGED");
          expected.set(original.key,{sha256:originalSha,bytes:body.length,mime:"image/png"});
        }
        check(!art||!!original,"CLEANUP_ORIGINAL_CATALOG_MISSING");
        const keys=[...expected.keys()],urls=keys.map(key=>`/media/${key}`),tx=await pool.connect();
        let assets:Asset[]=[];
        try{
          await tx.query("BEGIN");await tx.query("SET LOCAL statement_timeout='5s'");await tx.query("SET LOCAL lock_timeout='3s'");
          assets=(await tx.query<Asset>("SELECT key,owner,public,remote_ready,driver,sha256,bytes,content_type,thumbnail_key,preview_key FROM app_media_assets WHERE key=ANY($1::text[]) ORDER BY key FOR UPDATE",[keys])).rows;
          check(!original||assets.length===keys.length,"CLEANUP_MEDIA_CATALOG_INCOMPLETE");
          for(const item of assets){const identity=expected.get(item.key);check(identity&&item.owner===actor&&!item.public&&item.sha256===identity.sha256&&Number(item.bytes)===identity.bytes&&item.content_type===identity.mime,"CLEANUP_MEDIA_IDENTITY_CHANGED");}
          const referenced=(await tx.query("SELECT EXISTS(SELECT 1 FROM app_artworks WHERE id<>$1 AND (image_url=ANY($2::text[]) OR video_url=ANY($2::text[]) OR source_url=ANY($2::text[]))) AS artwork,EXISTS(SELECT 1 FROM app_media_assets WHERE NOT(key=ANY($3::text[])) AND (thumbnail_key=ANY($3::text[]) OR preview_key=ANY($3::text[]))) AS variant",[art?.id||"",urls,keys])).rows[0];
          check(!referenced.artwork&&!referenced.variant,"CLEANUP_OTHER_MEDIA_REFERENCE_EXISTS");
          if(original){const used=(await tx.query("SELECT EXISTS(SELECT 1 FROM app_video_tasks WHERE video_references @> $1::jsonb OR video_references @> $2::jsonb OR video_references @> $3::jsonb) AS used",[JSON.stringify([{storageKey:original.key}]),JSON.stringify([{url:`/media/${original.key}`}]),JSON.stringify([{artworkId:art?.id||""}])])).rows[0];check(!used.used,"CLEANUP_ACCEPTED_VIDEO_REFERENCE_EXISTS");}
          if(art){const current=(await tx.query<Artwork>("SELECT id,email,title,image_url,deleted_at,status FROM app_artworks WHERE id=$1 AND email=$2 AND title=$3 AND image_url=$4 FOR UPDATE",[art.id,actor,title,art.image_url])).rows[0];check(current?.deleted_at,"CLEANUP_ARTWORK_NOT_SOFT_DELETED");}
          const deleted=await Promise.allSettled(assets.map(async item=>{
            check(await deleteImageByUrl(`/media/${item.key}`),"CLEANUP_OBJECT_NOT_MANAGED");
            check(!await managedObjectExists(`/media/${item.key}`),"CLEANUP_OBJECT_STILL_EXISTS");
          }));
          check(deleted.every(item=>item.status==="fulfilled"),"CLEANUP_OBJECT_DELETE_NOT_VERIFIED");
          if(!original){const absent=await Promise.allSettled(keys.map(async key=>!await managedObjectExists(`/media/${key}`)));check(absent.every(item=>item.status==="fulfilled"&&item.value),"CLEANUP_UNCATALOGUED_OBJECT_REMAINS");}
          for(const item of assets){const removed=await tx.query("DELETE FROM app_media_assets WHERE key=$1 AND owner=$2 AND sha256=$3 AND bytes=$4 AND public=false",[item.key,actor,item.sha256,Number(item.bytes)]);check(removed.rowCount===1,"CLEANUP_MEDIA_CAS_FAILED");}
          if(original){const probes=(await tx.query("SELECT to_regclass('public.app_video_media_probes') AS name")).rows[0];if(probes.name){await tx.query("DELETE FROM app_video_media_probes WHERE storage_key=$1 AND sha256=$2",[original.key,originalSha]);const remain=(await tx.query("SELECT count(*)::int AS count FROM app_video_media_probes WHERE storage_key=$1 AND sha256=$2",[original.key,originalSha])).rows[0];check(remain.count===0,"CLEANUP_PROBE_ROWS_REMAIN");proof.verificationProbeRowsRemaining=0;}}
          if(art){const purged=await tx.query("DELETE FROM app_artworks WHERE id=$1 AND email=$2 AND title=$3 AND image_url=$4 AND deleted_at IS NOT NULL",[art.id,actor,title,art.image_url]);check(purged.rowCount===1,"CLEANUP_ARTWORK_PURGE_CAS_FAILED");}
          await tx.query("COMMIT");
        }catch(caught){await tx.query("ROLLBACK").catch(()=>{});throw caught;}finally{tx.release();}
        const remaining=(await pool.query("SELECT (SELECT count(*) FROM app_artworks WHERE email=$1 AND title=$2)::int AS artworks,(SELECT count(*) FROM app_media_assets WHERE key=ANY($3::text[]))::int AS assets",[actor,title,keys])).rows[0];
        check(remaining.artworks===0&&remaining.assets===0,"CLEANUP_VERIFICATION_ROWS_REMAIN");
        proof.verificationDataCleaned=true;proof.verificationAssetCount=assets.length;
        record("CLEANUP",{verificationId,artworkId:art?.id||null,keys,removedAssets:assets.length,verificationDataCleaned:true});
      }else proof.verificationDataCleaned=true;
    }catch(caught){cleanupError=caught;proof.cleanupErrorCode=errorCode(caught);proof.verificationDataCleaned=false;}
  }
  proof.passed=flowPassed&&!error&&!cleanupError&&proof.verificationDataCleaned===true;
  record("RESULT",proof);
  return proof;
}

async function main(){
  let proof:Record<string,unknown>;
  try{proof=await verify(inputFromStdin());}
  catch(error){proof={passed:false,errorCode:errorCode(error),verificationDataCleaned:false,supplierCalls:0};}
  if(dbEnabled)try{await getPool().end();}catch{proof.passed=false;proof.poolCloseErrorCode="DATABASE_POOL_CLOSE_FAILED";}
  process.stdout.write(JSON.stringify(proof)+"\n");if(proof.passed!==true)process.exitCode=1;
}
void main().catch(()=>{process.stdout.write(JSON.stringify({passed:false,errorCode:"ACCEPTANCE_CLI_FAILED",verificationDataCleaned:false,supplierCalls:0})+"\n");process.exitCode=1;});
