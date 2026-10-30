import 'server-only';
import type {PoolClient} from 'pg';
import {getPool} from '../db';
import {ensureMediaSchema} from '../media-assets';

/** Metadata only. Transaction callers initialize the schema before BEGIN and
 * supply their own client; no pool checkout or storage I/O is allowed here. */
export async function readImagegenInputAssetReference(id:string,owner:string,client?:PoolClient){
 if(!/^asset-[a-f0-9-]{36}$/i.test(id))throw new Error('素材编号无效');
 if(!client)await ensureMediaSchema();
 const row=(await (client||getPool()).query('SELECT key,content_type FROM app_media_assets WHERE owner=$1 AND key=ANY($2::text[])',
  [owner.toLowerCase(),['png','jpg','webp'].map(ext=>`imagegen-inputs/${id.slice(6)}.${ext}`)])).rows[0];
 if(!row)throw new Error('素材不存在或无权访问');
 return {url:`/media/${row.key}`,mimeType:row.content_type as string};
}
