import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { enterpriseAuthorize } from '@/lib/enterprise/access';
import { enterpriseList, enterpriseSnapshot, enterpriseCommandSchema, mutateEnterprise } from '@/lib/enterprise/server';
import { PRIVATE_HEADERS, teamJson, teamFailure, teamMutationOrigin } from '@/lib/teams/access';
import { settingsSecret } from '@/lib/settings-secret';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const signal=request.signal;
  if(signal.aborted)return teamJson({error:'请求已取消'},499);
  const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
  const search=new URL(request.url).searchParams,id=search.get('enterpriseId');
  if(id&&!z.string().uuid().safeParse(id).success)return teamJson({error:'企业参数无效'},400);
  try{
    if(!id)return teamJson({enterprises:await enterpriseList(actor,search.get("creation")==="1",undefined,signal)});
    // The tag only suppresses transport. Always read and check the current
    // permission scope before comparing, including when a prior tag matches.
    const body=JSON.stringify(await enterpriseSnapshot(actor,id,signal));
    const etag='"'+createHmac('sha256',settingsSecret()).update(JSON.stringify(['enterprise-directory-v1',actor.email,id])).update(body).digest('hex')+'"';
    const headers={...PRIVATE_HEADERS,ETag:etag};
    const matches=request.headers.get('if-none-match')?.split(',').some(value=>value.trim().replace(/^W\//,'')===etag);
    return matches?new NextResponse(null,{status:304,headers}):new NextResponse(body,{headers:{...headers,'Content-Type':'application/json'}});
  }
  catch(e){return signal.aborted?teamJson({error:'请求已取消'},499):teamFailure(e)}
}
export async function POST(request:Request) {
  const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
  if(!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
  const parsed=enterpriseCommandSchema.safeParse(await request.json().catch(()=>null));
  if(!parsed.success)return teamJson({error:'企业管理参数无效'},400);
  try{return teamJson(await mutateEnterprise(actor,parsed.data))}catch(e){return teamFailure(e)}
}
