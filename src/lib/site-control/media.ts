import 'server-only';
import { getPool } from '@/lib/db/connection';
import { creationAsset } from '@/lib/saas/creations';
import { enterpriseMediaResponse } from '@/lib/enterprise/media-response';
import { streamManagedMedia } from '@/lib/enterprise/media-stream';
import { teamJson, PRIVATE_HEADERS } from '@/lib/teams/access';
import { dataUrlToBytes } from '@/lib/storage';
import { enterpriseSiteIdentity } from './identity';
import { readSiteMediaGrant } from './media-grant';
import { ensureSitePolicySchema } from './schema';

export async function fleetMediaResponse(request: Request) {
  const grant = readSiteMediaGrant(new URL(request.url).searchParams.get('grant') || '');
  const binding = enterpriseSiteIdentity();
  if (!grant || !binding || grant.enterpriseId !== binding.enterpriseId || grant.instanceId !== process.env.FLEET_INSTANCE_ID) return teamJson({error:'访问授权已失效，请刷新作品'},403);
  // The bearer is short-lived and can only read exactly the output authorized by
  // a committed, audited central command. It cannot carry an arbitrary URL.
  await ensureSitePolicySchema();
  const receipt=(await getPool().query('SELECT actor,result,operation FROM app_fleet_applied WHERE id=$1 AND instance_id=$2',[grant.commandId,grant.instanceId])).rows[0];
  const issued = receipt?.result?.status==='succeeded' && (grant.original
    ? receipt.operation.type==='creations.media' && receipt.operation.creationId===grant.creationId && receipt.operation.assetId===grant.assetId
    : receipt.operation.type==='creations.list' && receipt.result.data.creations?.some((item:{id:string;assetId:string})=>item.id===grant.creationId && item.assetId===grant.assetId));
  if(!issued)return teamJson({error:'作品访问未授权'},403);
  const media=await creationAsset({platform:true,boundTenantId:binding.enterpriseId},grant.creationId,grant.assetId);
  if(media.mediaType!=='image'||media.direction!=='output')return teamJson({error:'作品不存在'},404);
  await getPool().query('INSERT INTO app_site_media_audit(command_id,actor,creation_id,asset_id,original) VALUES($1,$2,$3,$4,$5)',[grant.commandId,receipt.actor,grant.creationId,grant.assetId,grant.original]);
  if(!grant.original){const clean=new URL(request.url);clean.search='';return enterpriseMediaResponse(new Request(clean,{headers:request.headers,signal:request.signal}),media.url);}
  const inline=dataUrlToBytes(media.url);
  if(inline)return new Response(Buffer.from(inline.bytes),{headers:{...PRIVATE_HEADERS,'Content-Type':inline.contentType,'Content-Security-Policy':"default-src 'none'"}});
  return streamManagedMedia(request,media.url,media.mime||'application/octet-stream');
}
