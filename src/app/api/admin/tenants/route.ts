import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createTenantSchema, tenantQuerySchema } from '@/lib/saas/tenant-contracts';
import { createTenant, listTenants, tenantAuthorize, tenantCommandResult, tenantFailure, tenantOwnerLookup } from '@/lib/saas/tenants';
import { teamJson, teamMutationOrigin } from '@/lib/teams/access';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request) {
  const signal=request.signal;
  if(signal.aborted)return teamJson({error:'请求已取消'},499);
  const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
  const search=new URL(request.url).searchParams;
  try {
    if(search.has('commandId')) {const id=z.string().uuid().safeParse(search.get('commandId'));return id.success?teamJson(await tenantCommandResult(actor,id.data)):teamJson({error:'操作编号无效'},400);}
    if(search.has('ownerEmail')) {
      const email=z.string().trim().email().max(254).transform(v=>v.toLowerCase()).safeParse(search.get('ownerEmail'));
      return email.success?teamJson(await tenantOwnerLookup(email.data)):teamJson({error:'负责人邮箱无效'},400);
    }
    const parsed=tenantQuerySchema.safeParse(Object.fromEntries(search));
    if(!parsed.success)return teamJson({error:'租户查询参数无效',code:'INVALID_FILTERS'},400);
    return teamJson(await listTenants(parsed.data,signal));
  }catch(e){return signal.aborted?teamJson({error:'请求已取消'},499):tenantFailure(e);}
}
export async function POST(request:Request) {
  const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
  if(!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
  const parsed=createTenantSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return teamJson({error:'租户资料无效',code:'INVALID_COMMAND'},400);
  try{return teamJson(await createTenant(actor,parsed.data));}catch(e){return tenantFailure(e);}
}
