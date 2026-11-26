// Actual ensureSchema AST, actual transaction wrapper/billing DDL, exclusive PG.
// --baseline expects the old second checkout to time out with pool max=1.
const fs=require('fs'),path=require('path'),cp=require('child_process'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto'),ts=require('typescript'),{Pool}=require('pg');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d,source=path.resolve(arg('--source',root)),out=path.resolve(arg('--output',process.env.SCHEMA_BOOTSTRAP_EVIDENCE||'output/release103-frame-20261030/schema-bootstrap-client')),baseline=args.includes('--baseline');
fs.mkdirSync(out,{recursive:true});const name='schema-client-'+crypto.randomUUID().slice(0,8),label='io.naumi.schema-client='+name;let cid,checks=0;const evidence=[];
function docker(a){return cp.execFileSync('docker',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
function extracted(file,fn){const code=fs.readFileSync(path.join(source,file),'utf8'),ast=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true);const node=ast.statements.find(x=>ts.isFunctionDeclaration(x)&&x.name?.text===fn);assert(node,'AST_FUNCTION:'+fn);return node.getText(ast).replace(/^export\s+/,'');}
async function exercise(connectionString,legacy){
 const schema='case_'+crypto.randomUUID().replace(/-/g,''),admin=new Pool({connectionString,max:1});await admin.query('CREATE SCHEMA '+schema);
 if(legacy){await admin.query('SET search_path TO '+schema);await admin.query(`CREATE TABLE app_users(email text PRIMARY KEY,name text NOT NULL,plan text NOT NULL DEFAULT 'starter',credits_total int NOT NULL DEFAULT 20,credits_used int NOT NULL DEFAULT 0,joined_at timestamptz NOT NULL DEFAULT now(),renews_at timestamptz NOT NULL);INSERT INTO app_users(email,name,renews_at)VALUES('fixture@example.test','fixture',now());CREATE TABLE app_user_image_providers(email text PRIMARY KEY REFERENCES app_users(email),enabled boolean NOT NULL,protocol text NOT NULL,base_url_enc text NOT NULL,api_key_enc text NOT NULL,models jsonb NOT NULL,default_model text NOT NULL,updated_at timestamptz NOT NULL);INSERT INTO app_user_image_providers VALUES('fixture@example.test',false,'openai-images','base-ciphertext','key-ciphertext','["model-a"]','model-a','2026-10-01T00:00:00Z');`);}
 const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:350,options:'-c search_path='+schema}),trace=[];let connects=0,poolQueries=0,ready=0,releases=0;
 const facade={connect:async()=>{connects++;const c=await pool.connect();return{query:async(q,...rest)=>{trace.push({pid:c.processID,sql:q.trim().slice(0,95)});return c.query(q,...rest);},release:()=>{releases++;c.release();}};},query:(...a)=>{poolQueries++;return pool.query(...a);}};
 const owner=fs.existsSync(path.join(source,'src/lib/persistence/schema.ts'))?'src/lib/persistence/schema.ts':'src/lib/db.ts';
 // Preserve the actual application-schema owner, pool-keyed readiness and
 // session-key migration. Only the pool/DB boundary is instrumented below.
 const readiness=owner.includes('/persistence/')?fs.readFileSync(path.join(source,'src/platform/db/schema-readiness.ts'),'utf8').replace(/^import[^\n]*\n/gm,'')+'\n'+extracted(owner,'ensureAgentSessionKeyTx'):'let schemaReady=null;';
 const policyFile='src/lib/accounts/creation-policy-schema.ts';
 const policySchema=fs.existsSync(path.join(source,policyFile))?extracted(policyFile,'applyAccountCreationPolicySchema'):'';
 const code=extracted('src/lib/schema-initialization.ts','withSchemaInitialization')+'\n'+extracted('src/lib/billing/schema.ts','applyBillingSchema')+'\n'+readiness+'\n'+policySchema+'\n'+extracted(owner,'ensureSchema')+'\nexports.run=ensureSchema;';const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const context={exports:{},process:{env:{}},getPool:()=>facade,markBillingSchemaReady:p=>{assert.equal(p,facade);ready++;}};vm.runInNewContext(js,context);
 try{
  if(baseline){await assert.rejects(context.exports.run(),e=>/timeout|connection/i.test(e.message));assert.equal(poolQueries,1);assert.equal(ready,0);assert(trace.some(x=>x.sql==='ROLLBACK'));assert.equal(releases,1);checks+=4;}
  else{await Promise.all(Array.from({length:8},()=>context.exports.run()));assert.equal(connects,1);assert.equal(poolQueries,0);assert.equal(ready,1);assert.equal(releases,1);assert.equal(new Set(trace.map(x=>x.pid)).size,1);assert(trace.some(x=>x.sql.startsWith('SELECT column_name')));assert.equal(trace.at(-1).sql,'COMMIT');const before=trace.length;await context.exports.run();assert.equal(trace.length,before);checks+=8;
   if(legacy){const rows=(await admin.query(`SELECT id,email,name,is_active,enabled,protocol,base_url_enc,api_key_enc,models,default_model,updated_at FROM ${schema}.app_user_image_providers`)).rows;assert.equal(rows.length,1);const r=rows[0];assert.match(r.id,/^prov-/);assert.equal(r.email,'fixture@example.test');assert.equal(r.name,'默认供应商');assert.equal(r.is_active,false);assert.equal(r.enabled,false);assert.equal(r.base_url_enc,'base-ciphertext');assert.equal(r.api_key_enc,'key-ciphertext');assert.deepEqual(r.models,['model-a']);assert.equal(r.default_model,'model-a');assert.equal(r.updated_at.toISOString(),'2026-10-01T00:00:00.000Z');const pk=(await admin.query(`SELECT column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.table_schema=kcu.table_schema WHERE tc.table_schema=$1 AND tc.table_name='app_user_image_providers' AND tc.constraint_type='PRIMARY KEY'`,[schema])).rows;assert.equal(pk[0].column_name,'id');checks+=12;}
  }
  evidence.push({legacy,connects,poolQueries,ready,releases,maxPool:pool.options.max,trace});
 }finally{await pool.end();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
}
(async()=>{
 try{
  cid=docker(['run','-d','--name',name,'--label',label,'--memory','256m','--cpus','1','-e','POSTGRES_PASSWORD=fixture-only-password','-e','POSTGRES_DB=schema_fixture','-p','127.0.0.1::5432','postgres:16-alpine']);
  const row=JSON.parse(docker(['inspect',cid]))[0],port=row.NetworkSettings.Ports['5432/tcp'][0].HostPort,url='postgresql://postgres:fixture-only-password@127.0.0.1:'+port+'/schema_fixture';let ready=false;
  for(let i=0;i<60;i++){const p=new Pool({connectionString:url,connectionTimeoutMillis:500,max:1});try{await p.query('SELECT 1');ready=true;break;}catch{}finally{await p.end();}await new Promise(r=>setTimeout(r,100));}assert(ready,'TARGET_DB_TCP_NOT_READY');
  await exercise(url,false);if(!baseline)await exercise(url,true);
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({baseline,checks,realPostgres:true,source,evidence},null,2));console.log(`SCHEMA_BOOTSTRAP_CLIENT=${baseline?'REPRODUCED':'PASS'} CHECKS=${checks} PG=REAL POOL_MAX=1 SECOND_CHECKOUT=${baseline?1:0} SUPPLIER_CALLS=0`);
 }finally{if(cid){const r=JSON.parse(docker(['inspect',cid]))[0];assert.equal(r.Id,cid);assert.equal(r.Config.Labels['io.naumi.schema-client'],name);docker(['rm','-f','-v',cid]);console.log('OWNED_FIXTURE_REMOVED=1');}}
})().catch(e=>{console.error(e);process.exitCode=1});
