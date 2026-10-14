import { connectorExchange, fleetFailure, fleetJson } from '@/lib/fleet/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function POST(request: Request) {try {return fleetJson(await connectorExchange(request,true));}catch(error){return fleetFailure(error);}}
