import "server-only";
import {z} from "zod";
import {createHash} from "node:crypto";
import {getPool} from "@/platform/db/pool";
import {ensureSchema} from "@/lib/persistence/schema";
import {addArtworksTx,type ArtworkRecord} from "../db";
import {storageKeyFromManagedUrl} from "../storage";
import {canonicalConfig} from "../model-config/repository";
import {ModelConfigError} from "../model-config/types";
import {verifiedOwnedMedia,ensureMediaInspectionSchema} from "./media-inspection";
import {ensureMediaSchema} from "../media-assets";
import {authorizeVideoProject} from "../canvas/video-node-service";
import type {MediaProbe} from "./media-job-schema";
export const videoAssetImportSchema=z.strictObject({operationId:z.uuid(),storageKey:z.string().min(1).max(1000).optional(),url:z.string().min(1).max(16384).optional(),title:z.string().trim().min(1).max(200),kind:z.enum(["image","video","audio"]).optional(),projectKey:z.string().regex(/^(?:tree|batch):[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/).optional()}).refine(input=>!!input.storageKey||!!input.url,"缺少素材身份");
export type VideoAssetView={artworkId:string;title:string;kind:"image"|"video"|"audio";url:string;storageKey:string;mimeType:string;bytes:number;sha256:string;probe:MediaProbe|null;projectKey:string|null};
let ready:Promise<void>|undefined;
export async function ensureVideoAssetSchema(){if(!ready)ready=ensureSchema().then(()=>getPool().query("CREATE TABLE IF NOT EXISTS app_video_asset_imports(email text NOT NULL,operation_id uuid NOT NULL,input_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id))")).then(()=>undefined).catch(error=>{ready=undefined;throw error;});await ready;}
export async function importVideoAsset(actorRaw:string,raw:unknown):Promise<VideoAssetView>{
  const parsed=videoAssetImportSchema.safeParse(raw);if(!parsed.success)throw new ModelConfigError("INVALID_VIDEO_ASSET","素材登记字段无效",422);
  const actor=actorRaw.toLowerCase(),input=parsed.data,key=input.storageKey||storageKeyFromManagedUrl(input.url||"");if(!key||input.url&&storageKeyFromManagedUrl(input.url)!==key)throw new ModelConfigError("INVALID_VIDEO_ASSET","素材身份不一致",422);
  await ensureVideoAssetSchema();const digest=createHash("sha256").update(canonicalConfig({...input,storageKey:key,url:undefined})).digest("hex");
  const replay=(await getPool().query("SELECT input_digest,result FROM app_video_asset_imports WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];if(replay){if(replay.input_digest!==digest)throw new ModelConfigError("ASSET_OPERATION_CONFLICT","操作编号已用于其他素材",409);return replay.result;}
  if(input.projectKey)await authorizeVideoProject(actor,input.projectKey);
  const media=await verifiedOwnedMedia(actor,key),kind=media.mimeType.startsWith("image/")?"image":media.mimeType.startsWith("audio/")?"audio":"video";
  if(input.kind&&input.kind!==kind)throw new ModelConfigError("VIDEO_ASSET_KIND_CONFLICT","素材实际媒体流与指定类型不一致",422);
  const artworkId=`vasset-${createHash("sha256").update(`${actor}:${input.operationId}`).digest("hex").slice(0,40)}`;
  const result:VideoAssetView={artworkId,title:input.title,kind,url:`/media/${key}`,storageKey:key,mimeType:media.mimeType,sha256:media.sha256,bytes:media.bytes,probe:media.probe,projectKey:input.projectKey||null};
  const art:Omit<ArtworkRecord,"createdAt">={id:artworkId,title:input.title,category:kind==="image"?"main":kind,prompt:"",status:"completed",image:kind==="image"?result.url:"",videoUrl:kind==="image"?null:result.url,gradient:"from-slate-100 to-zinc-100",source:"upload",origin:input.projectKey?"canvas":"workbench",width:media.probe.width||null,height:media.probe.height||null,groupId:input.projectKey?.startsWith("tree:")?input.projectKey.slice(5):undefined,batchId:input.projectKey?.startsWith("batch:")?input.projectKey.slice(6):`video-import-${input.operationId}`,creationProvenance:{version:1,operation:"import",entry:input.projectKey?"canvas":"video",ref:input.operationId,evidence:"server-route"}};
  const tx=await getPool().connect();try{await tx.query("BEGIN");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[actor]);await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`video-node-graph:${actor}`]);
    const previous=(await tx.query("SELECT input_digest,result FROM app_video_asset_imports WHERE email=$1 AND operation_id=$2",[actor,input.operationId])).rows[0];if(previous){if(previous.input_digest!==digest)throw new ModelConfigError("ASSET_OPERATION_CONFLICT","操作编号已用于其他素材",409);await tx.query("COMMIT");return previous.result;}
    if(input.projectKey){const project=(await tx.query("SELECT deleted_at FROM app_canvas_video_projects WHERE email=$1 AND project_key=$2",[actor,input.projectKey])).rows[0];if(project?.deleted_at)throw new ModelConfigError("VIDEO_PROJECT_UNAVAILABLE","目标项目已删除",409);}
    await addArtworksTx(tx,actor,[art]);await tx.query("INSERT INTO app_video_asset_imports(email,operation_id,input_digest,result) VALUES($1,$2,$3,$4::jsonb)",[actor,input.operationId,digest,JSON.stringify(result)]);await tx.query("COMMIT");return result;
  }catch(error){await tx.query("ROLLBACK");throw error;}finally{tx.release();}
}
export async function listOwnedVideoAssets(actorRaw:string,options:{kind?:VideoAssetView["kind"];limit?:number;cursor?:{createdAt:string;id:string}}={}){
  await ensureSchema();await ensureMediaSchema();await ensureMediaInspectionSchema();const actor=actorRaw.toLowerCase(),limit=options.limit??30;
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new ModelConfigError("INVALID_VIDEO_ASSET_PAGE","素材分页数量无效",422);
  const rows=(await getPool().query(`SELECT a.id,a.title,a.category,a.group_id,a.batch_id,a.created_at,to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,m.key,m.content_type,m.bytes,m.sha256,p.probe FROM app_artworks a
    JOIN app_media_assets m ON m.key=regexp_replace(COALESCE(NULLIF(a.video_url,''),a.image_url),'^/media/','') AND (m.owner=a.email OR m.public OR m.owner IS NULL)
    LEFT JOIN app_video_media_probes p ON p.storage_key=m.key AND p.sha256=m.sha256 AND p.decoder_version=1
    WHERE a.email=$1 AND a.status='completed' AND a.deleted_at IS NULL AND a.category<>'media' AND m.content_type ~ '^(image|video|audio)/'
      AND ($2::text IS NULL OR CASE WHEN a.category='audio' THEN 'audio' ELSE split_part(m.content_type,'/',1) END=$2) AND ($3::timestamptz IS NULL OR (a.created_at,a.id)<($3::timestamptz,$4::text))
    ORDER BY a.created_at DESC,a.id DESC LIMIT $5`,[actor,options.kind||null,options.cursor?.createdAt||null,options.cursor?.id||null,limit+1])).rows;
  const page=rows.slice(0,limit),last=page[page.length-1];return {assets:page.map(row=>({artworkId:row.id,title:row.title,kind:row.category==="audio"?"audio":row.content_type.split("/")[0],url:`/media/${row.key}`,storageKey:row.key,mimeType:row.content_type,bytes:Number(row.bytes),sha256:row.sha256,probe:row.probe||null,projectKey:row.group_id?`tree:${row.group_id}`:row.batch_id?`batch:${row.batch_id}`:null}) as VideoAssetView),nextCursor:rows.length>limit&&last?{createdAt:last.cursor_created_at,id:last.id}:null};
}
