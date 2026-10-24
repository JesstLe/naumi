import { z } from 'zod';
import { requireAdmin,resolveUserEmail } from '@/lib/admin-auth';
import { dbEnabled } from "@/platform/db/pool";
import { teamJson,teamFailure } from '@/lib/teams/access';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/ip';
import { parseBiQuery } from '@/lib/bi/contracts';
import { NaumiEnterpriseAdapter } from '@/lib/enterprise/integration/naumi-adapter';
import { deploymentPolicy,IntegrationError } from '@/lib/enterprise/integration/policy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const querySchema=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('list')}),
  z.strictObject({action:z.literal('members'),enterpriseId:z.string().uuid()}),
  z.strictObject({action:z.literal('records'),enterpriseId:z.string().uuid(),kind:z.enum(['artworks','generations','ledger']),from:z.string().optional(),to:z.string().optional(),email:z.string().max(254).optional(),page:z.coerce.number().int().min(1).max(100000).optional(),size:z.coerce.number().int().min(1).max(100).optional()}),
]);
export async function GET(request:Request){
  if(!await requireAdmin(request))return teamJson({error:'需要站点管理员'},401);
  if(!dbEnabled)return teamJson({error:'数据库未配置'},503);
  const subject=await resolveUserEmail(request)||'local-admin';
  if(!rateLimit(`enterprise-workbench:${subject}:${clientIp(request)}`,120,60000))return teamJson({error:'操作过于频繁'},429);
  const params=new URL(request.url).searchParams;
  const parsed=querySchema.safeParse({action:params.get('action')||'list',...Object.fromEntries(params)});
  if(!parsed.success)return teamJson({error:'企业接入查询参数无效'},400);
  if(parsed.data.action==='records')try{parseBiQuery(new URLSearchParams({...Object.fromEntries(params),section:'artworks'}));}catch{return teamJson({error:'日期或分页参数无效'},400);}
  try {
    const policy=deploymentPolicy(),adapter=new NaumiEnterpriseAdapter({email:subject,admin:true,consoleAdmin:true},policy),q=parsed.data;
    if(q.action==='list')return teamJson({version:1,source:'naumi',transport:adapter.transport,policy,enterprises:await adapter.list()});
    if(q.action==='members')return teamJson(await adapter.members(q.enterpriseId));
    return teamJson(await adapter.records(q));
  }catch(e){if(e instanceof IntegrationError)return teamJson({error:e.code},e.status);return teamFailure(e);}
}
