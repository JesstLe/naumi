import {authenticateRelease} from '@/lib/fleet/release-auth';
import {recordReleaseResult} from '@/lib/fleet/releases';
import {fleetJson,fleetFailure,FleetError} from '@/lib/fleet/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function POST(request:Request){try{const actor=await authenticateRelease(request);if(!actor.body.result)throw new FleetError('缺少发布结果');return fleetJson(await recordReleaseResult(actor.instanceId,actor.body.result,actor.tokenHash));}catch(error){return fleetFailure(error);}}
