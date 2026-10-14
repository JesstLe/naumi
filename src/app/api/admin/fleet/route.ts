import { createInstanceSchema, adminCommandSchema, instanceChangeSchema, grantSchema } from '@/lib/fleet/contracts';
import { fleetOperator, fleetSnapshot, createInstance, enqueueCommand, changeInstance, saveGrant, fleetFailure, fleetJson, limitedJson } from '@/lib/fleet/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request: Request) {
  try { const actor=await fleetOperator(request);if(actor instanceof Response)return actor;return fleetJson(await fleetSnapshot(actor)); }
  catch(error){return fleetFailure(error);}
}
export async function POST(request: Request) {
  try {
    const actor=await fleetOperator(request,true);if(actor instanceof Response)return actor;
    const body=await limitedJson(request,12000);
    if((body as {action?:string})?.action==='command') {const command=adminCommandSchema.parse(body);return fleetJson(await enqueueCommand(actor.actor,command.instanceId,command.id,command.operation,actor),202);}
    if(!actor.root)return fleetJson({error:'此操作需要总管理员'},403);
    if((body as {action?:string})?.action==='create') {const command=createInstanceSchema.parse(body);return fleetJson(await createInstance(actor.actor,command.name,command.kind,command.enabled,command.id),201);}
    if((body as {action?:string})?.action==='grant'){const command=grantSchema.parse(body);return fleetJson(await saveGrant(actor.actor,command));}
    const command=instanceChangeSchema.parse(body);return fleetJson(await changeInstance(actor.actor,command.instanceId,command.action));
  } catch(error){return fleetFailure(error);}
}
