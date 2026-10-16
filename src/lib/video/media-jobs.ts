import { withBackgroundActivity, bindBackgroundClaim } from "@/lib/release-runtime/background-activity";
import "server-only";
import {verifiedOwnedMedia,type FrozenMediaInput} from "./media-inspection";
export {verifiedOwnedMedia} from "./media-inspection";
import {createHash,randomUUID} from "node:crypto";
import {getPool,ensureSchema,listArtworksByIds,addArtworksTx,type ArtworkRecord} from "../db";
import {canReadMedia,getMediaAsset,registerMediaAsset} from "../media-assets";
import {readManagedObject,storageKeyFromManagedUrl,writeStoredObject} from "../storage";
import {ModelConfigError} from "../model-config/types";
import {canonicalConfig} from "../model-config/repository";
import {getVideoNode,ensureVideoNodeSchema} from "../canvas/video-node-repository";
import {authorizeVideoProject} from "../canvas/video-node-service";
import {mediaJobRequestSchema,type MediaJobRequest,type MediaJobOutput,type MediaProbe,type MediaJobStatus,type PublicMediaJob} from "./media-job-schema";
import {prepareMediaInputs,prepareMediaAuxiliary,auxiliaryMediaBytes,mediaWorkerHealth,cleanupMediaWorkerJob,mediaWorkerRequest,mediaWorkerConfigured,readMediaWorkerOutput,MediaWorkerError,type WorkerJobView} from "./media";
import {encryptAtRest,decryptAtRest} from "../settings";
import {nativeMediaArgs,presetMediaCommand,replaceVirtual} from "../../../scripts/video-fusion/media-engine.mjs";
import {inspectMediaBundle} from "../../../scripts/video-fusion/media-bundle.mjs";
import {inspectedMediaMime} from "./media-formats";
import {mediaBillingQuote,confirmMediaQuote} from "./media-billing";
import {reserveTaskBillingTx,settleTaskBillingTx} from "../billing/task-operation";
import type {BillingQuote} from "../billing/types";

type BundleFile={name:string;key:string;sha256:string;bytes:number};
type FrozenInput=FrozenMediaInput&{bundleFiles?:BundleFile[];bundleEntry?:string};
type JobRow={id:string;email:string;operation_id:string;request:MediaJobRequest;input_digest:string;inputs:FrozenInput[];status:MediaJobStatus;processed_seconds:number;outputs:MediaJobOutput[];error:string|null;cancellation_requested_at:Date|null;created_at:Date;updated_at:Date;query_result:string|null;billing_quote:BillingQuote|null;auxiliary_files_enc:string|null;cleanup_completed_at:Date|null};
let ready:Promise<void>|undefined;
export async function ensureMediaJobSchema(){
  if(!ready)ready=ensureSchema().then(()=>getPool().query(`
    CREATE TABLE IF NOT EXISTS app_video_media_jobs(id uuid PRIMARY KEY,email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,
      request jsonb NOT NULL,inputs jsonb NOT NULL,status text NOT NULL DEFAULT 'queued',processed_seconds double precision NOT NULL DEFAULT 0,
      outputs jsonb NOT NULL DEFAULT '[]',query_result text,error text,cancellation_requested_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(email,operation_id));
    CREATE INDEX IF NOT EXISTS app_video_media_jobs_pending_idx ON app_video_media_jobs(updated_at) WHERE status IN ('queued','processing');
    CREATE INDEX IF NOT EXISTS app_video_media_jobs_owner_history_idx ON app_video_media_jobs(email,created_at DESC,id DESC);
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS billing_quote jsonb;
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS auxiliary_files_enc text;
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS cleanup_completed_at timestamptz;
    ALTER TABLE app_video_media_jobs ADD COLUMN IF NOT EXISTS output_manifest jsonb;
    CREATE TABLE IF NOT EXISTS app_video_media_probes(storage_key text NOT NULL,sha256 text NOT NULL,probe jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(storage_key,sha256));
  `)).then(()=>undefined).catch(error=>{ready=undefined;throw error;});await ready;
}
function unavailable():never{throw new ModelConfigError("MEDIA_INPUT_UNAVAILABLE","媒体素材不存在或无权访问",404);}
function digest(value:unknown){return createHash("sha256").update(canonicalConfig(value)).digest("hex");}
async function resolveInput(actor:string,id:string):Promise<FrozenInput>{
  const bundle=id.match(/^media-job:([0-9a-f-]{36}):bundle:(.+)$/);
  if(bundle){
    const row=await getRow(actor,bundle[1]),entry=row?.outputs.find(file=>file.name===bundle[2]);
    if(!row||row.status!=="completed"||!entry||!entry.probe||!/\.(m3u8|mpd)$/i.test(entry.name))unavailable();
    const files=[];for(const output of row.outputs){
      if(!await canReadMedia(output.storageKey,actor))unavailable();
      const object=await readManagedObject(output.url,250*1024*1024);
      if(object.bytes.byteLength!==output.bytes||createHash("sha256").update(object.bytes).digest("hex")!==output.sha256)throw new ModelConfigError("MEDIA_INPUT_CHANGED","分片包素材已改变，请重新选择",422);
      files.push({name:output.name,key:output.storageKey,sha256:output.sha256,bytes:output.bytes});
    }
    if(files.reduce((size,file)=>size+file.bytes,0)>250*1024*1024)throw new ModelConfigError("MEDIA_INPUT_TOO_LARGE","分片包输入超过250MB限制",422);
    return {key:entry.storageKey,artworkId:entry.artworkId,sha256:entry.sha256,bytes:entry.bytes,mimeType:entry.mimeType,extension:entry.name.endsWith(".m3u8")?"m3u8":"mpd",probe:entry.probe,groupId:null,bundleEntry:entry.name,bundleFiles:files};
  }
  let art=(await listArtworksByIds(actor,[id]))[0];
  if(!art){const node=await getVideoNode(actor,id.replace(/^video:/,""));const resultId=node?.displayResultId||node?.lastResultId;if(resultId)art=(await listArtworksByIds(actor,[resultId]))[0];}
  if(art&&art.status!=="completed")throw new ModelConfigError("MEDIA_INPUT_PENDING","前序媒体尚未完成",422);
  const key=art?storageKeyFromManagedUrl(art.videoUrl||art.image):storageKeyFromManagedUrl(id)||id;
  if(!key)unavailable();return verifiedOwnedMedia(actor,key,art?.id||null);
}
export function publicMediaJob(row:JobRow):PublicMediaJob{return {id:row.id,jobId:row.id,operationId:row.operation_id,status:row.status,action:row.request.action,processedSeconds:Number(row.processed_seconds),outputs:row.outputs,
  queryResult:row.query_result,error:row.error,cost:row.billing_quote?.authorizedCredits||0,billingVersion:row.billing_quote?.configVersion||null,cancellationRequestedAt:row.cancellation_requested_at?.toISOString()||null,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),
  projectKey:row.request.projectKey||null,source:row.request.source,inputArtworkIds:row.inputs.flatMap(input=>input.artworkId?[input.artworkId]:[])};}
export async function listMediaJobs(actorRaw:string,options:{projectKey?:string;source?:MediaJobRequest["source"];operationId?:string;cursor?:{createdAt:string;id:string};limit?:number}={}){
  const actor=actorRaw.toLowerCase();await ensureMediaJobSchema();const limit=options.limit??30;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new ModelConfigError("INVALID_MEDIA_PAGE","媒体任务分页数量无效",422);
  const rows=(await getPool().query(`SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at FROM app_video_media_jobs WHERE email=$1 AND ($2::text IS NULL OR request->>'projectKey'=$2) AND ($3::text IS NULL OR request->>'source'=$3)
    AND ($4::uuid IS NULL OR operation_id=$4) AND ($5::timestamptz IS NULL OR (created_at,id)<($5::timestamptz,$6::uuid)) ORDER BY created_at DESC,id DESC LIMIT $7`,[actor,options.projectKey||null,options.source||null,options.operationId||null,options.cursor?.createdAt||null,options.cursor?.id||null,limit+1])).rows as Array<JobRow&{cursor_created_at:string}>;
  const page:JobRow[]=rows.slice(0,limit),last=rows[Math.min(rows.length,limit)-1],nextCursor=rows.length>limit&&last?{createdAt:last.cursor_created_at,id:last.id}:null;
  if(!options.cursor&&!options.operationId){const pending=(await getPool().query("SELECT * FROM app_video_media_jobs WHERE email=$1 AND status IN ('queued','processing') AND ($2::text IS NULL OR request->>'projectKey'=$2) AND ($3::text IS NULL OR request->>'source'=$3)",[actor,options.projectKey||null,options.source||null])).rows as JobRow[];const known=new Set(page.map(row=>row.id));page.push(...pending.filter(row=>!known.has(row.id)));}
  return {jobs:page.map(publicMediaJob),nextCursor};
}
async function getRow(actor:string,id:string):Promise<JobRow|null>{await ensureMediaJobSchema();return (await getPool().query("SELECT * FROM app_video_media_jobs WHERE email=$1 AND id=$2",[actor,id])).rows[0]||null;}
function presetOutputs(request:MediaJobRequest):string[]{
  if(["ffmpeg","ffprobe"].includes(request.action))return request.outputs;
  if(request.outputs.length)throw new ModelConfigError("INVALID_MEDIA_OUTPUTS","预设处理使用固定格式，请使用原生命令自定义输出",422);
  return request.action==="frame"?["frame.png"]:request.action==="extract_audio"?["audio.wav"]:request.action==="separate"?["silent.mp4","audio.wav"]:["video.mp4"];
}
export async function createMediaJob(actorRaw:string,raw:unknown){
  const actor=actorRaw.toLowerCase(),parsed=mediaJobRequestSchema.safeParse(raw);
  if(!parsed.success)throw new ModelConfigError("INVALID_MEDIA_JOB","媒体处理参数无效",422,parsed.error.issues.map(issue=>issue.path.join(".")));
  const request=parsed.data,{billingConfirmation:_confirmation,...intent}=request,hash=digest(intent);await ensureMediaJobSchema();
  const replay=(await getPool().query("SELECT * FROM app_video_media_jobs WHERE email=$1 AND operation_id=$2",[actor,request.operationId])).rows[0] as JobRow|undefined;
  if(replay){if(replay.input_digest!==hash)throw new ModelConfigError("MEDIA_OPERATION_CONFLICT","操作编号已用于其他媒体处理",409);return publicMediaJob(replay);}
  if(!mediaWorkerConfigured())throw new ModelConfigError("MEDIA_WORKER_UNAVAILABLE","媒体处理服务暂不可用",503);
  const pending=(await getPool().query("SELECT count(*) AS total,count(*) FILTER(WHERE email=$1) AS own FROM app_video_media_jobs WHERE status IN ('queued','processing')",[actor])).rows[0];
  if(Number(pending.total)>=64||Number(pending.own)>=8)throw new ModelConfigError("MEDIA_QUEUE_FULL","媒体任务过多，请等待现有任务完成",429);
  if(request.projectKey)await authorizeVideoProject(actor,request.projectKey);
  presetOutputs(request);const inputs=[];for(const id of request.inputs)inputs.push(await resolveInput(actor,id));
  if(inputs.reduce((n,input)=>n+(input.bundleFiles?input.bundleFiles.reduce((size,file)=>size+file.bytes,0):input.bytes),0)>250*1024*1024)throw new ModelConfigError("MEDIA_INPUT_TOO_LARGE","媒体输入超过250MB限制",422);
  if(inputs.reduce((n,input)=>n+(input.bundleFiles?.length||1),0)>1000)throw new ModelConfigError("MEDIA_INPUT_TOO_MANY","媒体输入文件过多",422);
  const first=inputs[0]?.probe;
  if(request.action==="trim"&&request.end!>first.durationSeconds+0.001)throw new ModelConfigError("INVALID_TRIM_RANGE","裁剪超出原视频时长",422);
  if(request.action==="frame"&&typeof request.timestamp==="number"&&request.timestamp>=first.durationSeconds)throw new ModelConfigError("INVALID_FRAME_TIME","抽帧时间超出原视频时长",422);
  if(["extract_audio","separate"].includes(request.action)&&!first.audioCodecs.length)throw new ModelConfigError("AUDIO_STREAM_UNAVAILABLE","原视频没有音轨",422);
  try{
    for(const file of request.auxiliaryFiles)auxiliaryMediaBytes(file);
    const virtualInputs=inputs.map((item,index)=>item.bundleEntry?`/inputs/bundle-${index}/${item.bundleEntry}`:`/inputs/input-${index}.${item.extension}`),virtualOutputs=presetOutputs(request).map(name=>`/work/out/${name.replace(/\/$/,"")}`),virtualAuxiliary=request.auxiliaryFiles.map((file,index)=>`/inputs/aux-${index}-${file.name}`);
    for(const file of request.auxiliaryFiles)if(file.encoding==="utf8")replaceVirtual(file.content,virtualInputs,virtualOutputs,virtualAuxiliary);
    const args=presetMediaCommand(request,virtualInputs,virtualOutputs,inputs.map(input=>input.probe));
    if(!inputs.length&&!args.length)throw new Error("EMPTY_MEDIA_COMMAND");
    nativeMediaArgs(args,virtualInputs,virtualOutputs,request.action==="ffprobe"?"ffprobe":"ffmpeg",virtualAuxiliary);
  }catch{throw new ModelConfigError("INVALID_MEDIA_COMMAND","媒体处理参数或虚拟文件路径无效",422);}
  const billingQuote=await mediaBillingQuote(actor,request.action);confirmMediaQuote(billingQuote,request.billingConfirmation);
  const tx=await getPool().connect();let row:JobRow;
  try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`media:${actor}:${request.operationId}`]);
    const old=(await tx.query("SELECT * FROM app_video_media_jobs WHERE email=$1 AND operation_id=$2",[actor,request.operationId])).rows[0] as JobRow|undefined;
    if(old){if(old.input_digest!==hash)throw new ModelConfigError("MEDIA_OPERATION_CONFLICT","操作编号已用于其他媒体处理",409);row=old;}
    else{await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('media-create-capacity',0))");const counts=(await tx.query("SELECT count(*) AS total,count(*) FILTER(WHERE email=$1) AS own FROM app_video_media_jobs WHERE status IN ('queued','processing')",[actor])).rows[0];
      if(Number(counts.total)>=64||Number(counts.own)>=8)throw new ModelConfigError("MEDIA_QUEUE_FULL","媒体任务过多，请等待现有任务完成",429);
      const id=randomUUID(),storedRequest={...request,auxiliaryFiles:[]},auxiliaryEnc=request.auxiliaryFiles.length?encryptAtRest(JSON.stringify(request.auxiliaryFiles)):null;
      await reserveTaskBillingTx(tx,id,actor,billingQuote,`led-media-${id}`);
      row=(await tx.query("INSERT INTO app_video_media_jobs(id,email,operation_id,input_digest,request,inputs,billing_quote,auxiliary_files_enc) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8) RETURNING *",[id,actor,request.operationId,hash,JSON.stringify(storedRequest),JSON.stringify(inputs),JSON.stringify(billingQuote),auxiliaryEnc])).rows[0];}
    await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
  return publicMediaJob(row);
}
function outputMime(name:string,probe:MediaProbe|null,fragment=false){
  const extension=name.split(".").pop()?.toLowerCase();
  const types:Record<string,string>={png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",gif:"image/gif",mp4:"video/mp4",webm:"video/webm",mov:"video/quicktime",ts:"video/mp2t",m4s:"video/iso.segment",wav:"audio/wav",mp3:"audio/mpeg",m4a:"audio/mp4",ogg:"audio/ogg",flac:"audio/flac",m3u8:"application/vnd.apple.mpegurl",mpd:"application/dash+xml",json:"application/json",txt:"text/plain",srt:"application/x-subrip",ass:"text/plain",vtt:"text/vtt",csv:"text/csv",log:"text/plain",md5:"text/plain",ffconcat:"text/plain",fffilter:"text/plain",key:"application/octet-stream",bin:"application/octet-stream"};
  Object.assign(types,{mkv:"video/x-matroska",avi:"video/x-msvideo",flv:"video/x-flv",ogv:"video/ogg",mpg:"video/mpeg",mpeg:"video/mpeg",asf:"video/x-ms-asf",wmv:"video/x-ms-asf",mka:"audio/x-matroska",opus:"audio/ogg",aac:"audio/aac",aiff:"audio/aiff",aif:"audio/aiff",wma:"audio/x-ms-wma",bmp:"image/bmp",tif:"image/tiff",tiff:"image/tiff",apng:"image/apng"});
  let mime=types[extension||""];
  if(probe&&!fragment&&!probe.videoCodec&&probe.audioCodecs.length&&["mp4","mov","webm","mkv","ogg","asf"].includes(extension||""))mime=inspectedMediaMime(probe,"audio");
  if(probe&&!fragment&&["video/webm","audio/webm"].includes(mime))mime=inspectedMediaMime(probe,probe.videoCodec?"video":"audio",mime);
  if(probe?.videoCodec&&extension==="ogg")mime="video/ogg";
  if(!mime&&probe){try{mime=inspectedMediaMime(probe,"image");}catch{mime=inspectedMediaMime(probe,probe.videoCodec?"video":"audio");}}
  if(!mime)throw new Error("媒体输出格式无法确认");
  if(!fragment&&(mime.startsWith("video/")&&!probe?.videoCodec||mime.startsWith("audio/")&&!probe?.audioCodecs.length||mime.startsWith("image/")&&!probe?.width))throw new Error("媒体输出格式与实际流不一致");
  const formats:Record<string,string[]>={mp4:["mov","mp4"],mov:["mov"],m4a:["mov","mp4"],webm:["webm","matroska"],mkv:["matroska"],mka:["matroska"],avi:["avi"],flv:["flv"],ogv:["ogg"],opus:["ogg"],mpg:["mpeg"],mpeg:["mpeg"],asf:["asf"],wmv:["asf"],wma:["asf"],aac:["aac"],aif:["aiff"],aiff:["aiff"],ts:["mpegts"],wav:["wav"],mp3:["mp3"],ogg:["ogg"],flac:["flac"]};
  if(probe&&formats[extension||""]&&!formats[extension!].some(format=>probe.formatName.split(",").includes(format)))throw new Error("媒体输出容器与扩展名不一致");
  const images:Record<string,string>={png:"png",jpg:"mjpeg",jpeg:"mjpeg",webp:"webp",gif:"gif",bmp:"bmp",tif:"tiff",tiff:"tiff",apng:"apng"};
  if(probe&&images[extension||""]&&probe.videoCodec!==images[extension!])throw new Error("图片输出编码与扩展名不一致");return mime;
}
async function dispatch(row:JobRow):Promise<WorkerJobView>{
  const health=await mediaWorkerHealth();if(health.draining||health.running+health.queued>=health.maxActive||health.terminal>=8)throw new MediaWorkerError("媒体处理队列暂不可用",429);
  const objects:Array<{bytes:Uint8Array;extension:string;name?:string}>=[],attachments:Array<{bytes:Uint8Array;extension:string;name:string}>=[];
  for(const [index,input] of row.inputs.entries()){
    if(!await canReadMedia(input.key,row.email))unavailable();const object=await readManagedObject(`/media/${input.key}`,250*1024*1024);
    if(createHash("sha256").update(object.bytes).digest("hex")!==input.sha256)throw new Error("媒体输入已改变，请创建新任务");objects.push({bytes:object.bytes,extension:input.extension,...(input.bundleEntry?{name:`bundle-${index}/${input.bundleEntry}`}:{})});
    for(const file of input.bundleFiles||[]){if(file.name===input.bundleEntry)continue;
      if(!await canReadMedia(file.key,row.email))unavailable();const copy=await readManagedObject(`/media/${file.key}`,250*1024*1024);
      if(copy.bytes.byteLength!==file.bytes||createHash("sha256").update(copy.bytes).digest("hex")!==file.sha256)throw new Error("分片包输入已改变，请创建新任务");
      attachments.push({bytes:copy.bytes,extension:"bin",name:`bundle-${index}/${file.name}`});
    }
  }
  const prepared=await prepareMediaInputs(row.id,[...objects,...attachments]),inputs=prepared.slice(0,objects.length),bundleFiles=prepared.slice(objects.length);
  const auxiliaryFiles=row.auxiliary_files_enc?JSON.parse(decryptAtRest(row.auxiliary_files_enc)||"null"):[];
  if(!Array.isArray(auxiliaryFiles))throw new Error("媒体辅助文件快照不可用");
  const auxiliaryInputs=await prepareMediaAuxiliary(row.id,auxiliaryFiles);
  await getPool().query("UPDATE app_video_media_jobs SET status='processing',updated_at=now() WHERE id=$1 AND status='queued'",[row.id]);
  return mediaWorkerRequest(row.id,"POST",{action:row.request.action,inputs,bundleFiles,auxiliaryInputs,auxiliaryOutputs:row.request.auxiliaryOutputs||[],outputs:presetOutputs(row.request),timestamp:row.request.timestamp,start:row.request.start,end:row.request.end,args:row.request.args});
}
async function publish(row:JobRow,view:WorkerJobView){
  await ensureVideoNodeSchema();
  if(!view.result)throw new Error("媒体处理结果缺失");const outputs:MediaJobOutput[]=[],artworks:Omit<ArtworkRecord,"createdAt">[]=[];
  const parents=[...new Set(row.inputs.map(input=>input.artworkId).filter((id):id is string=>!!id))];
  const names=new Set(view.result.outputs.map(item=>item.name));
  if(names.size!==view.result.outputs.length)throw new Error("媒体产物名称重复");
  const manifest=view.result.outputs.map(({name,sha256,bytes,probe,fragment})=>({name,sha256,bytes,probe,fragment:fragment===true}));
  const bundleDigest=digest(manifest);
  const frozen=(await getPool().query("UPDATE app_video_media_jobs SET output_manifest=COALESCE(output_manifest,$2::jsonb) WHERE id=$1 AND email=$3 RETURNING output_manifest",[row.id,JSON.stringify(manifest),row.email])).rows[0]?.output_manifest;
  if(!frozen||digest(frozen)!==bundleDigest)throw new Error("媒体产物清单已改变，不能覆盖已保存结果");
  for(const item of view.result.outputs){
    const bytes=await readMediaWorkerOutput(row.id,item),mimeType=outputMime(item.name,item.probe,item.fragment);
    // Segmented output can only refer to files produced by this same job.
    if(/\.(m3u8|mpd)$/i.test(item.name)){
      inspectMediaBundle(item.name,bytes.toString("utf8"),[...names]);
    }
    const artworkId=`media-art-${row.id}-${outputs.length}`,storageKey=`videos/processed/${row.id}/${bundleDigest}/${item.name}`,url=`/media/${storageKey}`;
    const existing=await getMediaAsset(storageKey);
    if(existing){if(existing.owner!==row.email||existing.sha256!==item.sha256)throw new Error("已保存媒体归属或内容不一致");const stored=await readManagedObject(url,500*1024*1024);if(createHash("sha256").update(stored.bytes).digest("hex")!==item.sha256)throw new Error("已保存媒体字节已改变");}
    else{const written=await writeStoredObject(bytes,mimeType,storageKey);await registerMediaAsset(storageKey,bytes,mimeType,written.remoteReady,row.email);}
    outputs.push({artworkId,storageKey,url,mimeType,sha256:item.sha256,bytes:item.bytes,name:item.name,probe:item.probe,fragment:item.fragment===true});
    const category=item.fragment?"media":mimeType.startsWith("image/")?"main":mimeType.startsWith("audio/")?"audio":mimeType.startsWith("video/")?"video":"media";
    artworks.push({id:artworkId,title:item.name,category,prompt:"",status:"completed",image:category==="main"?url:"",videoUrl:category==="main"?null:url,gradient:"from-slate-100 to-zinc-100",source:"canvas",origin:row.request.source==="workbench"?"workbench":row.request.source==="canvas"||row.request.projectKey?"canvas":"workbench",
      parentId:parents[0]||null,parentIds:parents.slice(1),width:item.probe?.width||null,height:item.probe?.height||null,
      groupId:row.request.projectKey?.startsWith("tree:")?row.request.projectKey.slice(5):row.inputs[0]?.groupId||undefined,
      batchId:row.request.projectKey?.startsWith("batch:")?row.request.projectKey.slice(6):`media-${row.id}`,
      creationProvenance:{version:1,operation:"video-extract",entry:"canvas",ref:row.id,evidence:"server-route"}});
  }
  const tx=await getPool().connect();try{await tx.query("BEGIN");const current=(await tx.query("SELECT status FROM app_video_media_jobs WHERE id=$1 AND email=$2 FOR UPDATE",[row.id,row.email])).rows[0];
    if(current?.status==="completed"){await tx.query("COMMIT");return;}
    if(!current||current.status==="cancelled"||current.status==="failed")throw new Error("媒体任务已结束");
    // Serialize with mixed/project deletion. The job still settles once; only its canvas attachment changes.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[row.email]);
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${row.email}`]);
    let detached=false;
    // Graph edits/deletion use the same advisory locks. Read deletion markers without blocking task-result pointer updates.
    if(row.request.projectKey){const project=(await tx.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2",[row.email,row.request.projectKey])).rows[0];detached=!!project?.deleted_at;}
    if(row.request.inputs.length){const nodes=(await tx.query("SELECT deleted_at FROM app_canvas_video_nodes WHERE email=$1 AND id=ANY($2::text[])",[row.email,row.request.inputs.map(id=>id.replace(/^video:/,""))])).rows;detached=detached||nodes.some(node=>!!node.deleted_at);}
    if(parents.length){const sources=(await tx.query("SELECT deleted_at FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) FOR SHARE",[row.email,parents])).rows;detached=detached||sources.some(art=>!!art.deleted_at);}
    if(detached)for(const art of artworks)art.origin="workbench";
    await addArtworksTx(tx,row.email,artworks);
    if(row.billing_quote)await settleTaskBillingTx(tx,row.id,row.email,row.billing_quote,`led-media-${row.id}`,{state:"succeeded",items:[{id:row.id,state:"succeeded",executedQuality:row.billing_quote.facts.quality}]});
    for(const output of outputs)if(output.probe)await tx.query("INSERT INTO app_video_media_probes(storage_key,sha256,probe) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING",[output.storageKey,output.sha256,JSON.stringify(output.probe)]);
    await tx.query("UPDATE app_video_media_jobs SET status='completed',outputs=$2::jsonb,query_result=$3,processed_seconds=$4,error=NULL,updated_at=now() WHERE id=$1",[row.id,JSON.stringify(outputs),view.result.stdout.slice(0,1024*1024),view.processedSeconds]);await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
  await cleanupMediaJob(row);
}
async function cleanupMediaJob(row:JobRow){if(row.cleanup_completed_at)return;
  if(await cleanupMediaWorkerJob(row.id).catch(()=>false))await getPool().query("UPDATE app_video_media_jobs SET cleanup_completed_at=now() WHERE id=$1 AND email=$2 AND status IN ('completed','failed','cancelled')",[row.id,row.email]);
}
async function finishMediaJobFailure(actor:string,id:string,status:"failed"|"cancelled"){
  const tx=await getPool().connect();try{await tx.query("BEGIN");const row=(await tx.query("SELECT * FROM app_video_media_jobs WHERE email=$1 AND id=$2 FOR UPDATE",[actor,id])).rows[0] as JobRow|undefined;
    if(!row||["completed","failed","cancelled"].includes(row.status)){await tx.query("COMMIT");return;}
    if(row.billing_quote)await settleTaskBillingTx(tx,id,actor,row.billing_quote,`led-media-${id}`,{state:"failed",items:[]});
    await tx.query("UPDATE app_video_media_jobs SET status=$2,error=$3,updated_at=now() WHERE id=$1",[id,status,status==="failed"?"媒体处理失败，请检查输入与处理参数":null]);await tx.query("COMMIT");
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
async function getMediaJobLocal(actorRaw:string,id:string,process=true){
  const actor=actorRaw.toLowerCase();let row=await getRow(actor,id);if(!row)return null;
  if(!process)return publicMediaJob(row);
  if(!["queued","processing"].includes(row.status)){await cleanupMediaJob(row);return publicMediaJob(row);}
  const lock=await getPool().connect();const key=`media-job:${id}`;let acquired=false;
  try{
    acquired=(await lock.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",[key])).rows[0].acquired;
    if(!acquired)return publicMediaJob(row);
    row=await getRow(actor,id);if(!row)return null;if(!["queued","processing"].includes(row.status))return publicMediaJob(row);
    let view:WorkerJobView;
    try{view=await mediaWorkerRequest(id,"GET");}catch(error){
      if(!(error instanceof MediaWorkerError)||error.status!==404)throw error;
      if(row.cancellation_requested_at){await finishMediaJobFailure(actor,id,"cancelled");row=(await getRow(actor,id))!;await cleanupMediaJob(row);return publicMediaJob(row);}
      const dispatched=await withBackgroundActivity("media-job", `${id}:dispatch`, "claim", async()=>{await bindBackgroundClaim(id);return dispatch(row!);},()=>null);
      if(!dispatched)return publicMediaJob(row);
      view=dispatched;
    }
    if(row.cancellation_requested_at&&["queued","processing"].includes(view.status))view=await mediaWorkerRequest(id,"DELETE");
    if(view.status==="completed")await publish(row,view);
    else if(view.status==="failed"||view.status==="cancelled"){
      await finishMediaJobFailure(actor,id,view.status);
      await cleanupMediaJob((await getRow(actor,id))!);
    }else await getPool().query("UPDATE app_video_media_jobs SET status=$2,processed_seconds=$3,updated_at=now() WHERE id=$1",[id,view.status,view.processedSeconds]);
    return publicMediaJob((await getRow(actor,id))!);
  }catch(error){if(error instanceof MediaWorkerError&&error.status===429){const pending=await getRow(actor,id);return pending?publicMediaJob(pending):null;}throw error;}
  finally{if(acquired)await lock.query("SELECT pg_advisory_unlock(hashtextextended($1,0))",[key]).catch(()=>{});lock.release();}
}
export async function cancelMediaJob(actorRaw:string,id:string){const actor=actorRaw.toLowerCase(),row=await getRow(actor,id);if(!row)return null;
  if(["completed","failed","cancelled"].includes(row.status))return publicMediaJob(row);
  await getPool().query("UPDATE app_video_media_jobs SET cancellation_requested_at=COALESCE(cancellation_requested_at,now()),updated_at=now() WHERE email=$1 AND id=$2",[actor,id]);
  return getMediaJob(actor,id);
}
export async function recoverMediaJobs(limit=4){if(!mediaWorkerConfigured())return 0;await ensureMediaJobSchema();const rows=(await getPool().query("SELECT email,id FROM app_video_media_jobs WHERE status IN ('queued','processing') OR (status IN ('completed','failed','cancelled') AND cleanup_completed_at IS NULL) ORDER BY updated_at LIMIT $1",[limit])).rows;let count=0;
  for(const row of rows){await getMediaJob(row.email,row.id).then(()=>count++).catch(()=>{});}return count;
}

export async function getMediaJob(actorRaw:string,id:string,process=true) {
  if(!process)return getMediaJobLocal(actorRaw,id,false);
  return withBackgroundActivity("media-job", `${id}:poll-settle`, "continuation", () => getMediaJobLocal(actorRaw,id,true), () => getMediaJobLocal(actorRaw,id,false));
}