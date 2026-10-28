import "server-only";
import type {PoolClient} from "pg";
import {getPool} from "../db";
import {ModelConfigError} from "../model-config/types";
import {assertCreationInputsTx} from "../saas/creation-writer";
import {storageKeyFromManagedUrl} from "../storage";
import {verifiedOwnedMedia,inspectedOwnedMediaTx} from "../video/media-inspection";
import type {TimelineMaterial} from "./timeline-node-schema";

/** Byte I/O/decoding happens before a transaction. Under graph locks read only
 * the media module's already inspected immutable metadata on the caller's tx. */
export async function requireTimelineMaterials(actor:string,ids:readonly string[],tx?:PoolClient):Promise<TimelineMaterial[]>{
  const unique=[...new Set(ids)];if(!unique.length)return [];
  try{
    const rows=(await (tx??getPool()).query(`SELECT id,status,image_url,video_url FROM app_artworks WHERE email=$1 AND id=ANY($2::text[]) AND deleted_at IS NULL${tx?" FOR SHARE":""}`,[actor,unique])).rows,byId=new Map(rows.map(row=>[String(row.id),row])),result:TimelineMaterial[]=[];
    for(const artworkId of unique){
      const row=byId.get(artworkId),key=storageKeyFromManagedUrl(row?.video_url||row?.image_url||"");
      if(!row||row.status!=="completed"||!key)throw new ModelConfigError("TIMELINE_REFERENCE_UNAVAILABLE","多轨素材不存在、尚未完成或无权访问",404);
      const media=tx?await inspectedOwnedMediaTx(tx,actor,key,artworkId):await verifiedOwnedMedia(actor,key,artworkId);
      const kind=media.mimeType.startsWith("image/")?"image":media.probe.videoCodec?"video":media.probe.audioCodecs.length?"audio":null;
      if(!kind||kind!=="image"&&media.probe.durationSeconds<=0)throw new ModelConfigError("TIMELINE_REFERENCE_INVALID","素材没有有效的画面或音频流",422);
      result.push({artworkId,kind,durationSeconds:kind==="image"?null:media.probe.durationSeconds,hasAudio:media.probe.audioCodecs.length>0,key,sha256:media.sha256,url:`/media/${key}`});
    }
    if(tx)await assertCreationInputsTx(tx,actor,unique);else{const client=await getPool().connect();try{await assertCreationInputsTx(client,actor,unique);}finally{client.release();}}
    return result;
  }catch(error){
    if(error instanceof Error&&["素材不存在或无权访问","不能直接引用其他企业的素材"].includes(error.message))throw new ModelConfigError("TIMELINE_REFERENCE_UNAVAILABLE",error.message,404);throw error;
  }
}
