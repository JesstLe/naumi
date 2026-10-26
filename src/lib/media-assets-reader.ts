import "server-only";
import {dbEnabled,getPool} from "@/platform/db/pool";
import {ensureMediaSchema} from "./media-assets-schema";
export type MediaAsset = {key:string; owner:string|null; public:boolean; remote_ready:boolean; content_type:string;
  sha256:string; bytes:number; width:number|null; height:number|null; thumbnail_key:string|null; preview_key:string|null};

export async function getMediaAsset(key:string): Promise<MediaAsset|null> {
  if(!dbEnabled) return null;
  await ensureMediaSchema();
  return (await getPool().query('SELECT * FROM app_media_assets WHERE key=$1',[key])).rows[0] || null;
}

export async function getMediaAssets(keys:string[]):Promise<Map<string,MediaAsset>> {
 if(!dbEnabled||!keys.length)return new Map();await ensureMediaSchema();
 const rows=(await getPool().query('SELECT * FROM app_media_assets WHERE key=ANY($1::text[])',[Array.from(new Set(keys))])).rows;
 return new Map(rows.map(row=>[String(row.key),row as MediaAsset]));
}
