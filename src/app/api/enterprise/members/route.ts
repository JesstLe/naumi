import {NextResponse} from 'next/server';
import {enterpriseAuthorize} from '@/lib/enterprise/access';
import {teamFailure,teamJson,teamMutationOrigin} from '@/lib/teams/access';
import {enterpriseMemberCommandSchema,manageEnterpriseMember} from '@/lib/enterprise/member-management';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){
 const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
 if(!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
 const parsed=enterpriseMemberCommandSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return teamJson({error:parsed.error.issues[0]?.message||'成员参数无效'},400);
 try{return teamJson(await manageEnterpriseMember(actor,parsed.data));}catch(error){return teamFailure(error);}
}
