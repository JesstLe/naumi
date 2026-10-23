import { NextResponse } from 'next/server';
import { z } from 'zod';
import { tenantMemberSchema } from '@/lib/saas/tenant-contracts';
import { mutateTenantMember, tenantAuthorize, tenantFailure } from '@/lib/saas/tenants';
import { teamJson,teamMutationOrigin } from '@/lib/teams/access';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
  if(!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
  const {id}=await params;if(!z.string().uuid().safeParse(id).success)return teamJson({error:'租户不存在'},404);
  const parsed=tenantMemberSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return teamJson({error:'成员操作参数无效'},400);
  try{return teamJson(await mutateTenantMember(actor,id,parsed.data));}catch(e){return tenantFailure(e);}
}
