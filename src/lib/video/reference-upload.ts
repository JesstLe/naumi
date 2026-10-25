import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {ensureSchema} from "@/lib/persistence/schema";
import {getPool} from "@/platform/db/pool";
import {getMediaAsset,type MediaAsset} from "../media-assets";
import {uploadImage} from "../storage";
import {ModelConfigError} from "../model-config/types";
import {bindCreationMedia} from "@/lib/saas/creation-access";
let ready:Promise<void>|undefined;
async function ensureReferenceUploadSchema(){if(!ready)ready=ensureSchema().then(()=>getPool().query("CREATE TABLE IF NOT EXISTS app_video_reference_uploads(email text NOT NULL,operation_id uuid NOT NULL,storage_key text NOT NULL,sha256 text NOT NULL,mime_type text NOT NULL,bytes bigint NOT NULL,status text NOT NULL DEFAULT 'reserved',claim_token uuid NOT NULL,lease_expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(email,operation_id))")).then(()=>undefined).catch(error=>{ready=undefined;throw error;});await ready;}
/** Reserve immutable upload identity before object I/O, without holding pool connections during the upload. */
export async function uploadVideoReference(actorRaw:string,operationId:string,key:string,bytes:Uint8Array,mimeType:string){
  const actor=actorRaw.toLowerCase(),sha256=createHash("sha256").update(bytes).digest("hex"),token=randomUUID();await ensureReferenceUploadSchema();
  await bindCreationMedia(actor,`/media/${key}`);
  const match=(asset:MediaAsset)=>asset.owner===actor&&asset.sha256===sha256&&asset.content_type===mimeType&&Number(asset.bytes)===bytes.byteLength;
  const claimed=(await getPool().query(`INSERT INTO app_video_reference_uploads(email,operation_id,storage_key,sha256,mime_type,bytes,claim_token,lease_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '180 seconds')
    ON CONFLICT(email,operation_id) DO UPDATE SET claim_token=EXCLUDED.claim_token,lease_expires_at=EXCLUDED.lease_expires_at
    WHERE app_video_reference_uploads.sha256=EXCLUDED.sha256 AND app_video_reference_uploads.mime_type=EXCLUDED.mime_type AND app_video_reference_uploads.bytes=EXCLUDED.bytes AND app_video_reference_uploads.storage_key=EXCLUDED.storage_key AND app_video_reference_uploads.status<>'completed' AND app_video_reference_uploads.lease_expires_at<=now() RETURNING storage_key`,[actor,operationId,key,sha256,mimeType,bytes.byteLength,token])).rows[0];
  if(!claimed){const row=(await getPool().query("SELECT * FROM app_video_reference_uploads WHERE email=$1 AND operation_id=$2",[actor,operationId])).rows[0];if(!row||row.sha256!==sha256||row.mime_type!==mimeType||Number(row.bytes)!==bytes.byteLength||row.storage_key!==key)throw new ModelConfigError("REFERENCE_OPERATION_CONFLICT","操作编号已用于其他素材",409);
    const asset=await getMediaAsset(key);if(asset){if(!match(asset))throw new ModelConfigError("REFERENCE_OPERATION_CONFLICT","素材身份或内容已改变",409);return `/media/${key}`;}throw new ModelConfigError("REFERENCE_UPLOAD_PENDING","原上传尚在核实，请稍后用同一文件重试",503);
  }
  try{const existing=await getMediaAsset(key);if(existing&&!match(existing))throw new ModelConfigError("REFERENCE_OPERATION_CONFLICT","素材身份或内容已改变",409);
    const url=existing?`/media/${key}`:await uploadImage(bytes,mimeType,key,undefined,actor);
    await getPool().query("UPDATE app_video_reference_uploads SET status='completed',lease_expires_at=now() WHERE email=$1 AND operation_id=$2 AND claim_token=$3",[actor,operationId,token]);return url;
  }catch(error){await getPool().query("UPDATE app_video_reference_uploads SET lease_expires_at=now() WHERE email=$1 AND operation_id=$2 AND claim_token=$3",[actor,operationId,token]).catch(()=>{});throw error;}
}
