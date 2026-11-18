import { NextResponse } from 'next/server';
import { z } from 'zod';
import { tenantDetailProjection, tenantMemberPageQuery, updateTenantSchema } from '@/lib/saas/tenant-contracts';
import { tenantAuthorize, tenantDetail, tenantFailure, tenantSupervisorOptions, updateTenant } from '@/lib/saas/tenants';
import { teamJson, teamMutationOrigin } from '@/lib/teams/access';
export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
  const signal=request.signal;
  if(signal.aborted)return teamJson({error:'请求已取消'},499);
  const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
  const {id}=await context.params;
  if(!z.string().uuid().safeParse(id).success)return teamJson({error:'租户不存在'},404);
  const query=new URL(request.url).searchParams,projection=tenantDetailProjection.safeParse(query.get('projection')??'full');
  if(!projection.success||query.getAll('projection').length>1)return teamJson({error:'租户详情查询参数无效'},400);
  const page=projection.data==='supervisors'||projection.data==='members'&&query.has('memberPage')
    ?tenantMemberPageQuery.safeParse({page:query.get('memberPage')??'1',q:query.get('memberQuery')??''}):null;
  if(page&&(!page.success||query.getAll('memberPage').length>1||query.getAll('memberQuery').length>1))return teamJson({error:'成员查询参数无效'},400);
  try{
    if(projection.data==='supervisors')return page?.success
      ?teamJson(await tenantSupervisorOptions(id,page.data,signal))
      :teamJson({error:'成员查询参数无效'},400);
    return teamJson(await tenantDetail(id,projection.data,signal,page?.data));
  }
  catch(e){return signal.aborted?teamJson({error:'请求已取消'},499):tenantFailure(e);}
}
export async function PATCH(request:Request,context:Context) {
  const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
  if(!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
  const {id}=await context.params;
  if(!z.string().uuid().safeParse(id).success)return teamJson({error:'租户不存在'},404);
  const parsed=updateTenantSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return teamJson({error:'租户资料无效',code:'INVALID_COMMAND'},400);
  try{return teamJson(await updateTenant(actor,id,parsed.data));}catch(e){return tenantFailure(e);}
}
