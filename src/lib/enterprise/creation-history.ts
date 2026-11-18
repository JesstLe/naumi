import 'server-only';
import type {TeamActor} from '@/lib/teams/grants';
import {TeamError} from '@/lib/teams/server';
import {enterpriseHeavyReportRead} from './server';
import {ensureBiSchema} from '@/lib/bi/repository';
import {ensureMediaSchema} from '@/lib/media-assets-schema';
import {listLegacyCreations,legacyCreationDetail,legacyCreationAsset,legacyCreationEventProjection,type LegacyReadScope} from '@/lib/saas/legacy-creations';
import {publicCreationParameters} from '@/lib/saas/creation-parameters';
import type {DetailPages} from '@/lib/saas/creations';
import type {CreationFilters,CreationPage} from '@/lib/saas/creation-contracts';

/** Same live hierarchy as member history, including the owner's own records.
 * Reading history does not change its original tenant/payer/asset ownership. */
async function read<T>(actor:TeamActor,enterpriseId:string,run:(access:LegacyReadScope)=>Promise<T>,signal?:AbortSignal){
  signal?.throwIfAborted();
  await ensureBiSchema();
  return enterpriseHeavyReportRead({...actor,admin:false,consoleAdmin:false},enterpriseId,async(client,scope)=>{
    const allowed=new Set(scope.visible);if(scope.owner)allowed.add(scope.team.owner_email);
    return run({client,allowedEmails:[...allowed],tenantId:enterpriseId});
  },signal);
}
export async function enterpriseHistory(actor:TeamActor,id:string,filters:CreationFilters,signal?:AbortSignal):Promise<CreationPage>{
  return read(actor,id,async access=>{
    if(filters.user&&!access.allowedEmails.includes(filters.user))throw new TeamError('没有该成员内容的查看权限',403);
    const page=await listLegacyCreations(filters,access);
    return {...page,scope:'member'};
  },signal);
}
export async function enterpriseHistoryDetail(actor:TeamActor,id:string,creationId:string,pages:number|DetailPages,signal?:AbortSignal){
  return read(actor,id,async access=>{
    const {detail}=await legacyCreationDetail(creationId,{...(typeof pages==='number'?{assetPage:pages}:pages),diagnostics:false},access);
    const {technical,failure,...publicDetail}=detail;
    return {...publicDetail,parameters:{...detail.parameters,values:publicCreationParameters(detail.parameters.values)}};
  },signal);
}
export function enterpriseHistoryEventProjection(actor:TeamActor,id:string,creationId:string,page:number,withTotal:boolean,signal?:AbortSignal){
  return read(actor,id,access=>legacyCreationEventProjection(creationId,page,withTotal,access),signal);
}
export async function enterpriseHistoryAsset(actor:TeamActor,id:string,creationId:string,assetId:string,signal?:AbortSignal){
  // Finish schema initialization before taking a report connection.
  signal?.throwIfAborted();
  await ensureMediaSchema();
  return read(actor,id,access=>legacyCreationAsset(creationId,assetId,access,signal),signal);
}
