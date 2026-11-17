import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enterpriseAuthorize } from '@/lib/enterprise/access';
import { teamJson,teamFailure } from '@/lib/teams/access';
import { parseBiQuery } from '@/lib/bi/contracts';
import { NaumiEnterpriseAdapter } from '@/lib/enterprise/integration/naumi-adapter';
import { deploymentPolicy,IntegrationError } from '@/lib/enterprise/integration/policy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const query=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('context')}),
  z.strictObject({action:z.literal('members'),enterpriseId:z.string().uuid()}),
  z.strictObject({action:z.literal('records'),enterpriseId:z.string().uuid(),kind:z.enum(['artworks','generations','ledger']),from:z.string().optional(),to:z.string().optional(),email:z.string().max(254).optional(),page:z.coerce.number().int().min(1).max(100000).optional(),size:z.coerce.number().int().min(1).max(100).optional()}),
]);
/** Enterprise viewer, NOT a platform-admin proxy. Source authorization is independent of the demo role picker. */
export async function GET(request:Request){
  try{
    const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
    const params=new URL(request.url).searchParams,parsed=query.safeParse(Object.fromEntries(params));
    if(!parsed.success)return teamJson({error:'数据源查询参数无效'},400);
    if(parsed.data.action==='records')try{parseBiQuery(new URLSearchParams({...Object.fromEntries(params),section:'artworks'}));}catch{return teamJson({error:'日期或分页参数无效'},400);}
    const policy=deploymentPolicy(),adapter=new NaumiEnterpriseAdapter(actor,policy),q=parsed.data;
    if(q.action==='context')return teamJson({version:1,source:'naumi',transport:adapter.transport,instanceId:policy.sourceInstanceId,mode:policy.mode,viewer:{email:actor.email},enterprises:await adapter.list()});
    if(q.action==='members')return teamJson(await adapter.members(q.enterpriseId));
    return teamJson(await adapter.records(q));
  }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
