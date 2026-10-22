import {NextResponse} from 'next/server';
import {z} from 'zod';
import {tenantAuthorize,tenantFailure} from '@/lib/saas/tenants';
import {enterpriseCommandSchema,mutateEnterprise} from '@/lib/enterprise/server';
import {teamJson,teamMutationOrigin} from '@/lib/teams/access';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Explicit platform administration, separate from the customer identity API. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await tenantAuthorize(request);if(actor instanceof NextResponse)return actor;
 if(!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
 const {id}=await params;if(!z.string().uuid().safeParse(id).success)return teamJson({error:'租户不存在'},404);
 const parsed=enterpriseCommandSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success||parsed.data.enterpriseId!==id||parsed.data.action==='reset-password')return teamJson({error:'组织操作参数无效'},400);
 try{return teamJson(await mutateEnterprise(actor,parsed.data));}catch(error){return tenantFailure(error);}
}
