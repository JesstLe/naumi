import { siteCreations, siteCreationMedia } from '@/lib/site-control/creations';
import { TeamError } from '@/lib/teams/server';
import { readSitePolicy, applySitePolicyTx, SitePolicyError } from '@/lib/site-control/store';
import {ensureSitePolicySchema} from '@/lib/site-control/schema';
import 'server-only';
import { randomUUID } from 'node:crypto';
import {adjustUserCredits} from "@/lib/billing/grants";
import {getPool} from "@/platform/db/pool";
import {getUser} from "@/lib/accounts/session";
import {saveFeaturePolicy,userFeaturePolicy,FeatureAccessError} from "@/lib/feature-access/repository";
import { BillingError } from '@/lib/billing/types';
import { operationSchema, commandSchema, canonical, digest, centralUrl, verifyCommand, resultSchema, statusSchema, type FleetCommand, type FleetResult, type SignedFleetCommand } from './contracts';
import { ensureFleetSchema } from './server';
import {fleetFetch} from './transport';
import {readFleetBusinessQuery} from './business-read-model';
import type {FleetBusinessQuery} from './business-contracts';
import {verifyFleetBusinessSupport} from './business-support';

/** Read-only duplication is harmless; the first metadata receipt remains the
 * stable winner. No outer checkout/lock is held while the RR reader uses a pool
 * connection, including pools configured with max=1. */
async function applyBusinessQuery(command:FleetCommand,operation:FleetBusinessQuery,fingerprint:string):Promise<FleetResult>{
  const pool=getPool();
  const existing=await pool.query('SELECT fingerprint,result FROM app_fleet_applied WHERE id=$1',[command.id]);
  if(existing.rowCount){if(existing.rows[0].fingerprint!==fingerprint)throw Error('FLEET_ID_CONFLICT');return resultSchema.parse(existing.rows[0].result);}
  let result:FleetResult;
  try{result={status:'succeeded',data:{business:await readFleetBusinessQuery(pool,operation)}};}
  catch{result={status:'failed',code:'UNAVAILABLE'};}
  result=resultSchema.parse(result);
  await pool.query('INSERT INTO app_fleet_applied(id,fingerprint,result,instance_id,actor,operation) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[command.id,fingerprint,JSON.stringify(result),command.instanceId,command.actor,JSON.stringify(operation)]);
  const winner=(await pool.query('SELECT fingerprint,result FROM app_fleet_applied WHERE id=$1',[command.id])).rows[0];
  if(!winner||winner.fingerprint!==fingerprint)throw Error('FLEET_ID_CONFLICT');
  return resultSchema.parse(winner.result);
}

/** Persistent receipts and existing billing idempotency survive connector restarts. */
export async function applyFleetCommand(input: FleetCommand, localInstanceId: string): Promise<FleetResult> {
  const command = commandSchema.parse(input);
  if(command.instanceId!==localInstanceId || command.expiresAt<Date.now()) throw new Error('FLEET_WRONG_INSTANCE_OR_EXPIRED');
  const operation=operationSchema.parse(command.operation);
  // A read-only connector upgrade must not bootstrap/refactor the enterprise
  // application's schema. Fleet receipt metadata already belongs to this
  // installed connector. Missing read metadata is acknowledged as unavailable
  // without writing a receipt, so a dashboard query cannot block controls.
  if(operation.type==='business.query'){
    const columns=(await getPool().query("SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='app_fleet_applied'")).rows.map(r=>r.column_name);
    if(!['id','fingerprint','result','instance_id','actor','operation'].every(c=>columns.includes(c)))return {status:'failed',code:'UNAVAILABLE'};
  }else await ensureFleetSchema();
  if(operation.type.startsWith('site.policy.')) await ensureSitePolicySchema();
  const fingerprint=digest(canonical({id:command.id,instanceId:command.instanceId,actor:command.actor,operation}));
  if(operation.type==='business.query')return applyBusinessQuery(command,operation,fingerprint);
  const tx=await getPool().connect();
  try {
    await tx.query('BEGIN'); await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',['fleet:'+command.id]);
    const receipt=await tx.query('SELECT fingerprint,result FROM app_fleet_applied WHERE id=$1',[command.id]);
    if(receipt.rowCount) { if(receipt.rows[0].fingerprint!==fingerprint) throw new Error('FLEET_ID_CONFLICT'); await tx.query('COMMIT'); return resultSchema.parse(receipt.rows[0].result); }
    let result: FleetResult;
    if(operation.type==='creations.list'||operation.type==='creations.media') {
      try {result={status:'succeeded',data:operation.type==='creations.list'?await siteCreations(command,operation):await siteCreationMedia(command,operation.creationId,operation.assetId)};}
      catch(error) {if(error instanceof SitePolicyError)result={status:'failed',code:'DENIED'};else if(error instanceof TeamError&&error.status<500)result={status:'failed',code:error.status===404?'NOT_FOUND':'DENIED'};else throw error;}
    } else if(operation.type==='site.policy.get'||operation.type==='site.policy.set') {
      try {
        const policy=operation.type==='site.policy.get' ? await readSitePolicy(tx) : await applySitePolicyTx(tx,{id:command.id,actor:command.actor,policy:operation.policy,expectedRevision:operation.expectedRevision});
        result={status:'succeeded',data:{sitePolicy:policy}};
      } catch(error) {
        if(error instanceof SitePolicyError && error.code!=='NOT_CONFIGURED') result={status:'failed',code:error.code};
        else throw error;
      }
    } else if(operation.type==='users.list') {
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
            const policy=operation.type==='features.get' ? await userFeaturePolicy(operation.email,{site:false}) : await saveFeaturePolicy('fleet:'+command.instanceId+':'+command.actor,{id:command.id,email:operation.email,mode:operation.mode,allowed:operation.allowed,expectedVersion:operation.expectedVersion});
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

/** Probe with the legacy status shape on every tick; never cache central support
 * across ticks or origins. Only a nonce-bound confirmation admits business. */
export async function connectorTick(options: {central: string; instanceId: string; token: string; status: unknown; isolated?: boolean; business?: boolean}) {
  const central=centralUrl(options.central,options.isolated),status=statusSchema.parse(options.status);
  if(!/^[A-Za-z0-9_-]{43}$/.test(options.token)) throw new Error('FLEET_INVALID_TOKEN');
  /** Send one nonce-bound authenticated poll or ACK with a timeout and bounded response body.
   * Expose explicit HTTP rejection status for the narrowly allowed legacy-shape retry.
   */
  async function send(endpoint: string, data: unknown, probe=false) {
    const nonce=randomUUID();
    const response=await fleetFetch(central+'/api/fleet/'+endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'content-type':'application/json','authorization':'Bearer '+options.token,'x-naumi-instance':options.instanceId,...(probe?{'x-naumi-fleet-business-probe':'1'}:{})},body:JSON.stringify({nonce,timestamp:Date.now(),...data as object})});
    if(!response.ok) throw Object.assign(new Error('FLEET_CONNECTION_'+response.status),{fleetResponseStatus:response.status});
    const reader=response.body?.getReader();if(!reader)throw new Error('FLEET_EMPTY_RESPONSE');const chunks:Uint8Array[]=[];let bytes=0;
    try {for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>48000)throw new Error('FLEET_RESPONSE_TOO_LARGE');chunks.push(next.value);}}
    finally{await reader.cancel().catch(()=>{});}
    return {data:JSON.parse(Buffer.concat(chunks).toString('utf8')),nonce};
  }
  const {business,...legacyStatus}=status;
  const supportsBusiness=options.business===true||business===1;
  let exchange=await send('poll',{status:legacyStatus},supportsBusiness),businessAdvertised=false;
  if(!exchange.data.command&&supportsBusiness&&verifyFleetBusinessSupport(exchange.data.businessSupport,options.instanceId,exchange.nonce,options.token)){
    try{exchange=await send('poll',{status:{...legacyStatus,business:1}});businessAdvertised=true;}
    catch(error){
      // A pre-PR central can replace the confirmed peer between these polls.
      // Only an explicit HTTP schema rejection retries the legacy shape; timeouts,
      // authentication/rate-limit and unknown service failures remain unknown.
      if(!(error instanceof Error)||!('fleetResponseStatus' in error)||error.fleetResponseStatus!==400)throw error;
      exchange=await send('poll',{status:legacyStatus},supportsBusiness);
    }
  }
  const response=exchange.data;
  if(!response.command) return {state:'idle'};
  if(typeof response.leaseId!=='string') throw new Error('FLEET_INVALID_LEASE');
  const command=verifyCommand(response.command as SignedFleetCommand,options.token,options.instanceId);
  if(command.operation.type==='business.query'&&!businessAdvertised)throw new Error('FLEET_BUSINESS_NOT_NEGOTIATED');
  const result=await applyFleetCommand(command,options.instanceId);
  await send('ack',{commandId:command.id,leaseId:response.leaseId,result});
  return {state:result.status,commandId:command.id};
}
