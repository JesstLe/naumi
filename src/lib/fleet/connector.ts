import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPool, getUser, adjustUserCredits } from '@/lib/db';
import { saveFeaturePolicy, userFeaturePolicy, FeatureAccessError } from '@/lib/feature-access/server';
import { BillingError } from '@/lib/billing/types';
import { operationSchema, commandSchema, canonical, digest, centralUrl, verifyCommand, resultSchema, statusSchema, type FleetCommand, type FleetResult, type SignedFleetCommand } from './contracts';
import { ensureFleetSchema } from './server';

/** Persistent receipts and existing billing idempotency survive connector restarts. */
export async function applyFleetCommand(input: FleetCommand, localInstanceId: string): Promise<FleetResult> {
  const command = commandSchema.parse(input);
  if(command.instanceId!==localInstanceId || command.expiresAt<Date.now()) throw new Error('FLEET_WRONG_INSTANCE_OR_EXPIRED');
  const operation=operationSchema.parse(command.operation);
  await ensureFleetSchema(); const fingerprint=digest(canonical({id:command.id,instanceId:command.instanceId,actor:command.actor,operation}));
  const tx=await getPool().connect();
  try {
    await tx.query('BEGIN'); await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['fleet:'+command.id]);
    const receipt=await tx.query('SELECT fingerprint,result FROM app_fleet_applied WHERE id=$1',[command.id]);
    if(receipt.rowCount) { if(receipt.rows[0].fingerprint!==fingerprint) throw new Error('FLEET_ID_CONFLICT'); await tx.query('COMMIT'); return resultSchema.parse(receipt.rows[0].result); }
    let result: FleetResult;
    if(operation.type==='users.list') {
      const query='%'+operation.search+'%';
      const users=await tx.query('SELECT email,name,banned,role,credits_total,credits_used FROM app_users WHERE email ILIKE $1 OR name ILIKE $1 ORDER BY email LIMIT 30 OFFSET $2',[query,(operation.page-1)*30]);
      const count=await tx.query('SELECT count(*)::int AS total FROM app_users WHERE email ILIKE $1 OR name ILIKE $1',[query]);
      result={status:'succeeded',data:{users:users.rows.map(row=>({email:row.email,name:row.name||'',banned:!!row.banned,role:row.role,creditsTotal:Number(row.credits_total),creditsUsed:Number(row.credits_used)})),total:count.rows[0].total,page:operation.page}};
    } else if(operation.type==='users.ban') {
      const user=await tx.query('SELECT banned,role FROM app_users WHERE email=$1 FOR UPDATE',[operation.email]);
      if(!user.rowCount) result={status:'failed',code:'NOT_FOUND'};
      else if(user.rows[0].role==='admin') result={status:'failed',code:'DENIED'};
      else if(!!user.rows[0].banned!==operation.expectedBanned) result={status:'failed',code:'CONFLICT'};
      else { await tx.query('UPDATE app_users SET banned=$2 WHERE email=$1',[operation.email,operation.banned]);result={status:'succeeded',data:{email:operation.email,banned:operation.banned}}; }
    } else {
      if(!await getUser(operation.email)) result={status:'failed',code:'NOT_FOUND'};
      else {
        try {
          if(operation.type==='credits.adjust') {
            await adjustUserCredits(operation.email,operation.delta,operation.reason,{id:command.id,actor:'fleet:'+command.instanceId+':'+command.actor,months:operation.months});
            result={status:'succeeded',data:{email:operation.email,applied:true,operationId:command.id}};
          } else {
            const policy=operation.type==='features.get' ? await userFeaturePolicy(operation.email) : await saveFeaturePolicy('fleet:'+command.instanceId+':'+command.actor,{id:command.id,email:operation.email,mode:operation.mode,allowed:operation.allowed,expectedVersion:operation.expectedVersion});
            result={status:'succeeded',data:{email:operation.email,policy}};
          }
        } catch(error) {
          // Infrastructure failures remain retryable; never acknowledge unknown outcomes.
          if((error instanceof FeatureAccessError || error instanceof BillingError) && error.status<500) result={status:'failed',code:error.status===409?'CONFLICT':error.status===404?'NOT_FOUND':error.status===403?'DENIED':'INVALID'};
          else throw error;
        }
      }
    }
    result=resultSchema.parse(result);
    await tx.query('INSERT INTO app_fleet_applied(id,fingerprint,result,instance_id,actor,operation) VALUES($1,$2,$3,$4,$5,$6)',[command.id,fingerprint,JSON.stringify(result),command.instanceId,command.actor,JSON.stringify(operation)]);
    await tx.query('COMMIT'); return result;
  } catch(error) {await tx.query('ROLLBACK');throw error;} finally {tx.release();}
}

export async function connectorTick(options: {central: string; instanceId: string; token: string; status: unknown; isolated?: boolean}) {
  const central=centralUrl(options.central,options.isolated),status=statusSchema.parse(options.status);
  if(!/^[A-Za-z0-9_-]{43}$/.test(options.token)) throw new Error('FLEET_INVALID_TOKEN');
  async function send(endpoint: string, data: unknown) {
    const response=await fetch(central+'/api/fleet/'+endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json','authorization':'Bearer '+options.token,'x-naumi-instance':options.instanceId},body:JSON.stringify({nonce:randomUUID(),timestamp:Date.now(),...data as object})});
    if(!response.ok) throw new Error('FLEET_CONNECTION_'+response.status);
    const reader=response.body?.getReader();if(!reader)throw new Error('FLEET_EMPTY_RESPONSE');const chunks:Uint8Array[]=[];let bytes=0;
    try {for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>48000)throw new Error('FLEET_RESPONSE_TOO_LARGE');chunks.push(next.value);}}
    finally{await reader.cancel().catch(()=>{});}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const response=await send('poll',{status});
  if(!response.command) return {state:'idle'};
  if(typeof response.leaseId!=='string') throw new Error('FLEET_INVALID_LEASE');
  const command=verifyCommand(response.command as SignedFleetCommand,options.token,options.instanceId);
  const result=await applyFleetCommand(command,options.instanceId);
  await send('ack',{commandId:command.id,leaseId:response.leaseId,result});
  return {state:result.status,commandId:command.id};
}
