import { requireAdmin, resolveUserEmail, adminPasswordState } from "@/lib/admin-auth";
import { grantCommandSchema, mutateGrant, listGrants, grantAudit } from "@/lib/teams/grants";
import { teamJson,teamFailure,teamMutationOrigin } from "@/lib/teams/access";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function guard(request:Request) {
  if (!await requireAdmin(request) || !(await adminPasswordState(request)).authenticated) return null;
  const email=await resolveUserEmail(request)||"local-admin";
  return (await rateLimit(`team-access:${email}:${clientIp(request)}`,120,60_000)) ? { email,admin:true,consoleAdmin:true } : null;
}
export async function GET(request:Request) {
  try {
    if (!await guard(request)) return teamJson({error:"需要后台二次验证"},403);
    const q=new URL(request.url).searchParams, page=Math.min(10000,Math.max(1,Number(q.get("page"))||1));
    if (!Number.isInteger(page)) return teamJson({error:"分页参数无效"},400);
    const target=q.get("email");
    return teamJson(target ? await grantAudit(target.slice(0,254),page) : await listGrants((q.get("search")||"").slice(0,100),page));
  } catch(error){return teamFailure(error);}
}
export async function POST(request:Request) {
  try {
    const actor=await guard(request);if(!actor)return teamJson({error:"需要后台二次验证"},403);
    if(!teamMutationOrigin(request))return teamJson({error:"请求来源无效"},403);
    const parsed=grantCommandSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return teamJson({error:"授权参数无效"},400);
    return teamJson(await mutateGrant(actor,parsed.data));
  } catch(error){return teamFailure(error);}
}
