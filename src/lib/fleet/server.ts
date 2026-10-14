import 'server-only';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getPool, ensureSchema } from '@/lib/db';
import { requireAdmin, resolveUserEmail } from '@/lib/admin-auth';
import { sameSiteBillingMutation, PRIVATE_HEADERS } from '@/lib/billing/access';
import { digest, canonical, signCommand, operationSchema, pollSchema, ackSchema, commandCapability, type FleetOperation, type FleetActor } from './contracts';
import type { PoolClient } from 'pg';
import { rateLimit } from '@/lib/rate-limit';
import { clientIp } from '@/lib/ip';

export class FleetError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export const fleetJson = (data: unknown, status = 200) => Response.json(data, { status, headers: PRIVATE_HEADERS });
export async function fleetAdmin(request: Request, mutation = false):Promise<FleetActor|Response> {
  if (process.env.FLEET_CONTROL_ENABLED !== '1') return fleetJson({ error: '中央控制台未启用' }, 404);
  if (!await requireAdmin(request)) return fleetJson({ error: '需要总后台管理员身份' }, 403);
  if (mutation && !sameSiteBillingMutation(request)) return fleetJson({ error: '请求来源无效' }, 403);
  if (!rateLimit('fleet-admin:'+(clientIp(request)||'local'), 120, 60000)) return fleetJson({error:'请求过于频繁'},429);
  return { actor: await resolveUserEmail(request) || 'local-admin', root:true };
}
export async function fleetOperator(request:Request,mutation=false):Promise<FleetActor|Response> {
  if(process.env.FLEET_CONTROL_ENABLED!=='1')return fleetJson({error:'中央控制台未启用'},404);
  if(mutation&&!sameSiteBillingMutation(request))return fleetJson({error:'请求来源无效'},403);
  if(!rateLimit('fleet-op:'+(clientIp(request)||'local'),180,60000))return fleetJson({error:'请求过于频繁'},429);
  if(await requireAdmin(request))return {actor:await resolveUserEmail(request)||'local-admin',root:true};
  const actor=await resolveUserEmail(request);if(!actor)return fleetJson({error:'需要登录'},401);
  await ensureFleetSchema();const grants=await getPool().query("SELECT 1 FROM app_fleet_grants WHERE email=$1 AND allowed ? 'read' AND (expires_at IS NULL OR expires_at>now()) LIMIT 1",[actor]);
  return grants.rowCount?{actor,root:false}:fleetJson({error:'没有实例管理权限'},403);
}
export async function assertInstanceAccess(tx:Pick<PoolClient,'query'>,actor:FleetActor,instanceId:string,capability:string) {
  if(actor.root)return;
  const grant=await tx.query("SELECT g.allowed FROM app_fleet_grants g JOIN app_users u ON u.email=g.email WHERE g.instance_id=$1 AND g.email=$2 AND NOT u.banned AND (g.expires_at IS NULL OR g.expires_at>now()) FOR SHARE OF g",[instanceId,actor.actor]);
  if(!grant.rowCount||!grant.rows[0].allowed.includes('read')||!grant.rows[0].allowed.includes(capability))throw new FleetError('实例操作未授权',403);
}
export async function limitedJson(request: Request, limit = 48000): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new FleetError('请求格式无效', 415);
  const reader = request.body?.getReader(); if (!reader) throw new FleetError('请求为空');
  let bytes = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > limit) throw new FleetError('请求过大', 413); chunks.push(next.value); } }
  finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new FleetError('请求格式无效'); }
}
export function fleetFailure(error: unknown) {
  if (error instanceof FleetError) return fleetJson({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return fleetJson({ error: '参数无效' }, 400);
  return fleetJson({ error: '管理服务暂时不可用' }, 503);
}
let ready: Promise<void> | undefined;
export async function ensureFleetSchema() {
  if (!ready) ready = (async () => {
    await ensureSchema();
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS app_fleet_instances(
        id uuid PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('main','enterprise')),
        token_hash text NOT NULL, enabled boolean NOT NULL DEFAULT true, last_seen timestamptz,
        status jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_fleet_commands(
        id uuid PRIMARY KEY, instance_id uuid NOT NULL REFERENCES app_fleet_instances(id), actor text NOT NULL,
        operation jsonb NOT NULL, fingerprint text NOT NULL, state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','succeeded','failed')),
        lease_id uuid, leased_until timestamptz, result jsonb, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz);
      CREATE INDEX IF NOT EXISTS fleet_commands_instance ON app_fleet_commands(instance_id,created_at);
      CREATE TABLE IF NOT EXISTS app_fleet_nonces(instance_id uuid NOT NULL REFERENCES app_fleet_instances(id), nonce uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(instance_id,nonce));
      CREATE TABLE IF NOT EXISTS app_fleet_audit(id bigserial PRIMARY KEY, instance_id uuid NOT NULL REFERENCES app_fleet_instances(id), actor text NOT NULL, action text NOT NULL, command_id uuid, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS app_fleet_applied(id uuid PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE app_fleet_applied ADD COLUMN IF NOT EXISTS instance_id uuid;
      ALTER TABLE app_fleet_applied ADD COLUMN IF NOT EXISTS actor text;
      ALTER TABLE app_fleet_applied ADD COLUMN IF NOT EXISTS operation jsonb;
      ALTER TABLE app_fleet_commands ADD COLUMN IF NOT EXISTS requested_by_root boolean NOT NULL DEFAULT true;
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='app_fleet_commands'::regclass AND conname='app_fleet_commands_state_check' AND pg_get_constraintdef(oid) LIKE '%blocked%') THEN
          ALTER TABLE app_fleet_commands DROP CONSTRAINT IF EXISTS app_fleet_commands_state_check;
          ALTER TABLE app_fleet_commands ADD CONSTRAINT app_fleet_commands_state_check CHECK(state IN ('queued','leased','succeeded','failed','blocked'));
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS app_fleet_grants(instance_id uuid NOT NULL REFERENCES app_fleet_instances(id),email text NOT NULL REFERENCES app_users(email),allowed jsonb NOT NULL DEFAULT '[]',version integer NOT NULL DEFAULT 0,expires_at timestamptz,PRIMARY KEY(instance_id,email));
    `);
  })().catch(error => { ready = undefined; throw error; });
  await ready;
}
export async function createInstance(actor: string, name: string, kind: 'main' | 'enterprise', enabled = true, id: string = randomUUID()) {
  await ensureFleetSchema(); const token = randomBytes(32).toString('base64url');
  const tx = await getPool().connect();
  try { await tx.query('BEGIN'); await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);if((await tx.query('SELECT id FROM app_fleet_instances WHERE id=$1',[id])).rowCount)throw new FleetError('实例已注册；凭据未保存时请轮换密钥',409);await tx.query('INSERT INTO app_fleet_instances(id,name,kind,token_hash,enabled) VALUES($1,$2,$3,$4,$5)', [id,name,kind,digest(token),enabled]);
    await tx.query("INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,$2,'register')",[id,actor]); await tx.query('COMMIT'); return { id, token };
  } catch(error) { await tx.query('ROLLBACK'); throw error; } finally { tx.release(); }
}
export async function changeInstance(actor: string, instanceId: string, action: 'enable' | 'revoke' | 'rotate') {
  await ensureFleetSchema(); const tx = await getPool().connect();
  try { await tx.query('BEGIN'); const instance = await tx.query('SELECT id FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[instanceId]); if(!instance.rowCount) throw new FleetError('实例不存在',404);
    const token = action === 'rotate' ? randomBytes(32).toString('base64url') : undefined;
    if(token) await tx.query('UPDATE app_fleet_instances SET token_hash=$2 WHERE id=$1',[instanceId,digest(token)]);
    else await tx.query('UPDATE app_fleet_instances SET enabled=$2 WHERE id=$1',[instanceId,action==='enable']);
    await tx.query('INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,$2,$3)',[instanceId,actor,action]); await tx.query('COMMIT'); return token ? { token } : { ok:true };
  } catch(error) { await tx.query('ROLLBACK'); throw error; } finally { tx.release(); }
}
export async function fleetSnapshot(actor:FleetActor={actor:'internal',root:true}) {
  await ensureFleetSchema();
  const scope=actor.root?null:actor.actor;
  const [instances,commands,audit,grants] = await Promise.all([
    getPool().query(`SELECT i.id,i.name,i.kind,i.enabled,i.last_seen,i.status,i.created_at,COALESCE(g.allowed,'[]') AS capabilities FROM app_fleet_instances i LEFT JOIN app_fleet_grants g ON g.instance_id=i.id AND g.email=$1 WHERE $1::text IS NULL OR (g.allowed ? 'read' AND (g.expires_at IS NULL OR g.expires_at>now())) ORDER BY i.created_at LIMIT 200`,[scope]),
    getPool().query(`SELECT c.id,c.instance_id,c.actor,c.operation,c.state,c.result,c.created_at,c.finished_at FROM app_fleet_commands c WHERE $1::text IS NULL OR EXISTS(SELECT 1 FROM app_fleet_grants g WHERE g.instance_id=c.instance_id AND g.email=$1 AND g.allowed ? 'read' AND (g.expires_at IS NULL OR g.expires_at>now())) ORDER BY c.created_at DESC LIMIT 100`,[scope]),
    getPool().query(`SELECT a.instance_id,a.actor,a.action,a.command_id,a.created_at FROM app_fleet_audit a WHERE $1::text IS NULL OR EXISTS(SELECT 1 FROM app_fleet_grants g WHERE g.instance_id=a.instance_id AND g.email=$1 AND g.allowed ? 'read' AND (g.expires_at IS NULL OR g.expires_at>now())) ORDER BY a.id DESC LIMIT 100`,[scope]),
    actor.root?getPool().query('SELECT instance_id,email,allowed,version,expires_at FROM app_fleet_grants ORDER BY instance_id,email LIMIT 500'):Promise.resolve({rows:[]}),
  ]);
  return { instances:instances.rows, commands:commands.rows, audit:audit.rows, grants:grants.rows, root:actor.root, now:Date.now() };
}
export async function saveGrant(actor:string,command:{instanceId:string;email:string;allowed:string[];expectedVersion:number;expiresAt:string|null}) {
  await ensureFleetSchema();const tx=await getPool().connect();
  try {await tx.query('BEGIN');if(!(await tx.query('SELECT id FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[command.instanceId])).rowCount)throw new FleetError('实例不存在',404);
    const user=await tx.query('SELECT email FROM app_users WHERE email=$1',[command.email]);if(!user.rowCount)throw new FleetError('用户不存在',404);
    const current=(await tx.query('SELECT version FROM app_fleet_grants WHERE instance_id=$1 AND email=$2 FOR UPDATE',[command.instanceId,command.email])).rows[0];
    if((current?.version||0)!==command.expectedVersion)throw new FleetError('授权已更新，请刷新',409);
    if(command.allowed.length&&!command.allowed.includes('read'))throw new FleetError('操作权限需同时授予查看权限');
    if(command.expiresAt&&new Date(command.expiresAt).getTime()<=Date.now())throw new FleetError('授权到期时间无效');
    await tx.query('INSERT INTO app_fleet_grants(instance_id,email,allowed,version,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(instance_id,email) DO UPDATE SET allowed=excluded.allowed,version=excluded.version,expires_at=excluded.expires_at',[command.instanceId,command.email,JSON.stringify(command.allowed),command.expectedVersion+1,command.expiresAt]);
    await tx.query('INSERT INTO app_fleet_audit(instance_id,actor,action) VALUES($1,$2,$3)',[command.instanceId,actor,'grant:'+command.email+':'+command.allowed.join(',')]);await tx.query('COMMIT');return {version:command.expectedVersion+1};
  }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
}
export async function enqueueCommand(actor: string, instanceId: string, id: string, raw: FleetOperation,authority:FleetActor={actor,root:true}) {
  await ensureFleetSchema(); const operation = operationSchema.parse(raw), fingerprint = digest(canonical({instanceId,actor,operation}));
  const tx = await getPool().connect();
  try { await tx.query('BEGIN'); await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[id]);
    const instance = await tx.query('SELECT enabled FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[instanceId]); if(!instance.rowCount || !instance.rows[0].enabled) throw new FleetError('实例未启用',409);
    await assertInstanceAccess(tx,authority,instanceId,commandCapability(operation));
    const existing = await tx.query('SELECT fingerprint,state FROM app_fleet_commands WHERE id=$1',[id]);
    if(existing.rowCount) { if(existing.rows[0].fingerprint!==fingerprint) throw new FleetError('操作编号冲突',409); await tx.query('COMMIT'); return {id,state:existing.rows[0].state,replayed:true}; }
    await tx.query('INSERT INTO app_fleet_commands(id,instance_id,actor,operation,fingerprint,requested_by_root) VALUES($1,$2,$3,$4,$5,$6)',[id,instanceId,actor,JSON.stringify(operation),fingerprint,authority.root]);
    await tx.query("INSERT INTO app_fleet_audit(instance_id,actor,action,command_id) VALUES($1,$2,'enqueue',$3)",[instanceId,actor,id]); await tx.query('COMMIT'); return {id,state:'queued',replayed:false};
  } catch(error) { await tx.query('ROLLBACK'); throw error; } finally {tx.release();}
}
export async function connectorExchange(request: Request, ack = false) {
  if(process.env.FLEET_CONTROL_ENABLED!=='1') throw new FleetError('实例连接未启用',404);
  if(!rateLimit('fleet-connect-ip:'+(clientIp(request)||'local'),600,60000))throw new FleetError('连接过于频繁',429);
  // A reverse proxy must terminate verified TLS. Loopback HTTP is test-only.
  const url = new URL(request.url);
  if(url.protocol!=='https:' && request.headers.get('x-forwarded-proto')!=='https' && !(process.env.FLEET_ISOLATED_TEST==='1' && ['127.0.0.1','localhost'].includes(url.hostname))) throw new FleetError('需要HTTPS',400);
  const instanceId = z.string().uuid().parse(request.headers.get('x-naumi-instance'));
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]; if(!token) throw new FleetError('实例认证失败',401);
  await ensureFleetSchema();
  const tx = await getPool().connect();
  try { await tx.query('BEGIN'); const instance = await tx.query('SELECT token_hash,enabled FROM app_fleet_instances WHERE id=$1 FOR UPDATE',[instanceId]);
    const actual = digest(token); if(!instance.rowCount || !instance.rows[0].enabled || !timingSafeEqual(Buffer.from(actual),Buffer.from(instance.rows[0].token_hash))) throw new FleetError('实例认证失败',401);
    const body = ack ? ackSchema.parse(await limitedJson(request)) : pollSchema.parse(await limitedJson(request,12000));
    if(Math.abs(Date.now()-body.timestamp)>120000) throw new FleetError('连接时间失效',409);
    const fresh = await tx.query('INSERT INTO app_fleet_nonces(instance_id,nonce) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING nonce',[instanceId,body.nonce]); if(!fresh.rowCount) throw new FleetError('重复连接请求',409);
    await tx.query("DELETE FROM app_fleet_nonces WHERE instance_id=$1 AND created_at<now()-interval '10 minutes'",[instanceId]);
    if(ack && 'result' in body) {
      const command = await tx.query('SELECT state,result,lease_id FROM app_fleet_commands WHERE id=$1 AND instance_id=$2 FOR UPDATE',[body.commandId,instanceId]);
      if(!command.rowCount) throw new FleetError('指令不存在',404);
      if(['succeeded','failed'].includes(command.rows[0].state)) { if(canonical(command.rows[0].result)!==canonical(body.result)) throw new FleetError('结果冲突',409); }
      else { if(!['leased','blocked'].includes(command.rows[0].state)||command.rows[0].lease_id!==body.leaseId) throw new FleetError('指令租约失效',409);
        await tx.query('UPDATE app_fleet_commands SET state=$2,result=$3,finished_at=now() WHERE id=$1',[body.commandId,body.result.status,JSON.stringify(body.result)]);
        await tx.query("INSERT INTO app_fleet_audit(instance_id,actor,action,command_id) VALUES($1,'connector',$2,$3)",[instanceId,body.result.status,body.commandId]); }
      await tx.query('COMMIT'); return {ok:true};
    }
    if(!('status' in body)) throw new FleetError('连接格式无效');
    await tx.query('UPDATE app_fleet_instances SET last_seen=now(),status=$2 WHERE id=$1',[instanceId,JSON.stringify(body.status)]);
    const pending = await tx.query("SELECT * FROM app_fleet_commands WHERE instance_id=$1 AND state IN ('queued','leased') ORDER BY created_at,id LIMIT 1 FOR UPDATE",[instanceId]);
    let command = null, leaseId: string | null = null;
    const row = pending.rows[0];
    if(row&&!row.requested_by_root&&(row.state==='queued'||new Date(row.leased_until).getTime()<=Date.now())){
      try{await assertInstanceAccess(tx,{actor:row.actor,root:false},instanceId,commandCapability(row.operation));}
      catch(error){if(!(error instanceof FleetError)||error.status!==403)throw error;
        if(row.state==='queued')await tx.query("UPDATE app_fleet_commands SET state='failed',result=$2,finished_at=now() WHERE id=$1",[row.id,JSON.stringify({status:'failed',code:'DENIED'})]);
        else await tx.query("UPDATE app_fleet_commands SET state='blocked' WHERE id=$1",[row.id]);
        await tx.query("INSERT INTO app_fleet_audit(instance_id,actor,action,command_id) VALUES($1,'connector','grant-revoked-before-dispatch',$2)",[instanceId,row.id]);await tx.query('COMMIT');return {command:null,leaseId:null};}
    }
    if(row && (row.state==='queued'||new Date(row.leased_until).getTime()<=Date.now())) {
      leaseId=randomUUID(); const expiresAt=Date.now()+300000;
      await tx.query("UPDATE app_fleet_commands SET state='leased',lease_id=$2,leased_until=$3 WHERE id=$1",[row.id,leaseId,new Date(expiresAt)]);
      command=signCommand({id:row.id,instanceId,actor:row.actor,expiresAt,operation:row.operation},token);
    }
    await tx.query('COMMIT'); return {command,leaseId};
  } catch(error) {await tx.query('ROLLBACK');throw error;} finally {tx.release();}
}
