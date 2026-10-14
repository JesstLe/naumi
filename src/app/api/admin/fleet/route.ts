import { createInstanceSchema, adminCommandSchema, instanceChangeSchema } from '@/lib/fleet/contracts';
import { fleetAdmin, fleetSnapshot, createInstance, enqueueCommand, changeInstance, fleetFailure, fleetJson, limitedJson } from '@/lib/fleet/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request: Request) {
  try { const actor=await fleetAdmin(request);if(actor instanceof Response)return actor;return fleetJson(await fleetSnapshot()); }
  catch(error){return fleetFailure(error);}
}
export async function POST(request: Request) {
  try {
    const actor=await fleetAdmin(request,true);if(actor instanceof Response)return actor;
    const body=await limitedJson(request,12000);
    if((body as {action?:string})?.action==='create') {const command=createInstanceSchema.parse(body);return fleetJson(await createInstance(actor.actor,command.name,command.kind,command.enabled,command.id),201);}
    if((body as {action?:string})?.action==='command') {const command=adminCommandSchema.parse(body);return fleetJson(await enqueueCommand(actor.actor,command.instanceId,command.id,command.operation),202);}
    const command=instanceChangeSchema.parse(body);return fleetJson(await changeInstance(actor.actor,command.instanceId,command.action));
  } catch(error){return fleetFailure(error);}
}
