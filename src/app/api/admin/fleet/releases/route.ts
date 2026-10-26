import { fleetOperator, fleetJson, fleetFailure, limitedJson } from '@/lib/fleet/server';
import { registerRelease, saveReleasePolicy, reviewReleasePlan, releaseSnapshot } from "@/lib/fleet/releases";
import { releaseRegistrationSchema, releasePolicySchema, releasePlanChangeSchema } from "@/lib/fleet/release-contracts";
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request:Request){try{const actor=await fleetOperator(request);if(actor instanceof Response)return actor;return fleetJson(await releaseSnapshot(actor));}catch(error){return fleetFailure(error);}}
export async function POST(request:Request){try{const actor=await fleetOperator(request,true);if(actor instanceof Response)return actor;const body=await limitedJson(request,24000);
  if((body as {action?:string})?.action==='release-register'){if(!actor.root)return fleetJson({error:'需要总管理员验收'},403);return fleetJson(await registerRelease(actor.actor,releaseRegistrationSchema.parse(body)),201);}
  if((body as {action?:string})?.action==='release-policy')return fleetJson(await saveReleasePolicy(actor,releasePolicySchema.parse(body)));
  return fleetJson(await reviewReleasePlan(actor,releasePlanChangeSchema.parse(body)));
}catch(error){return fleetFailure(error);}}
