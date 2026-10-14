import { requireAdmin } from '@/lib/admin-auth';
import { fleetJson, fleetFailure } from '@/lib/fleet/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request:Request) {try {if(!await requireAdmin(request))return fleetJson({error:'需要管理员身份'},403);return fleetJson({enabled:process.env.FLEET_CONTROL_ENABLED==='1'});}catch(error){return fleetFailure(error);}}
