import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterpriseAuthorize } from '@/lib/enterprise/access';
import { enterpriseContent } from '@/lib/enterprise/server';
import { teamJson,teamFailure } from '@/lib/teams/access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const query=z.object({enterpriseId:z.string().uuid(),email:z.string().trim().min(1).max(254).transform(s=>s.toLowerCase()),section:z.enum(['artworks','tasks']),page:z.coerce.number().int().min(1).max(100000).default(1)});
export async function GET(request:Request){
  const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
  const q=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));if(!q.success)return teamJson({error:'内容查询参数无效'},400);
  try{return teamJson(await enterpriseContent(actor,q.data.enterpriseId,q.data.email,q.data.section,q.data.page))}catch(e){return teamFailure(e)}
}
