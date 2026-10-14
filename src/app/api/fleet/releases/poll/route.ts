import {authenticateRelease} from '@/lib/fleet/release-auth';
import {leaseRelease} from '@/lib/fleet/releases';
import {fleetJson,fleetFailure} from '@/lib/fleet/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function POST(request:Request){try{const actor=await authenticateRelease(request);return fleetJson({release:await leaseRelease(actor.instanceId,actor.tokenHash)});}catch(error){return fleetFailure(error);}}
