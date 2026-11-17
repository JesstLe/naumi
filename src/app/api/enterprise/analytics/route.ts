import { NextResponse } from 'next/server';
import { enterpriseAuthorize } from '@/lib/enterprise/access';
import { teamJson,teamFailure,PRIVATE_HEADERS } from '@/lib/teams/access';
import { analyticsQuerySchema,enterpriseAnalytics,enterpriseLedgerCsv } from '@/lib/enterprise/analytics';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
 const parsed=analyticsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!parsed.success)return teamJson({error:'日期或筛选参数无效（最多10年）'},400);
 try{
  if(parsed.data.format==='csv')return new NextResponse(await enterpriseLedgerCsv(actor,parsed.data,request.signal),{headers:{...PRIVATE_HEADERS,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="enterprise-ledger-${parsed.data.from}-${parsed.data.to}.csv"`}});
  return teamJson(await enterpriseAnalytics(actor,parsed.data,request.signal));
 }catch(e){if(request.signal.aborted)return teamJson({error:'查询已取消'},499);return teamFailure(e)}
}
