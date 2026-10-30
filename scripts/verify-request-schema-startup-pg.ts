/** Actual Web startup, limiter, policy handlers and separately bundled readers.
 * --baseline characterizes the captured original tree, not healthy operation.
 * Each part uses a fresh process and an exclusive, randomly named PG schema. */
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Client,Pool} from 'pg';

const option=(name:string)=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const root=path.resolve(option('--source-root')||'.');
const out=path.resolve(option('--out')||process.env.REQUEST_SCHEMA_STARTUP_EVIDENCE||'output/request-schema-startup');
const baseline=process.argv.includes('--baseline'),part=option('--part');
const parts=['shared','dedicated','pool-rebind','parallel-policy','fault-rate','fault-site','sidecar','no-database'];
const load=(name:string):Promise<any>=>import(pathToFileURL(path.join(root,name)).href);
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PATHEXT)$/i.test(key)));

async function main(){
 await mkdir(out,{recursive:true});
 assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1');
 const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/fixture/);
 if(!part){
  let checks=0;const commands=[];
  for(const item of parts){
   const args=['--conditions=react-server','--import','tsx',path.resolve('scripts/verify-request-schema-startup-pg.ts'),'--source-root',root,'--out',out,'--part',item,...(baseline?['--baseline']:[])];
   const env:NodeJS.ProcessEnv={...cleanEnv,NODE_ENV:'test',DATABASE_URL:process.env.DATABASE_URL,NAUMI_VERIFY_ISOLATED_DB:'1',TSX_TSCONFIG_PATH:path.join(root,'tsconfig.json')};
   const cp=spawn(process.execPath,args,{cwd:process.cwd(),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
   let stdout='',stderr='';cp.stdout.on('data',b=>stdout+=b);cp.stderr.on('data',b=>stderr+=b);
   const code=await new Promise<number|null>((resolve,reject)=>{cp.once('error',reject);cp.once('close',resolve);});
   await writeFile(path.join(out,item+'.log'),stdout+stderr+'\nEXIT='+code+'\n');
   commands.push({command:[process.execPath,...args],cwd:process.cwd(),input:'Isolated loopback PG;actual '+root+';part='+item,stdout,stderr,exit:code});
   await writeFile(path.join(out,'COMMANDS.json'),JSON.stringify(commands,null,2)+'\n');
   process.stdout.write(stdout);process.stderr.write(stderr);assert.equal(code,0,item);
   checks+=JSON.parse(await readFile(path.join(out,item+'.json'),'utf8')).checks;
  }
  const report={status:baseline?'REPRODUCED':'PASS',checks,parts:parts.length,sourceRoot:root,commands,actualStartup:true,actualRequestOwners:true,separateRouteBundle:true,realPG:true,external:0,supplier:0};
  await writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`REQUEST_SCHEMA_STARTUP=${report.status} PARTS=${parts.length} CHECKS=${checks} SOURCE=ACTUAL STARTUP=ACTUAL ROUTE_BUNDLE=ACTUAL PG=REAL SUPPLIER=0 EXTERNAL=0`);
  return;
 }
 assert(parts.includes(part));
 const schema='rs_'+randomUUID().replaceAll('-',''),schemas=[schema];
 Object.assign(process.env,{PGOPTIONS:'-c search_path='+schema,SETTINGS_SECRET:'request-schema-fixture-01234567890123456',NAUMI_MULTI_USER:'1',NAUMI_ROUTER_MANAGEMENT_URL:'',NAUMI_VIDEO_WORKER:'0'});
 const enterpriseId='11111111-1111-4111-8111-111111111111';
 if(['dedicated','pool-rebind','fault-site'].includes(part))Object.assign(process.env,{NAUMI_ENTERPRISE_DEPLOYMENT_MODE:'dedicated',NAUMI_ENTERPRISE_SOURCE_INSTANCE_ID:'r8b-fixture',NAUMI_ENTERPRISE_ALLOWED_IDS:enterpriseId});
 if(part==='sidecar')process.env.NAUMI_AUTH_LOGIN_ONLY='1';
 if(part==='no-database')delete process.env.DATABASE_URL;
 let checks=0,phase='control',external=0,trigger:string|undefined;
 const queries:{phase:string;sql:string;pid?:number}[]=[],observations:Record<string,unknown>={};
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
 const ok=(value:unknown)=>{assert.ok(value);checks++;};
 const ddl=(p:string)=>queries.filter(x=>x.phase===p&&/\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX)\b/i.test(x.sql));
 const capture=async<T>(name:string,run:()=>Promise<T>)=>{phase=name;try{return await run();}finally{phase='control';}};
 const originalQuery=Client.prototype.query;
 Client.prototype.query=function(this:Client,...args:unknown[]){queries.push({phase,sql:typeof args[0]==='string'?args[0]:String((args[0]as{text?:string})?.text),pid:(this as Client&{processID?:number}).processID});return Reflect.apply(originalQuery,this,args);}as typeof Client.prototype.query;
 const originalFetch=globalThis.fetch;globalThis.fetch=(async()=>{external++;throw Error('Unexpected external request in schema lifecycle fixture');})as typeof fetch;
 let admin:Pool|undefined,platform:any;
 const seedPolicy=async(store:any,pool:Pool)=>{
  const tx=await pool.connect();try{await tx.query('BEGIN');const result=await store.applySitePolicyTx(tx,{id:randomUUID(),actor:'fixture',expectedRevision:0,policy:{enterpriseId,sourceInstanceId:'r8b-fixture',brand:'Fixture',enabledFeatures:['canvas'],workspaceModules:['dashboard']}});await tx.query('COMMIT');return result;}
  catch(error){await tx.query('ROLLBACK');throw error;}finally{tx.release();}
 };
 const bundleStore=async(label:string)=>{
  const file=path.join(out,part+'-'+label+'.cjs');
  await build({entryPoints:[path.join(root,'src/lib/site-control/store.ts')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'});
  return createRequire(import.meta.url)(file);
 };
 try{
  if(part!=='no-database'){
   admin=new Pool({connectionString:process.env.DATABASE_URL,options:'-c search_path='+schema,max:1});
   await admin.query('CREATE SCHEMA '+schema);
  }
  const startup=await load('src/lib/application/startup.ts');
  platform=await load('src/platform/db/pool.ts');
  if(part==='sidecar'||part==='no-database'){
   const start=queries.length,report=await capture<{mode:string;steps:string[]}>('startup',()=>startup.initializeWebApplication());
   eq(report,{mode:part==='sidecar'?'sidecar':'no-database',steps:[]});eq(queries.length,start);eq(external,0);
   observations.role=report.mode;
  }else if(part==='parallel-policy'){
   // Four real connection-pool owners contend on the same fresh namespace.
   // A DB barrier releases all first DDL commands together; modern owners
   // serialize before that point using the existing namespace transaction.
   const label='r8b-policy-'+randomUUID(),pools:Pool[]=[],apis:any[]=[];
   const require=createRequire(import.meta.url);
   let barrier=false;
   try{
    for(let index=0;index<4;index++){
     const pool=new Pool({connectionString:process.env.DATABASE_URL,options:'-c search_path='+schema,max:1,application_name:label});pools.push(pool);
     const file=path.join(out,'parallel-policy-'+index+'.cjs');
     await build({entryPoints:[path.join(root,'src/lib/site-control/store.ts')],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent',plugins:[{name:'actual-pg-pool-boundary',setup(b){
      b.onResolve({filter:/^@\/(?:lib\/db\/connection|platform\/db\/pool)$/},()=>({path:'pool',namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getPool=()=>globalThis.__r8bSchemaPool;'}));
     }}]});apis.push(require(file));
    }
    await admin!.query(`CREATE FUNCTION ${schema}.ddl_barrier() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF current_schema()='${schema}' THEN PERFORM pg_advisory_xact_lock_shared(9403,8); END IF; END $$`);
    trigger=schema+'_barrier';await admin!.query(`CREATE EVENT TRIGGER ${trigger} ON ddl_command_start EXECUTE FUNCTION ${schema}.ddl_barrier()`);
    await admin!.query('SELECT pg_advisory_lock(9403,8)');barrier=true;
    const work=apis.map((api,index)=>{(globalThis as any).__r8bSchemaPool=pools[index];return api.ensureSitePolicySchema();});
    const settled=Promise.allSettled(work),deadline=Date.now()+15000;
    while(true){
     const n=(await admin!.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory'",[label])).rows[0].n;
     if(n===4)break;assert(Date.now()<deadline,'Four live schema owners did not reach the real database barrier');await new Promise(resolve=>setTimeout(resolve,20));
    }
    await admin!.query('SELECT pg_advisory_unlock(9403,8)');barrier=false;
    const results=await settled,failures=results.filter((x):x is PromiseRejectedResult=>x.status==='rejected');
    if(baseline){ok(failures.length>0);ok(failures.every(x=>['23505','42P07'].includes(x.reason.code)));}
    else eq(failures,[]);
    observations.concurrentOwners=4;observations.failures=failures.map(x=>x.reason.code);
    // Failed old initializers can retry; no rows are manufactured by startup.
    for(let index=0;index<apis.length;index++){(globalThis as any).__r8bSchemaPool=pools[index];await apis[index].ensureSitePolicySchema();}
    eq((await admin!.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=$1 AND table_name=ANY($2)",[schema,['app_site_policy','app_site_policy_audit','app_site_media_audit']])).rows[0].n,3);
    eq((await admin!.query('SELECT count(*)::int n FROM app_site_policy')).rows[0].n,0);eq(external,0);
   }finally{
    if(barrier)await admin!.query('SELECT pg_advisory_unlock(9403,8)');
    await Promise.all(pools.map(pool=>pool.end()));delete (globalThis as any).__r8bSchemaPool;
   }
  }else if(part==='fault-rate'||part==='fault-site'){
   const target=part==='fault-rate'?'app_rate_limit_buckets':'app_site_policy';
   trigger=schema+'_fault';
   await admin!.query(`CREATE FUNCTION ${schema}.reject_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF current_schema()='${schema}' AND position('${target}' IN current_query())>0 THEN RAISE EXCEPTION 'R8B_REAL_DDL_FAULT'; END IF; END $$`);
   await admin!.query(`CREATE EVENT TRIGGER ${trigger} ON ddl_command_start EXECUTE FUNCTION ${schema}.reject_ddl()`);
   if(baseline){
    await capture('startup',()=>startup.initializeWebApplication());
    if(part==='fault-rate')await assert.rejects(capture('first-request',async()=>{const r=await load('src/lib/rate-limit.ts');await r.rateLimit('fault',1,1000);}),e=>(e as {code?:string}).code==='RATE_LIMIT_UNAVAILABLE');
    else await assert.rejects(capture('first-request',async()=>{const s=await load('src/lib/site-control/store.ts');await s.siteProfile();}),/R8B_REAL_DDL_FAULT/);
    checks++;
   }else{await assert.rejects(capture('startup',()=>startup.initializeWebApplication()),/R8B_REAL_DDL_FAULT/);checks++;}
   eq((await admin!.query('SELECT to_regclass($1) AS name',[target])).rows[0].name,null);
   await admin!.query('DROP EVENT TRIGGER '+trigger);trigger=undefined;
   await capture('retry-startup',()=>startup.initializeWebApplication());
   if(part==='fault-rate'){
    const r=await load('src/lib/rate-limit.ts');eq(await capture('recovered-request',()=>r.rateLimit('recovered',1,60000)),true);eq(await r.rateLimit('recovered',1,60000),false);
   }else{
    const s=await load('src/lib/site-control/store.ts');await assert.rejects(capture('recovered-request',()=>s.siteProfile()),e=>(e as {code?:string}).code==='NOT_CONFIGURED');checks++;
   }
   eq(ddl('recovered-request').length,baseline?1:0);eq(external,0);
   observations.faultMovedTo=baseline?'first-request':'startup';observations.retryRequestDDL=ddl('recovered-request').length;
  }else{
   const reports=await capture('startup',()=>Promise.all(Array.from({length:8},()=>startup.initializeWebApplication())));
   ok(reports.every(x=>x===reports[0]));
   eq(reports[0].steps.includes('rate-limit'),!baseline);
   eq(reports[0].steps.includes('site-policy'),!baseline&&part!=='shared');
   observations.startupSteps=reports[0].steps;
   const limiter=await load('src/lib/rate-limit.ts'),store=await load('src/lib/site-control/store.ts');
   const pool:Pool=platform.getPool();
   eq(await capture('first-limiter',()=>limiter.rateLimit('original-key',1,60000)),true);
   eq(await limiter.rateLimit('original-key',1,60000),false);
   eq(ddl('first-limiter').length,baseline?1:0);observations.firstLimiterDDL=ddl('first-limiter').length;
   if(part==='shared'){
    eq(await store.siteProfile(),{mode:'platform'});
    eq((await admin!.query("SELECT to_regclass('app_site_policy') AS name")).rows[0].name,null);
   }else{
    await assert.rejects(capture('first-policy',()=>store.siteProfile()),e=>(e as {code?:string}).code==='NOT_CONFIGURED');checks++;
    eq(ddl('first-policy').length,baseline?1:0);observations.firstPolicyDDL=ddl('first-policy').length;
    if(part==='pool-rebind'){
     const billing=await load('src/lib/billing/runtime.ts'),configurations=await load('src/lib/billing/configuration.ts');
     const oldRuntime=await billing.getBillingRuntime(),oldConfiguration=configurations.getBillingConfiguration(),frozen=await oldConfiguration.current();
     eq(oldRuntime.config,oldConfiguration);eq(await billing.getBillingRuntime(),oldRuntime);eq(configurations.getBillingConfiguration(),oldConfiguration);
     const value=structuredClone(frozen.config);value.credits.signup.amount=4321;
     const published=await oldConfiguration.publish({id:randomUUID(),actor:'fixture',reason:'pool-bound cache fixture',expectedVersion:frozen.version,config:value});
     eq((await oldConfiguration.byVersion(published.version)).config.credits.signup.amount,4321);
     await platform.closeDatabasePools();
     const next='rs_'+randomUUID().replaceAll('-','');schemas.push(next);await admin!.query('CREATE SCHEMA '+next);process.env.PGOPTIONS='-c search_path='+next;
     const rebound=await capture('new-pool-startup',()=>startup.initializeWebApplication());
     eq(rebound===reports[0],baseline);
     eq((await admin!.query('SELECT to_regclass($1) AS name',[next+'.app_users'])).rows[0].name===null,baseline);
     let failure:any;try{await capture('new-pool-policy',()=>store.siteProfile());}catch(error){failure=error;}
     eq(failure?.code,baseline?'42P01':'NOT_CONFIGURED');eq(ddl('new-pool-policy').length,0);
     const nextRuntime=await billing.getBillingRuntime(),nextConfiguration=configurations.getBillingConfiguration();
     eq(nextRuntime===oldRuntime,baseline);eq(nextConfiguration===oldConfiguration,baseline);eq(nextRuntime.config,nextConfiguration);
     if(!baseline){
      const next=await nextConfiguration.current();eq(next.version,frozen.version);eq(next.config.credits.signup.amount,frozen.config.credits.signup.amount);
      await assert.rejects(nextConfiguration.byVersion(published.version),e=>(e as {code?:string}).code==='CONFIG_UNAVAILABLE');checks++;
     }
     observations.newPoolResult=failure?.code;
    }else{
     const policy=await seedPolicy(store,pool),route=await load('src/app/api/site-profile/route.ts');
     const response=await capture<Response>('policy-http',()=>route.GET());eq(response.status,200);eq(await response.json(),{mode:'enterprise',policy});eq(ddl('policy-http').length,0);
     const bundles=await Promise.all([bundleStore('bundle-a'),bundleStore('bundle-b')]);
     const results=await capture('separate-bundles',()=>Promise.all(bundles.map(s=>s.siteProfile())));
     eq(results,[{mode:'enterprise',policy},{mode:'enterprise',policy}]);eq(ddl('separate-bundles').length,baseline?2:0);
     observations.separateBundleDDL=ddl('separate-bundles').length;
     const startupFile=path.join(out,'startup-bundle.cjs');
     await build({entryPoints:[path.join(root,'src/lib/application/startup.ts')],outfile:startupFile,bundle:true,platform:'node',format:'cjs',packages:'external',tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'});
     const separatelyBundledStartup=createRequire(import.meta.url)(startupFile);
     const bundledReport=await capture('separate-startup',()=>separatelyBundledStartup.initializeWebApplication());
     eq(bundledReport===reports[0],!baseline);eq(ddl('separate-startup').length,0);
     // A real PostgreSQL DDL trigger proves the warmed request does not merely
     // suppress a schema error or silently change the policy/read protocol.
     trigger=schema+'_fault';await admin!.query(`CREATE FUNCTION ${schema}.reject_all_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN IF current_schema()='${schema}' THEN RAISE EXCEPTION 'R8B_REQUEST_DDL_FORBIDDEN'; END IF; END $$`);
     await admin!.query(`CREATE EVENT TRIGGER ${trigger} ON ddl_command_start EXECUTE FUNCTION ${schema}.reject_all_ddl()`);
     const reader=await bundleStore('ddl-forbidden-reader');
     if(baseline){await assert.rejects(capture('ddl-forbidden',()=>reader.siteProfile()),/R8B_REQUEST_DDL_FORBIDDEN/);checks++;}
     else{eq(await capture('ddl-forbidden',()=>reader.siteProfile()),{mode:'enterprise',policy});eq(ddl('ddl-forbidden').length,0);}
     await admin!.query('DROP EVENT TRIGGER '+trigger);trigger=undefined;
     process.env.NAUMI_ENTERPRISE_ALLOWED_IDS=randomUUID();await assert.rejects(store.siteProfile(),e=>(e as {code?:string}).code==='DENIED');checks++;
     eq((await admin!.query('SELECT count(*)::int n FROM app_site_policy_audit')).rows[0].n,1);
    }
   }
   eq(external,0);
   eq((await admin!.query("SELECT count(*)::int n FROM app_ledger WHERE kind='consume'")).rows[0].n,0);
  }
  if(part==='shared'||part==='dedicated'){
   const columns=(await admin!.query(`SELECT c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expr FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relkind='r' ORDER BY c.relname,a.attnum`,[schema])).rows;
   const constraints=(await admin!.query(`SELECT c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 ORDER BY c.relname,k.conname`,[schema])).rows;
   const indexes=(await admin!.query('SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname=$1 ORDER BY tablename,indexname',[schema])).rows;
   const snapshot=JSON.parse(JSON.stringify({columns,constraints,indexes}).replaceAll(schema,'FIXTURE_SCHEMA'));
   await writeFile(path.join(out,part+'-schema.json'),JSON.stringify(snapshot,null,2)+'\n');
   observations.schemaDigest=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  }
  const sourceHashes=Object.fromEntries(await Promise.all(['src/lib/application/persistence.ts','src/lib/rate-limit-store.ts','src/lib/site-control/store.ts'].map(async p=>[p,createHash('sha256').update(await readFile(path.join(root,p))).digest('hex')])));
  await writeFile(path.join(out,part+'.json'),JSON.stringify({status:baseline?'REPRODUCED':'PASS',checks,part,sourceRoot:root,sourceHashes,observations,queries,external,supplier:0},null,2)+'\n');
  console.log(`REQUEST_SCHEMA_PART=${part} STATUS=${baseline?'REPRODUCED':'PASS'} CHECKS=${checks} OBSERVATIONS=${JSON.stringify(observations)}`);
 }finally{
  Client.prototype.query=originalQuery;globalThis.fetch=originalFetch;
  if(trigger)await admin!.query('DROP EVENT TRIGGER '+trigger);
  if(platform)await platform.closeDatabasePools();
  if(admin){for(const s of schemas)await admin.query('DROP SCHEMA '+s+' CASCADE');await admin.end();}
  console.log('REQUEST_SCHEMA_CLEANUP=PASS OWN_SCHEMAS_DROPPED='+(admin?schemas.length:0)+' POOLS_CLOSED=1');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
