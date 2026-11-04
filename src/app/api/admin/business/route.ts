import {dbEnabled} from '@/platform/db/pool';
import {fleetAdmin,fleetFailure,fleetJson,limitedJson} from '@/lib/fleet/server';
import {startFleetBusinessQuery,pollFleetBusinessQuery} from '@/lib/fleet/business-central';

export const runtime='nodejs',dynamic='force-dynamic';
function unavailable(){
  if(!dbEnabled)return fleetJson({error:'未配置数据库，管理不可用'},503);
  if(process.env.FLEET_PORTAL_ONLY==='1')return fleetJson({error:'需要总后台管理员身份'},403);
  return null;
}
export async function POST(request:Request){
  try{
    const denied=unavailable();if(denied)return denied;
    const actor=await fleetAdmin(request,true);if(actor instanceof Response)return actor;
    return fleetJson(await startFleetBusinessQuery(actor,await limitedJson(request,4000)));
  }catch(error){return fleetFailure(error);}
}
export async function GET(request:Request){
  try{
    const denied=unavailable();if(denied)return denied;
    const actor=await fleetAdmin(request);if(actor instanceof Response)return actor;
    const id=new URL(request.url).searchParams.get('requestId');if(!id)return fleetJson({error:'缺少查询标识'},400);
    return fleetJson(await pollFleetBusinessQuery(actor,id));
  }catch(error){return fleetFailure(error);}
}
