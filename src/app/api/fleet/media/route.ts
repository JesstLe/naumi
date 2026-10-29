import { fleetMediaResponse } from '@/lib/site-control/media';
import { TeamError } from '@/lib/teams/server';
import { teamJson } from '@/lib/teams/access';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{return await fleetMediaResponse(request);}
  catch(error){return teamJson({error:'作品暂不可读取'},error instanceof TeamError?error.status:503);}
}
