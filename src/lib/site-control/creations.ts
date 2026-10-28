import 'server-only';
import { listCreations, creationAsset } from '@/lib/saas/creations';
import { creationFiltersSchema } from '@/lib/saas/creation-contracts';
import { enterpriseSiteIdentity } from './identity';
import { siteMediaLink } from './media-grant';
import { SitePolicyError } from './store';

function binding() {
  const identity=enterpriseSiteIdentity();if(!identity)throw new SitePolicyError('DENIED');
  return identity;
}
export async function siteCreations(command:{id:string;instanceId:string}, filter:{page:number;search:string}) {
  const {enterpriseId}=binding();
  const page=await listCreations({platform:true,boundTenantId:enterpriseId},creationFiltersSchema.parse({tenantId:enterpriseId,page:filter.page,size:12,q:filter.search}));
  return {creations:page.items.map(item=>({id:item.id,title:item.title,actorName:item.actorName,status:item.status,createdAt:item.acceptedAt,assetId:item.thumbnailAssetId,thumbnail:item.thumbnailAssetId?siteMediaLink({enterpriseId,instanceId:command.instanceId,commandId:command.id,creationId:item.id,assetId:item.thumbnailAssetId,original:false}):null})),total:page.pagination.total,page:page.pagination.page};
}
export async function siteCreationMedia(command:{id:string;instanceId:string}, creationId:string,assetId:string) {
  const {enterpriseId}=binding();
  const media=await creationAsset({platform:true,boundTenantId:enterpriseId},creationId,assetId);
  if(media.mediaType!=='image'||media.direction!=='output')throw new SitePolicyError('DENIED');
  return {mediaUrl:siteMediaLink({enterpriseId,instanceId:command.instanceId,commandId:command.id,creationId,assetId,original:true})};
}
