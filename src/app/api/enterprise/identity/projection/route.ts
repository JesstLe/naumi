import {identityConsumer,identityProjection} from '@/lib/enterprise/identity/service';
import {teamJson,teamFailure} from '@/lib/teams/access';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{return teamJson(await identityProjection(identityConsumer(request.headers.get('authorization'))));}catch(e){return teamFailure(e);}
}
