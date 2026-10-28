import "server-only";
import {mediaExtension,inspectedMediaMime} from "./media-formats";
export {mediaExtension,inspectedMediaMime} from "./media-formats";
import {createHash} from "node:crypto";
import {ensureSchema,getPool,listArtworksByIds} from "../db";
import {canReadMedia,getMediaAsset,getMediaAssetTx} from "../media-assets";
import type {PoolClient} from "pg";
import {readManagedObject} from "../storage";
import {ModelConfigError} from "../model-config/types";
import {probeMedia} from "./media";
import {probeStaticImage} from "./static-image-probe";
import type {MediaProbe} from "./media-job-schema";

export type FrozenMediaInput={key:string;artworkId:string|null;sha256:string;bytes:number;mimeType:string;extension:string;probe:MediaProbe;groupId:string|null};
/** Freeze an already decoded immutable asset under the caller's graph transaction.
 * Initial import/preflight performs byte I/O. This path opens no pool connection,
 * runs no Worker, and also sees artwork restored earlier in the same transaction. */
export async function inspectedOwnedMediaTx(tx:PoolClient,actor:string,key:string,artworkId:string):Promise<FrozenMediaInput>{
  const art=(await tx.query("SELECT group_id FROM app_artworks WHERE email=$1 AND id=$2 AND deleted_at IS NULL AND (video_url=$3 OR image_url=$3) FOR SHARE",[actor,artworkId,`/media/${key}`])).rows[0];
  const asset=await getMediaAssetTx(tx,key);
  if(!art||!asset)throw new ModelConfigError("MEDIA_INPUT_UNAVAILABLE","媒体素材不存在或无权访问",404);
  const probe=(await tx.query("SELECT probe FROM app_video_media_probes WHERE storage_key=$1 AND sha256=$2 AND decoder_version=1",[key,asset.sha256])).rows[0]?.probe as MediaProbe|undefined;
  if(!probe)throw new ModelConfigError("MEDIA_INSPECTION_REQUIRED","音频尚未完成真实解码，请重新导入",422);
  const declared=asset.content_type.split('/')[0] as 'image'|'video'|'audio',mimeType=inspectedMediaMime(probe,declared==='video'&&!probe.videoCodec&&probe.audioCodecs.length?'audio':declared,asset.content_type);
  return {key,artworkId,sha256:asset.sha256,bytes:Number(asset.bytes),mimeType,extension:mediaExtension(mimeType),probe,groupId:art.group_id||null};
}
let ready:Promise<void>|undefined;
export async function ensureMediaInspectionSchema(){
  if(!ready)ready=ensureSchema().then(()=>getPool().query("CREATE TABLE IF NOT EXISTS app_video_media_probes(storage_key text NOT NULL,sha256 text NOT NULL,probe jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(storage_key,sha256)); ALTER TABLE app_video_media_probes ADD COLUMN IF NOT EXISTS decoder_version integer NOT NULL DEFAULT 0")).then(()=>undefined).catch(error=>{ready=undefined;throw error;});await ready;
}
export async function recordMediaProbe(key:string,sha256:string,probe:MediaProbe){
  await ensureMediaInspectionSchema();await getPool().query("INSERT INTO app_video_media_probes(storage_key,sha256,probe,decoder_version) VALUES($1,$2,$3::jsonb,1) ON CONFLICT(storage_key,sha256) DO UPDATE SET probe=EXCLUDED.probe,decoder_version=1 WHERE app_video_media_probes.decoder_version<1",[key,sha256,JSON.stringify(probe)]);
  await getPool().query("UPDATE app_media_assets SET width=$3,height=$4 WHERE key=$1 AND sha256=$2",[key,sha256,probe.width||null,probe.height||null]);
}
export async function verifiedOwnedMedia(actor:string,key:string,artworkId:string|null=null,expectedSha?:string):Promise<FrozenMediaInput>{
  if(!await canReadMedia(key,actor))throw new ModelConfigError("MEDIA_INPUT_UNAVAILABLE","媒体素材不存在或无权访问",404);
  const object=await readManagedObject(`/media/${key}`,250*1024*1024),sha256=createHash("sha256").update(object.bytes).digest("hex");
  if(expectedSha&&expectedSha!==sha256)throw new ModelConfigError("MEDIA_INPUT_CHANGED","已冻结素材字节已改变，请重新选择素材",422);
  const asset=await getMediaAsset(key),declaredMime=asset?.content_type||object.contentType;
  if(!/^(?:video|audio|image)\//.test(declaredMime))throw new ModelConfigError("INVALID_MEDIA_STREAM","素材真实类型无法确认",422);
  const extension=mediaExtension(declaredMime);await ensureMediaInspectionSchema();
  let probe=(await getPool().query("SELECT probe FROM app_video_media_probes WHERE storage_key=$1 AND sha256=$2 AND decoder_version=1",[key,sha256])).rows[0]?.probe as MediaProbe|undefined;
  if(!probe){
    // decoder_version=1 means the complete stream/pixels were actually decoded.
    // Static sharp results satisfy that contract; old metadata-only rows stay 0.
    probe=declaredMime.startsWith("image/")?await probeStaticImage(object.bytes,declaredMime)??undefined:undefined;
    probe??=await probeMedia(object.bytes,extension);
    await recordMediaProbe(key,sha256,probe);
  }
  const declaredKind=declaredMime.split("/",1)[0] as "video"|"audio"|"image";
  const mimeType=inspectedMediaMime(probe,declaredKind==="video"&&!probe.videoCodec&&probe.audioCodecs.length?"audio":declaredKind,declaredMime);
  const art=artworkId?(await listArtworksByIds(actor,[artworkId]))[0]:undefined;
  return {key,artworkId,sha256,bytes:object.bytes.byteLength,mimeType,extension:mediaExtension(mimeType),probe,groupId:art?.groupId||null};
}
