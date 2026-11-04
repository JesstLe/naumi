import {createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

const supportSchema=z.object({version:z.literal(1),instanceId:z.string().uuid(),nonce:z.string().uuid(),signature:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const signature=(instanceId:string,nonce:string,token:string)=>createHmac('sha256',token).update('fleet-business-support:v1:'+JSON.stringify([instanceId,nonce])).digest('hex');

/** A successful authenticated poll confirms this central's protocol support.
 * The nonce binds this exchange, not a cached host or a release/rollback permit. */
export function signFleetBusinessSupport(instanceId:string,nonce:string,token:string){
  return supportSchema.parse({version:1,instanceId,nonce,signature:signature(instanceId,nonce,token)});
}

/** Missing, malformed or replayed confirmations preserve legacy heartbeat shape. */
export function verifyFleetBusinessSupport(value:unknown,instanceId:string,nonce:string,token:string){
  const parsed=supportSchema.safeParse(value);
  if(!parsed.success||parsed.data.instanceId!==instanceId||parsed.data.nonce!==nonce)return false;
  return timingSafeEqual(Buffer.from(parsed.data.signature,'hex'),Buffer.from(signature(instanceId,nonce,token),'hex'));
}
