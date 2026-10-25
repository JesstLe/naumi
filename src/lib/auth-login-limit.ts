import {databaseSchemaReadiness} from "@/platform/db/schema-readiness";
import 'server-only';
import {createHmac,randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import type {Pool} from 'pg';

export const LOGIN_LIMITS={windowMs:600_000,pendingMs:30_000,pairFailures:10,accountFailures:30,networkBurst:600,networkWindowMs:60_000} as const;
export const LOGIN_GUARD_SQL=`
CREATE TABLE IF NOT EXISTS app_auth_login_attempts(
 id uuid PRIMARY KEY,account_hash text NOT NULL,network_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 outcome text NOT NULL CHECK(outcome IN ('pending','failure','success','ignored'))
);
CREATE INDEX IF NOT EXISTS app_auth_login_account_time ON app_auth_login_attempts(account_hash,created_at);
CREATE INDEX IF NOT EXISTS app_auth_login_network_time ON app_auth_login_attempts(network_hash,created_at);
CREATE INDEX IF NOT EXISTS app_auth_login_cleanup ON app_auth_login_attempts(created_at);`;
export async function ensureLoginGuardSchema(pool:Pool){
 const state=databaseSchemaReadiness(pool,"login");
 let ready=state.pending;
 if(!ready){ready=(async()=>{const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s'");await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('auth-login-schema-v1',0))");await tx.query(LOGIN_GUARD_SQL);await tx.query('COMMIT');}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}})().catch(e=>{state.pending=undefined;throw e;});state.pending=ready;}
 await ready;
}
export function loginNetwork(raw:string|null){
 const value=raw?.trim()||'';
 if(!isIP(value))return 'unknown';
 // Canonical URL hostname prevents alternate IPv6 spellings from creating buckets.
 if(value.includes(':'))return new URL('http://['+value+']/').hostname.replace(/^\[|\]$/g,'').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/,'$1');
 return value;
}
export function createLoginGuard(pool:Pool,secret:string){
 if(secret.length<32)throw Error('LOGIN_GUARD_SECRET_REQUIRED');
 const digest=(kind:string,value:string)=>createHmac('sha256',secret).update('login-v1:'+kind+':'+value).digest('hex');
 return {
  async begin(account:string,network:string|null):Promise<{allowed:true;id:string}|{allowed:false;retryAfter:number}>{
   await ensureLoginGuardSchema(pool);
   const accountHash=digest('account',account.trim().toLowerCase()),networkHash=digest('network',loginNetwork(network));
   const locks=['a:'+accountHash,'n:'+networkHash].sort(),tx=await pool.connect();
   try{
    await tx.query('BEGIN');await tx.query("SET LOCAL lock_timeout='3s'");await tx.query("SET LOCAL statement_timeout='5s'");
    for(const key of locks)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['auth-login:'+key]);
    const rows=(await tx.query<{outcome:string;age:number;account_match:boolean;network_match:boolean}>(`SELECT outcome,extract(epoch FROM (clock_timestamp()-created_at))*1000 AS age,account_hash=$1 AS account_match,network_hash=$2 AS network_match
      FROM app_auth_login_attempts WHERE created_at>clock_timestamp()-interval '10 minutes' AND (account_hash=$1 OR network_hash=$2)`,[accountHash,networkHash])).rows;
    const counts=(r:typeof rows[number])=>r.outcome==='failure'||r.outcome==='pending'&&Number(r.age)<LOGIN_LIMITS.pendingMs;
    const accountRows=rows.filter(r=>r.account_match&&counts(r)),pairRows=accountRows.filter(r=>r.network_match),networkRows=rows.filter(r=>r.network_match&&Number(r.age)<LOGIN_LIMITS.networkWindowMs);
    const blocks:[typeof rows,number][]=[];
    if(accountRows.length>=LOGIN_LIMITS.accountFailures)blocks.push([accountRows,LOGIN_LIMITS.windowMs]);
    if(pairRows.length>=LOGIN_LIMITS.pairFailures)blocks.push([pairRows,LOGIN_LIMITS.windowMs]);
    if(networkRows.length>=LOGIN_LIMITS.networkBurst)blocks.push([networkRows,LOGIN_LIMITS.networkWindowMs]);
    if(blocks.length){
     const wait=Math.max(...blocks.map(([set,window])=>Math.min(...set.map(r=>(r.outcome==='pending'?Math.min(window,LOGIN_LIMITS.pendingMs):window)-Number(r.age)))));
     await tx.query('ROLLBACK');return {allowed:false,retryAfter:Math.max(1,Math.ceil(wait/1000))};
    }
    const id=randomUUID();await tx.query("INSERT INTO app_auth_login_attempts(id,account_hash,network_hash,outcome) VALUES($1,$2,$3,'pending')",[id,accountHash,networkHash]);
    // Bounded opportunistic retention; no plaintext account/IP is persisted.
    await tx.query("DELETE FROM app_auth_login_attempts WHERE id IN (SELECT id FROM app_auth_login_attempts WHERE created_at<clock_timestamp()-interval '20 minutes' ORDER BY created_at LIMIT 1000 FOR UPDATE SKIP LOCKED)");
    await tx.query('COMMIT');return {allowed:true,id};
   }catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
  },
  async finish(id:string,outcome:'failure'|'success'|'ignored'){
   await pool.query("UPDATE app_auth_login_attempts SET outcome=$2 WHERE id=$1 AND outcome='pending'",[id,outcome]);
  },
 };
}
