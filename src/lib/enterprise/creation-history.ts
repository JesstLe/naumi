import 'server-only';
import type {TeamActor} from '@/lib/teams/grants';
import {TeamError} from '@/lib/teams/server';
import {enterpriseRead} from './server';
import {ensureBiSchema} from '@/lib/bi/repository';
import {ensureMediaSchema} from '@/lib/media-assets-schema';
import {listLegacyCreations,legacyCreationDetail,legacyCreationAsset,type LegacyReadScope} from '@/lib/saas/legacy-creations';
import {publicCreationParameters} from '@/lib/saas/creation-writer';
import type {CreationFilters,CreationPage} from '@/lib/saas/creation-contracts';

/** Same live hierarchy as member history, including the owner's own records.
 * Reading history does not change its original tenant/payer/asset ownership. */
async function read<T>(actor:TeamActor,enterpriseId:string,run:(access:LegacyReadScope)=>Promise<T>){
  await ensureBiSchema();
  return enterpriseRead({...actor,admin:false,consoleAdmin:false},enterpriseId,async(client,scope)=>{
    const allowed=new Set(scope.visible);if(scope.owner)allowed.add(scope.team.owner_email);
    return run({client,allowedEmails:[...allowed]});
  });
}
export async function enterpriseHistory(actor:TeamActor,id:string,filters:CreationFilters):Promise<CreationPage>{
  return read(actor,id,async access=>{
    if(filters.user&&!access.allowedEmails.includes(filters.user))throw new TeamError('没有该成员内容的查看权限',403);
    const page=await listLegacyCreations(filters,access);
    return {...page,scope:'member'};
  });
}
export async function enterpriseHistoryDetail(actor:TeamActor,id:string,creationId:string,assetPage:number){
  return read(actor,id,async access=>{
    const {detail}=await legacyCreationDetail(creationId,{assetPage,diagnostics:false},access);
    const {technical,failure,...publicDetail}=detail;
    return {...publicDetail,parameters:{...detail.parameters,values:publicCreationParameters(detail.parameters.values)}};
  });
}
export async function enterpriseHistoryAsset(actor:TeamActor,id:string,creationId:string,assetId:string){
  // Schema initialization may borrow the business pool, so finish it before
  // enterpriseRead reserves a connection and acquires authorization locks.
  await ensureMediaSchema();
  return read(actor,id,access=>legacyCreationAsset(creationId,assetId,access));
}
