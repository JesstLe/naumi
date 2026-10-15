import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createLoginGuard,LOGIN_LIMITS,loginNetwork} from '../src/lib/auth-login-limit';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');
 const admin=new Pool({connectionString:url.toString()}),schema='nat_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 const p=new Pool({connectionString:url.toString(),options:'-c search_path='+schema,max:10}),q=new Pool({connectionString:url.toString(),options:'-c search_path='+schema,max:10}),secret='isolated-native-login-hmac-secret-01234567890123456789';
 const one=createLoginGuard(p,secret),two=createLoginGuard(q,secret);
 try{
  const ip='192.0.2.10';
  for(let i=0;i<195;i++){const guard=i%2?one:two,a=await guard.begin('employee'+i+'@username.naumi.local',ip);assert.ok(a.allowed);await guard.finish(a.id,'success');}
  for(let i=0;i<LOGIN_LIMITS.pairFailures;i++){const a=await one.begin('typo@username.naumi.local',ip);assert.ok(a.allowed);await one.finish(a.id,'failure');}
  const blocked=await two.begin('typo@username.naumi.local',ip);assert.equal(blocked.allowed,false);if(!blocked.allowed)assert.ok(blocked.retryAfter>0&&blocked.retryAfter<=600);
  const colleague=await two.begin('fresh@username.naumi.local',ip);assert.ok(colleague.allowed);await two.finish(colleague.id,'success');
  const parallel=await Promise.all(Array.from({length:25},(_,i)=>(i%2?one:two).begin('parallel@username.naumi.local','192.0.2.20')));assert.equal(parallel.filter(a=>a.allowed).length,LOGIN_LIMITS.pairFailures);
  for(const a of parallel)if(a.allowed)await one.finish(a.id,'ignored');
  const resumed=await two.begin('parallel@username.naumi.local','192.0.2.20');assert.ok(resumed.allowed);await two.finish(resumed.id,'success');
  for(let i=0;i<LOGIN_LIMITS.accountFailures;i++){const a=await one.begin('rotating@username.naumi.local','198.51.100.'+(i+1));assert.ok(a.allowed);await one.finish(a.id,'failure');}
  assert.equal((await two.begin('rotating@username.naumi.local','203.0.113.99')).allowed,false);
  await p.query("UPDATE app_auth_login_attempts SET created_at=clock_timestamp()-interval '11 minutes'");assert.ok((await one.begin('typo@username.naumi.local',ip)).allowed);
  const a=await one.begin('stale@username.naumi.local',ip);assert.ok(a.allowed);await p.query("UPDATE app_auth_login_attempts SET created_at=clock_timestamp()-interval '31 seconds' WHERE id=$1",[a.id]);assert.ok((await two.begin('stale@username.naumi.local',ip)).allowed);
  assert.equal(loginNetwork(' 192.0.2.1 '),'192.0.2.1');assert.equal(loginNetwork('spoof'),'unknown');assert.equal(loginNetwork('2001:db8:0:0:0:0:0:1'),loginNetwork('2001:db8::1'));
  const serialized=JSON.stringify((await p.query('SELECT * FROM app_auth_login_attempts')).rows);assert.ok(!serialized.includes('employee')&&!serialized.includes('192.0.2.')&&!serialized.includes('@'));
  console.log('AUTH_NAT=PASS SAME_IP_SUCCESS195=1 TWO_POOL_SHARED_STATE=1 SUCCESS_NOT_FAILURE=1 COLLEAGUE_UNAFFECTED=1 WRONG_PASSWORD_LIMIT=1 CONCURRENT_RESERVATIONS=1 ROTATING_IP_ACCOUNT_LIMIT=1 EXPIRY=1 HASHED_IDENTITIES=1 PRODUCTION_WRITES=0');
 }finally{await p.end();await q.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
