import { fleetOperator, fleetJson, fleetFailure } from '@/lib/fleet/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request:Request) {try {const actor=await fleetOperator(request);if(actor instanceof Response)return actor;return fleetJson({enabled:true,root:actor.root});}catch(error){return fleetFailure(error);}}
