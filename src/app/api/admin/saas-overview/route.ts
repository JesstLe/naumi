import { NextResponse } from 'next/server';
import { tenantQuerySchema } from '@/lib/saas/tenant-contracts';
import { saasOverview, saasOverviewMetrics, tenantAuthorize, tenantFailure } from '@/lib/saas/tenants';
import { teamJson } from '@/lib/teams/access';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request) {
  const signal=request.signal;
  if(signal.aborted)return teamJson({error:'请求已取消'},499);
  const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
  const query=new URL(request.url).searchParams,mode=query.get('projection');
  const parsed=tenantQuerySchema.safeParse(Object.fromEntries(query));
  if(!parsed.success||query.getAll('projection').length>1||mode!==null&&mode!=='metrics')return teamJson({error:'查询参数无效'},400);
  try{return teamJson(await (mode==='metrics'?saasOverviewMetrics(parsed.data,signal):saasOverview(parsed.data,signal)));}
  catch(e){return signal.aborted?teamJson({error:'请求已取消'},499):tenantFailure(e);}
}
