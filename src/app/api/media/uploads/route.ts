import {NextResponse} from 'next/server';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {z} from 'zod';
import {authenticatedEmail} from '@/lib/request-auth';
import {ensureMediaSchema,getMediaAsset} from '@/lib/media-assets';
import {getPool,addArtworks,listArtworksByIds,setArtworkPosition} from '@/lib/db';
import {privateMedia,storageDriver,presignStoredObject,readManagedObject,uploadImage} from '@/lib/storage';
import {adaptiveCanvasImageSize} from '@/lib/mock-data';

export const runtime='nodejs',dynamic='force-dynamic',maxDuration=120;
const headers={'cache-control':'no-store'};
const prepare=z.object({action:z.literal('prepare'),bytes:z.number().int().min(1).max(12*1024*1024),
 contentType:z.enum(['image/png','image/jpeg','image/webp','image/gif','image/avif'])});
const complete=z.object({action:z.literal('complete'),id:z.string().uuid(),title:z.string().max(240).optional(),
 parentId:z.string().max(200).nullable().optional(),canvasGroupId:z.string().max(120).nullable().optional(),
 x:z.number().finite().optional(),y:z.number().finite().optional(),linked:z.boolean().optional()});
export async function POST(request:Request) {
 const email=await authenticatedEmail(request);
 if(!email)return NextResponse.json({error:'请先登录'},{status:401,headers});
 if(!privateMedia||storageDriver==='local')return NextResponse.json({enabled:false},{headers});
 let raw:unknown;try{raw=await request.json();}catch{return NextResponse.json({error:'请求格式无效'},{status:400,headers});}
 try {
  await ensureMediaSchema();
  const pending=prepare.safeParse(raw);
  if(pending.success){
    const quota=await getPool().query(`SELECT count(*)::int n FROM app_media_uploads WHERE owner=$1 AND expires_at>now() AND committed_id IS NULL`,[email]);
    if(quota.rows[0].n>=20)return NextResponse.json({error:'请等待已有上传完成'},{status:429,headers});
    const id=randomUUID(),key=`pending-uploads/${id}`;
    await getPool().query(`INSERT INTO app_media_uploads(id,owner,staging_key,content_type,bytes,expires_at)
      VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')`,[id,email,key,pending.data.contentType,pending.data.bytes]);
    return NextResponse.json({enabled:true,id,putUrl:await presignStoredObject('PUT',key,600,pending.data.contentType,undefined,pending.data.bytes),contentType:pending.data.contentType},{headers});
  }
  const final=complete.safeParse(raw);
  if(!final.success)return NextResponse.json({error:'上传参数无效'},{status:400,headers});
  const row=(await getPool().query('SELECT * FROM app_media_uploads WHERE id=$1 AND owner=$2',[final.data.id,email])).rows[0];
  if(!row)return NextResponse.json({error:'上传不存在'},{status:404,headers});
  const artId=`art-upload-${row.id}`;
  if(row.committed_id){const art=(await listArtworksByIds(email,[row.committed_id]))[0];return NextResponse.json(art?{ok:true,...art}:{error:'作品已删除'},{status:art?200:410,headers});}
  if(new Date(row.expires_at).getTime()<Date.now())return NextResponse.json({error:'上传已过期，请重新上传'},{status:410,headers});
  if(final.data.parentId && !(await listArtworksByIds(email,[final.data.parentId])).length)
    return NextResponse.json({error:'父节点不存在'},{status:404,headers});
  let key=row.asset_key as string|null,asset=key?await getMediaAsset(key):null;
  if(!asset){
    const data=await readManagedObject(`/media/${row.staging_key}`,12*1024*1024);
    if(data.size!==row.bytes)return NextResponse.json({error:'实际文件大小与申请不一致'},{status:422,headers});
    const actual=await sharp(data.bytes,{limitInputPixels:64_000_000,failOn:'error'}).metadata();
    const mime=({png:'image/png',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',heif:'image/avif'} as Record<string,string>)[actual.format||''];
    if(mime!==row.content_type || !actual.width || !actual.height) return NextResponse.json({error:'实际图片格式无效'},{status:422,headers});
    await sharp(data.bytes,{limitInputPixels:64_000_000,failOn:'error'}).raw().toBuffer();
    key=`canvas-uploads/${row.id}-${createHash('sha256').update(data.bytes).digest('hex').slice(0,24)}.${actual.format}`;
    await uploadImage(data.bytes,mime,key,undefined,email);
    asset=await getMediaAsset(key);
    if(!asset)throw new Error('asset registration unavailable');
    // Only an immutable formal key is published; still-valid PUT targets staging only.
    await getPool().query('UPDATE app_media_uploads SET asset_key=COALESCE(asset_key,$3) WHERE id=$1 AND owner=$2',[row.id,email,key]);
    const frozen=(await getPool().query('SELECT asset_key FROM app_media_uploads WHERE id=$1 AND owner=$2',[row.id,email])).rows[0];
    key=frozen.asset_key;asset=await getMediaAsset(key!);
  }
  if(!asset || !key)throw new Error('asset missing');
  const canvas=adaptiveCanvasImageSize(asset.width,asset.height),image=`/media/${key}`;
  await addArtworks(email,[{id:artId,title:final.data.title||'上传图片',category:'main',prompt:'',status:'completed',image,
    gradient:'from-sky-100 to-indigo-100',source:final.data.linked?'upload':'canvas-add',parentId:final.data.parentId||null,
    canvasGroupId:final.data.canvasGroupId||null,width:asset.width,height:asset.height,canvasWidth:canvas.width,canvasHeight:canvas.height,
    creationProvenance:{version:1,operation:'upload',entry:'canvas',ref:artId,evidence:'server-route'}}]);
  if(final.data.x!==undefined&&final.data.y!==undefined)await setArtworkPosition(email,artId,final.data.x,final.data.y);
  await getPool().query('UPDATE app_media_uploads SET committed_id=$3 WHERE id=$1 AND owner=$2',[row.id,email,artId]);
  return NextResponse.json({ok:true,id:artId,image,width:asset.width,height:asset.height,canvasWidth:canvas.width,canvasHeight:canvas.height},{headers});
 } catch {return NextResponse.json({error:'图片暂时未能保存，请稍后重试'},{status:503,headers});}
}
