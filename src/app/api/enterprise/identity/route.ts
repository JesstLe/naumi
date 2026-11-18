import {NextResponse} from 'next/server';
import {enterpriseAuthorize} from '@/lib/enterprise/access';
import {teamFailure,teamJson,teamMutationOrigin} from '@/lib/teams/access';
import {identityCommandSchema} from '@/lib/enterprise/identity/contracts';
import {identityDirectory,mutateIdentity} from '@/lib/enterprise/identity/service';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
 const id=new URL(request.url).searchParams.get('enterpriseId');if(!z.string().uuid().safeParse(id).success)return teamJson({error:'企业参数无效'},400);
 try{return teamJson(await identityDirectory(actor,id!));}catch(e){return teamFailure(e);}
}
export async function POST(request:Request){
 const actor=await enterpriseAuthorize(request);if(actor instanceof NextResponse)return actor;
 if(!request.headers.get('origin')||!teamMutationOrigin(request))return teamJson({error:'请求来源无效'},403);
 const command=identityCommandSchema.safeParse(await request.json().catch(()=>null));if(!command.success)return teamJson({error:'组织或产品授权参数无效'},400);
 try{return teamJson(await mutateIdentity(actor,command.data));}catch(e){return teamFailure(e);}
}
