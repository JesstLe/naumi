import {identityConsumer,identityProjection} from '@/lib/enterprise/identity/service';
import {teamJson,teamFailure} from '@/lib/teams/access';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const subject=new URL(request.url).searchParams.get('subjectId');if(subject&&!z.string().uuid().safeParse(subject).success)return teamJson({error:'人员标识无效'},400);
 try{return teamJson(await identityProjection(identityConsumer(request.headers.get('authorization')),subject??undefined));}catch(e){return teamFailure(e);}
}
