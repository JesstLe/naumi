import {NextResponse} from 'next/server';
import {z} from 'zod';
import {enterpriseAuthorize} from '@/lib/enterprise/access';
import {enterpriseHealth} from '@/lib/enterprise/health';
import {teamJson,teamFailure} from '@/lib/teams/access';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
  const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
  const id=z.string().uuid().safeParse(new URL(request.url).searchParams.get('enterpriseId'));
  if(!id.success)return teamJson({error:'管理范围无效'},400);
  try{return teamJson(await enterpriseHealth(actor,id.data));}catch(error){return teamFailure(error);}
}
