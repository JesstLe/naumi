/** Real isolated PostgreSQL full-source A/B, each scenario in a fresh process.
 * No credentials, product data, supplier calls, Web or workers are involved. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Pool,type PoolClient} from 'pg';
const arg=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
async function main(){
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');assert.equal(new URL(process.env.DATABASE_URL!).hostname,'127.0.0.1');
 const root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline'),scenario=arg('--scenario'),out=path.resolve(process.env.PERSISTENCE_EVIDENCE||'output/refactor-r4a2-20261024'),load=(p:string)=>import(pathToFileURL(path.join(root,p)).href);
 await mkdir(out,{recursive:true});
 if(!scenario){
  let checks=0;for(const current of ['fresh','legacy','pressure','retry','fleet','login']){
   const child=spawn(process.execPath,['--conditions=react-server','--import','tsx',path.resolve('scripts/verify-persistence-pg.ts'),'--source-root',root,'--scenario',current,...(baseline?['--baseline']:[])],{env:{...process.env,TSX_TSCONFIG_PATH:path.join(root,'tsconfig.json')},windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',v=>stdout+=v);child.stderr.on('data',v=>stderr+=v);const status=await new Promise<number|null>((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});await writeFile(path.join(out,`PG_${baseline?'BASELINE':'MODIFIED'}_${current}.log`),stdout+stderr+`\nEXIT=${status}\n`);process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(status,0,current);checks+=Number(stdout.match(/CHECKS=(\d+)/)?.[1]||0);
  }
  console.log(`PERSISTENCE_PG=PASS mode=${baseline?'BASELINE':'MODIFIED'} scenarios=6 checks=${checks} REAL_PG=1 SETTINGS=ACTUAL IDENTITY=ACTUAL SIGNUP=ACTUAL LEGACY_PROVIDER=PRESERVED PRESSURE=${baseline?'REPRODUCED':'SINGLE_CONNECTION'} SUPPLIER=0`);return;
 }
 const schema=`persistence_${randomUUID().replace(/-/g,'')}`,admin=new Pool({connectionString:process.env.DATABASE_URL,ssl:false}),seed=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,options:`-c search_path=${schema}`});let db:typeof import('../src/lib/db')|undefined,checks=0;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;},ok=(v:unknown)=>{assert.ok(v);checks++;};
 const owner='persistence@fixture.test';await admin.query(`CREATE SCHEMA ${schema}`);
 Object.assign(process.env,{PGOPTIONS:`-c search_path=${schema}`,SETTINGS_SECRET:'persistence-fixture-only-key-01234567890123456789',NAUMI_MULTI_USER:'1'});
 try{
  if(scenario==='fleet'||scenario==='login'){
   await seed.query("CREATE TABLE app_users(email text,name text,role text,banned boolean,auth_revoked_before timestamptz,account_expires_at timestamptz); CREATE TABLE app_settings(k text PRIMARY KEY,v text NOT NULL,updated_at timestamptz DEFAULT now()); INSERT INTO app_settings(k,v) VALUES('raw','0')");process.env[scenario==='fleet'?'FLEET_PORTAL_ONLY':'NAUMI_AUTH_LOGIN_ONLY']='1';
  }
  if(scenario==='legacy'){
   await seed.query(`CREATE TABLE app_users(email text PRIMARY KEY,name text NOT NULL,plan text NOT NULL DEFAULT 'starter',credits_total int NOT NULL DEFAULT 20,credits_used int NOT NULL DEFAULT 0,joined_at timestamptz NOT NULL DEFAULT now(),renews_at timestamptz NOT NULL);
    INSERT INTO app_users(email,name,renews_at) VALUES('persistence@fixture.test','Original owner',now()+interval '1 month');
    CREATE TABLE app_user_image_providers(email text PRIMARY KEY REFERENCES app_users(email),enabled boolean NOT NULL,protocol text NOT NULL,base_url_enc text NOT NULL,api_key_enc text NOT NULL,models jsonb NOT NULL,default_model text NOT NULL,updated_at timestamptz DEFAULT now());
    INSERT INTO app_user_image_providers(email,enabled,protocol,base_url_enc,api_key_enc,models,default_model) VALUES('persistence@fixture.test',false,'openai-images','fixture-url-bytes','fixture-key-bytes','["fixture-model"]','fixture-model');
    CREATE TABLE app_artworks(id text PRIMARY KEY,email text NOT NULL,title text NOT NULL,category text NOT NULL,prompt text NOT NULL,status text NOT NULL,image_url text NOT NULL,gradient text NOT NULL,created_at timestamptz DEFAULT now(),parent_id text);
    INSERT INTO app_artworks(id,email,title,category,prompt,status,image_url,gradient,parent_id) VALUES('root','persistence@fixture.test','Original','main','','completed','/media/original.png','',null),('child','persistence@fixture.test','Child','main','','completed','/media/child.png','','root');`);
  }
  db=await load('src/lib/db.ts');const pool=db!.getPool(),schemaApi=baseline?db!:await load('src/lib/persistence/schema.ts'),settings=baseline?db!:await load('src/lib/settings/repository.ts');
  if(!baseline){ok(schemaApi.ensureSchema===db!.ensureSchema);ok(settings.getSetting===db!.getSetting);ok(settings.setSetting===db!.setSetting);}
  if(scenario==='pressure'){
   pool.options.connectionTimeoutMillis=500;const held:PoolClient[]=[];try{for(let i=0;i<4;i++)held.push(await pool.connect());let error:unknown;try{await schemaApi.ensureSchema();}catch(e){error=e;}if(baseline){ok(error instanceof Error);ok(/timeout/i.test((error as Error).message));eq((await seed.query("SELECT to_regclass('app_users') AS name")).rows[0].name,null);}else{eq(error,undefined);ok((await seed.query("SELECT to_regclass('app_users') AS name")).rows[0].name);}}finally{held.forEach(tx=>tx.release());pool.options.connectionTimeoutMillis=0;}
   await schemaApi.ensureSchema();ok((await seed.query("SELECT to_regclass('app_users') AS name")).rows[0].name);eq(pool.waitingCount,0);
  }else if(scenario==='retry'){
   let injected=false;const inject=(tx:PoolClient)=>{const query=tx.query.bind(tx);tx.query=((...args:unknown[])=>{if(!injected&&typeof args[0]==='string'&&args[0].includes('CREATE TABLE IF NOT EXISTS app_billing_config_versions')){injected=true;return query('SELECT 1/0');}return (query as (...a:unknown[])=>unknown)(...args);}) as typeof tx.query;};pool.on('connect',inject);
   try{await assert.rejects(schemaApi.ensureSchema(),/division by zero/);checks++;eq((await seed.query("SELECT to_regclass('app_users') AS name")).rows[0].name,null);await schemaApi.ensureSchema();ok((await seed.query("SELECT to_regclass('app_users') AS name")).rows[0].name);}finally{pool.off('connect',inject);}
  }else await Promise.all([schemaApi.ensureSchema(),schemaApi.ensureSchema(),schemaApi.ensureSchema()]);
  if(scenario==='fleet'||scenario==='login'){
   eq((await seed.query('SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name',[schema])).rows.map(r=>r.table_name),['app_settings','app_users']);eq(await settings.getSetting('raw'),'0');
  }else{
   eq(await settings.getSetting('absent'),null);for(const value of ['','0','false',' spaces ','正文']){await settings.setSetting('raw',value);eq(await settings.getSetting('raw'),value);}await db!.setSetting('raw','legacy-write');eq(await settings.getSetting('raw'),'legacy-write');await settings.setSetting('raw','new-write');eq(await db!.getSetting('raw'),'new-write');
   if(scenario==='legacy'){
    const rows=(await pool.query('SELECT id,email,enabled,is_active,protocol,base_url_enc,api_key_enc,models,default_model FROM app_user_image_providers')).rows;eq(rows.length,1);ok(rows[0].id.startsWith('prov-'));eq({...rows[0],id:'generated'},{id:'generated',email:owner,enabled:false,is_active:false,protocol:'openai-images',base_url_enc:'fixture-url-bytes',api_key_enc:'fixture-key-bytes',models:['fixture-model'],default_model:'fixture-model'});eq((await pool.query('SELECT id,group_id,image_url FROM app_artworks ORDER BY id')).rows,[{id:'child',group_id:'root',image_url:'/media/child.png'},{id:'root',group_id:'root',image_url:'/media/original.png'}]);
   }
   if(scenario==='fresh'){
    const native=await load('src/lib/native-auth.ts');await db!.getOrCreateUser(owner);eq(await native.activeNativeAccountEmail(owner),owner);await pool.query('UPDATE app_users SET banned=true WHERE email=$1',[owner]);eq(await native.activeNativeAccountEmail(owner),null);await pool.query('UPDATE app_users SET banned=false WHERE email=$1',[owner]);
    const signup=baseline?db!:await load('src/lib/billing/signup.ts');await signup.setSignupBonus(7,'fixture');eq(await db!.getSignupBonus(),7);await db!.setSignupBonus(0,'fixture');eq(await signup.getSignupBonus(),0);await db!.getOrCreateUser('zero@fixture.test');eq(Number((await pool.query("SELECT credits_total FROM app_users WHERE email='zero@fixture.test'")).rows[0].credits_total),0);
    const settingsApi=await load('src/lib/settings.ts');await settingsApi.saveOpenAIKey('fixture-only-api-key');eq((await settingsApi.getLegacyOpenAISettings()).apiKey,'fixture-only-api-key');await settingsApi.saveSmtp({host:'fixture.host',port:587,user:'fixture-user',pass:' spaced fixture password ',from:'fixture-from'});const smtp=await settingsApi.getSmtpConfig();eq([smtp.host,smtp.port,smtp.user,smtp.pass,smtp.from],['fixture.host',587,'fixture-user',' spaced fixture password ','fixture-from']);
   }
   const shape=(await seed.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema=$1 ORDER BY table_name,ordinal_position",[schema])).rows.map(row=>({...row,column_default:row.column_default?.replaceAll(schema,'SCHEMA')}));await writeFile(path.join(out,`SCHEMA_${baseline?'BASELINE':'MODIFIED'}_${scenario}.json`),JSON.stringify(shape,null,2));
  }
  eq(pool.waitingCount,0);console.log(`SCENARIO=${scenario} MODE=${baseline?'BASELINE':'MODIFIED'} CHECKS=${checks} RESULT=PASS`);
 }finally{if(db)await db.getPool().end();await seed.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();console.log(`PERSISTENCE_CLEANUP=${scenario} SCHEMA_DROPPED=1 POOLS_CLOSED=1`);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
