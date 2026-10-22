import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterpriseAuthorize } from '@/lib/enterprise/access';
import { enterpriseList, enterpriseSnapshot, enterpriseCommandSchema, mutateEnterprise } from '@/lib/enterprise/server';
import { teamJson, teamFailure, teamMutationOrigin } from '@/lib/teams/access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
  const id=new URL(request.url).searchParams.get('enterpriseId');
  if(id&&!z.string().uuid().safeParse(id).success)return teamJson({error:'企业参数无效'},400);
  try{return teamJson(id?await enterpriseSnapshot(actor,id):{enterprises:await enterpriseList(actor,new URL(request.url).searchParams.get("creation")==="1")})}catch(e){return teamFailure(e)}
}
export async function POST(request:Request) {
  const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
  if(!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
  const parsed=enterpriseCommandSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return teamJson({error:'企业管理参数无效'},400);
  try{return teamJson(await mutateEnterprise(actor,parsed.data))}catch(e){return teamFailure(e)}
}
