import { NextResponse } from 'next/server';
import { tenantQuerySchema } from '@/lib/saas/tenant-contracts';
import { saasOverview, tenantAuthorize, tenantFailure } from '@/lib/saas/tenants';
import { teamJson } from '@/lib/teams/access';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request) {
  const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
  const parsed=tenantQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if(!parsed.success)return teamJson({error:'查询参数无效'},400);
  try{return teamJson(await saasOverview(parsed.data));}catch(e){return tenantFailure(e);}
}
