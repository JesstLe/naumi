import assert from 'node:assert/strict';import {randomUUID,createHash} from 'node:crypto';import {Pool} from 'pg';
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 const admin=new Pool({connectionString:process.env.DATABASE_URL}),schema='loginhttp_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
 process.env.PGOPTIONS='-c search_path='+schema;Object.assign(process.env,{NAUMI_AUTH_LOGIN_ONLY:'1',NAUMI_MULTI_USER:'1',SETTINGS_SECRET:'http-native-login-isolated-test-secret-012345678901234'});
 const {getPool}=await import('../src/lib/db'),pool=getPool();
 try{
 await pool.query(`CREATE TABLE app_users(email text PRIMARY KEY,name text,role text DEFAULT 'user',password_hash text,banned boolean DEFAULT false,account_expires_at timestamptz,auth_revoked_before timestamptz,management_version int DEFAULT 0,plan text DEFAULT 'starter',credits_total int DEFAULT 99999,credits_used int DEFAULT 0,joined_at timestamptz DEFAULT now(),renews_at timestamptz DEFAULT now()+interval '1 month');CREATE TABLE app_settings(k text PRIMARY KEY,v text);CREATE TABLE app_credit_batches(email text,remaining int,expires_at timestamptz);CREATE TABLE app_invoices(email text,id text,created_at timestamptz,plan text,amount int,status text);`);
 const {hashPassword}=await import('../src/lib/pw'),{POST}=await import('../src/app/api/auth/login/route'),{verifyUserSession}=await import('../src/lib/native-auth');const password='fixture-not-a-real-password-01';
 const hashed=hashPassword(password);for(let i=0;i<195;i++){const email='member'+i+'@username.naumi.local';await pool.query('INSERT INTO app_users(email,name,password_hash) VALUES($1,$2,$3)',[email,'member'+i,hashed]);await pool.query("INSERT INTO app_credit_batches VALUES($1,99999,now()+interval '1 year')",[email]);}
 const request=(email:string,pw=password,ip='192.0.2.42',extra={})=>new Request('https://fixture.test/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','x-real-ip':ip,'x-forwarded-proto':'https',...extra},body:JSON.stringify({email,password:pw})});
 const before=JSON.stringify((await pool.query('SELECT * FROM app_users ORDER BY email')).rows);
 for(let i=0;i<195;i++){const r=await POST(request('member'+i));assert.equal(r.status,200,'NAT member'+i);const body=await r.json();assert.equal(body.user.name,'member'+i);assert.equal(body.user.creditsTotal,99999);const cookie=r.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.equal(verifyUserSession(cookie.match(/nv_user=([^;]+)/)![1],Date.now()),'member'+i+'@username.naumi.local');}
 for(let i=0;i<10;i++)assert.equal((await POST(request('member0','wrong'))).status,401);
 const limited=await POST(request('member0','wrong'));assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
 assert.equal((await POST(request('member1'))).status,200,'colleague first try remains valid');
 assert.equal((await POST(request('member0','wrong','192.0.2.42',{'cf-connecting-ip':'203.0.113.99'}))).status,429,'untrusted CF header must not rotate verified proxy IP');
 assert.equal((await POST(request('member2',password,'192.0.2.42',{'sec-fetch-site':'cross-site'}))).status,403);
 const malformed=await POST(new Request('https://fixture.test/api/auth/login',{method:'POST',body:'null'}));assert.equal(malformed.status,400);
 assert.equal((await POST(request('',password))).status,400);
 await pool.query("UPDATE app_users SET banned=true WHERE email='member2@username.naumi.local'");assert.equal((await POST(request('member2'))).status,403);await pool.query("UPDATE app_users SET banned=false WHERE email='member2@username.naumi.local'");
 assert.equal(JSON.stringify((await pool.query('SELECT * FROM app_users ORDER BY email')).rows),before);
 console.log('AUTH_LOGIN_HTTP=PASS NATIVE_ROUTE=1 SAME_IP_USERS195=1 VALID_COOKIE195=1 TYPos401_THEN429=1 COLLEAGUE200=1 CF_SPOOF_DENIED=1 BANNED403=1 CROSS_SITE403=1 INVALID400=1 CREDIT_USER_ROWS_UNCHANGED=1 PRODUCTION_WRITES=0');
 }finally{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
