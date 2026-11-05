/** Real PostgreSQL 16 transactions and authenticated loopback HTTP exercise the
 * actual connectorExchange and command/ACK contracts. Only app-schema bootstrap
 * and rate limiting are finite boundaries; no production app or source mutation.
 * Each run owns one random database and drops only that database after shutdown. */
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer,request as httpRequest} from 'node:http';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {Pool} from 'pg';
import {build} from 'esbuild';
import ts from 'typescript';
import {z} from 'zod';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{
  assert.match(arg,/^--(?:baseline|source-root|output-dir)=.+$/);const index=arg.indexOf('=');return[arg.slice(2,index),arg.slice(index+1)];
}));
if(options.baseline)assert.match(options.baseline,/^[a-f0-9]{40}$/);
assert.ok(!(options.baseline&&options['source-root']));
const sourceRoot=options['source-root']?path.resolve(options['source-root']):null;
assert.ok(!sourceRoot||sourceRoot!==ROOT);
assert.equal(process.env.NAUMI_VERIFY_ISOLATED_DB,'1','explicit isolated fixture flag required before Pool construction');
const adminUrl=new URL(process.env.FLEET_TIMESTAMP_FIXTURE_URL??'postgresql://postgres:fleet_protocol_fixture@127.0.0.1:65298/postgres');
assert.ok(['postgres:','postgresql:'].includes(adminUrl.protocol));
assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.port,'65298');assert.equal(adminUrl.pathname,'/postgres');
assert.ok(!adminUrl.href.includes('?')&&!adminUrl.href.includes('#'),'no connection routing overrides');
const files={server:'src/lib/fleet/server.ts',contracts:'src/lib/fleet/contracts.ts',business:'src/lib/fleet/business-contracts.ts',support:'src/lib/fleet/business-support.ts'};
const hashes={},origins={},checks=[],scenarios=[],errors=[];const now=Date.now();
const hash=value=>createHash('sha256').update(value).digest('hex');
const OUT=path.resolve(options['output-dir']??path.join(ROOT,'output/fleet-business-retained-timestamp-20261105/tests'));

/** Load each actual product source from Git, worktree, or a mandatory independent copy. */
async function source(file){
  if(hashes[file])return options.baseline?execFileSync('git',['show',options.baseline+':'+file],{cwd:ROOT,encoding:'utf8'}):readFile(path.join(sourceRoot??ROOT,file),'utf8');
  const text=options.baseline?execFileSync('git',['show',options.baseline+':'+file],{cwd:ROOT,encoding:'utf8'}):await readFile(path.join(sourceRoot??ROOT,file),'utf8');
  hashes[file]=hash(text);origins[file]=options.baseline?'git:'+options.baseline:path.join(sourceRoot??ROOT,file);return text;
}

/** Extract intact actual declarations, including schema readiness and admission HOLD. */
function declarations(text){
  const tree=ts.createSourceFile(files.server,text,ts.ScriptTarget.Latest,true),names=['FleetError','requireFleetBusinessAdmission','assertInstanceAccess','limitedJson','ensureFleetSchema','createInstance','enqueueCommand','connectorExchange'];
  assert.equal(tree.parseDiagnostics.length,0);
  const result=names.map(name=>{const node=tree.statements.find(node=>(ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node))&&node.name?.text===name);assert.ok(node,name);return node.getText(tree);});
  for(const name of ['ready','FLEET_BUSINESS_ADMISSION_HOLD']){
    const node=tree.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>declaration.name.getText(tree)===name));assert.ok(node,name);result.unshift(node.getText(tree));
  }
  return result.join('\n')+'\nglobalThis.service={FleetError,requireFleetBusinessAdmission,ensureFleetSchema,createInstance,enqueueCommand,connectorExchange};';
}

/** Count fixed assertions without stopping at the first baseline poll failure. */
function check(value,name){checks.push({name,passed:Boolean(value)});}

/** Bind real contracts and actual server declarations to one disposable PostgreSQL Pool. */
async function serviceFor(pool){
  const built=await build({absWorkingDir:ROOT,stdin:{contents:`export {digest,canonical,signCommand,verifyCommand,operationSchema,pollSchema,ackSchema,commandCapability} from './${files.contracts}';export {signFleetBusinessSupport} from './${files.support}';export {FLEET_BUSINESS_QUERY_MAX_AGE_MS} from './${files.business}';`,resolveDir:ROOT,sourcefile:'retained-timestamp-contracts.ts'},bundle:true,write:false,platform:'node',format:'cjs',target:'node20',logLevel:'silent',plugins:[{name:'actual-source-selection',setup(plugin){plugin.onLoad({filter:/\.[jt]s$/},async args=>{const relative=path.relative(ROOT,args.path).replaceAll('\\','/');if(Object.values(files).includes(relative))return{contents:await source(relative),loader:'ts',resolveDir:path.dirname(args.path)};});}}]});
  const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const real=module.exports;
  let poolCalls=0;
  class ClockDate extends Date{static now(){return now;}}
  const context=vm.createContext({exports:{},...real,z,Buffer,URL,Request,Response,Date:ClockDate,randomBytes,randomUUID,timingSafeEqual,
    process:{env:{FLEET_CONTROL_ENABLED:'1',FLEET_ISOLATED_TEST:'1'}},
    getPool:()=>{poolCalls++;return pool;},ensureSchema:async()=>{},rateLimit:async()=>true,clientIp:()=> '127.0.0.1'});
  const code=ts.transpileModule(declarations(await source(files.server)),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInContext(code,context,{timeout:2000});return{service:context.service,real,poolCalls:()=>poolCalls};
}

/** Run only this owned random database; record cleanup even when a regression fails. */
async function main(){
  // Finish mandatory source loading before any database creation or bootstrap.
  for(const file of Object.values(files))await source(file);
  const admin=new Pool({connectionString:adminUrl.toString(),max:1,connectionTimeoutMillis:3000});
  const database='fleet_timestamp_'+randomUUID().replaceAll('-','');assert.match(database,/^fleet_timestamp_[a-f0-9]{32}$/);
  let created=false,pool,server,version,cleanup=false;
  try{
    const binding=(await admin.query("SELECT current_database() database,current_setting('server_version_num')::int version")).rows[0];assert.equal(binding.database,'postgres');assert.ok(binding.version>=160000);version=binding.version;
    await admin.query('CREATE DATABASE '+database);created=true;const url=new URL(adminUrl);url.pathname='/'+database;
    pool=new Pool({connectionString:url.toString(),max:1,connectionTimeoutMillis:3000});assert.equal((await pool.query('SELECT current_database() database')).rows[0].database,database);
    await pool.query('CREATE TABLE app_users(email text PRIMARY KEY,banned boolean NOT NULL DEFAULT false)');
    const{service,real,poolCalls}=await serviceFor(pool);
    const read=(asOf=new Date(now).toISOString())=>({type:'business.query',view:'usage',days:30,asOf,page:1,search:''});
    const zero=read('0000-02-29T00:00:00Z');check(real.operationSchema.safeParse(zero).success,'real Zod contract accepts the year-zero counterexample');
    check((await pool.query("SELECT pg_input_is_valid($1,'timestamp with time zone') valid",[zero.asOf])).rows[0].valid===false,'PostgreSQL rejects that timestamp without throwing in its validity probe');
    const before=poolCalls();let held=false;try{await service.enqueueCommand('root',randomUUID(),randomUUID(),read());}catch(error){held=error instanceof service.FleetError&&error.status===503;}
    check(held&&poolCalls()===before,'public business admission stays closed before pool access');
    check((await pool.query("SELECT to_regclass('app_fleet_commands') name")).rows[0].name===null,'HOLD does not bootstrap command tables');
    await service.ensureFleetSchema();
    server=createServer(async(request,response)=>{
      try{const chunks=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));const input=new Request('http://127.0.0.1:'+server.address().port+request.url,{method:'POST',headers:request.headers,body:Buffer.concat(chunks)});const result=await service.connectorExchange(input,request.url==='/ack');response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(result));}
      catch(error){errors.push({code:error.code??null,status:error.status??null,message:String(error.message)});response.writeHead(error instanceof service.FleetError?error.status:error.name==='ZodError'?400:503,{'content-type':'application/json'});response.end(JSON.stringify({error:'fixture exchange failed',code:error.code??null}));}
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    /** Send genuine HTTP poll/ACK envelopes with fresh nonces and the original bearer token. */
    const exchange=(instance,ack,body={},token=instance.token)=>new Promise((resolve,reject)=>{
      const request=httpRequest({hostname:'127.0.0.1',port:server.address().port,path:ack?'/ack':'/poll',method:'POST',agent:false,headers:{'content-type':'application/json',authorization:'Bearer '+token,'x-naumi-instance':instance.id}},response=>{
        let text='';response.setEncoding('utf8');response.on('data',chunk=>text+=chunk);response.on('end',()=>{try{resolve({status:response.statusCode,body:JSON.parse(text)});}catch(error){reject(error);}});response.on('error',reject);
      });request.on('error',reject);request.setTimeout(10000,()=>request.destroy(new Error('isolated fixture HTTP timeout')));request.end(JSON.stringify({nonce:randomUUID(),timestamp:now,...body}));
    });
    const status=business=>({source:'a'.repeat(40),version:'retained-timestamp-fixture',storage:'s3',nas:'unknown',connector:1,...(business?{business:1}:{})});
    const poll=(instance,business=true)=>exchange(instance,false,{status:status(business)});
    const row=async id=>(await pool.query('SELECT id,operation,fingerprint,state,lease_id,leased_until,result,created_at,finished_at FROM app_fleet_commands WHERE id=$1',[id])).rows[0];
    /** Insert synthetic retained history only after the random database identity has been proven. */
    const seed=async(instance,operation,state='queued',id=randomUUID())=>{
      assert.ok(created&&pool.options.connectionString===url.toString());assert.equal(operation.type,'business.query');
      await pool.query(`INSERT INTO app_fleet_commands(id,instance_id,actor,operation,fingerprint,requested_by_root,state,lease_id,leased_until,created_at)
        VALUES($1,$2,'root',$3,$4,true,$5,$6,$7,$8)`,[id,instance.id,JSON.stringify(operation),real.digest(real.canonical({instanceId:instance.id,actor:'root',operation})),state,state==='leased'?randomUUID():null,state==='leased'?new Date(now+300000):null,new Date(now-600000)]);return id;
    };
    /** Decode a returned signed command with the actual contract and original instance binding. */
    const commandId=(response,instance)=>response.status===200&&response.body.command?real.verifyCommand(response.body.command,instance.token,instance.id,now).id:null;
    const invalid=[['year-zero',zero.asOf],['bad-calendar','2026-02-30T00:00:00Z'],['overflow-year','300000-01-01T00:00:00Z'],['bad-month','2026-13-01T00:00:00Z'],['bad-time','2026-11-05T24:99:00Z'],['garbage','not-a-timestamp'],['empty',''],['null',null],['missing',undefined],['object',{not:'a timestamp'}]];
    for(const[name,asOf]of invalid)for(const state of ['queued','leased'])for(const business of [false,true]){
      const label=name+'/'+state+'/'+business,instance=await service.createInstance('root',label,'enterprise'),operation=read();if(asOf===undefined)delete operation.asOf;else operation.asOf=asOf;
      const invalidId=await seed(instance,operation,state),snapshot=JSON.stringify(await row(invalidId)),controlId=randomUUID(),control={type:'users.ban',email:'target@fixture.test',banned:true,expectedBanned:false};
      await service.enqueueCommand('root',instance.id,controlId,control);const response=await poll(instance,business),controlRow=await row(controlId);
      check(response.status===200,label+': invalid retained timestamp never aborts poll');
      check(commandId(response,instance)===controlId,label+': signed control dispatches before retained history');
      check(controlRow.state==='leased'&&controlRow.lease_id===response.body.leaseId,label+': original control lease is committed');
      check(JSON.stringify(await row(invalidId))===snapshot,label+': invalid retained identity/state/lease/result are untouched');
      check(JSON.stringify(controlRow.operation)===JSON.stringify(control),label+': control operation remains exact');
      scenarios.push({name:label,status:response.status,controlDispatched:controlRow.state==='leased',retainedUnchanged:JSON.stringify(await row(invalidId))===snapshot});
    }
    // PG accepts relative/nonfinite/offset/relaxed spellings that the actual
    // business command schema rejects. They must not become a permanent head
    // in front of an otherwise valid retained business read after controls ACK.
    const future=new Date(now+180000).toISOString();
    const protocolInvalid=[['now','now'],['infinity','infinity'],['tomorrow','tomorrow'],['today','today'],['yesterday','yesterday'],['epoch','epoch'],['negative-infinity','-infinity'],
      ['minute-only',future.slice(0,16)+'Z'],['offset',future.replace(/Z$/,'+00:00')],['lowercase',future.toLowerCase()],['space-separator',future.replace('T',' ')],['leading-space',' '+future],['trailing-space',future+' '],['date-only',future.slice(0,10)],['newline',future+'\n'],['future-date-only',new Date(now+86400000).toISOString().slice(0,10)]];
    for(const[name,asOf]of protocolInvalid)for(const state of ['queued','leased']){
      const label='protocol-'+name+'/'+state,instance=await service.createInstance('root',label,'enterprise'),operation=read(asOf);
      check(!real.operationSchema.safeParse(operation).success,label+': actual business format rejects the PG spelling');
      check((await pool.query("SELECT pg_input_is_valid($1,'timestamp with time zone') valid",[asOf])).rows[0].valid===true,label+': spelling is genuinely PostgreSQL-valid');
      const poison=await seed(instance,operation,state),valid=await seed(instance,read()),control=randomUUID();
      await pool.query('UPDATE app_fleet_commands SET created_at=$2 WHERE id=$1',[poison,new Date(now-1200000)]);const snapshot=JSON.stringify(await row(poison));
      await service.enqueueCommand('root',instance.id,control,{type:'users.ban',email:'target@fixture.test',banned:true,expectedBanned:false});
      const first=await poll(instance);check(first.status===200&&commandId(first,instance)===control,label+': control dispatch remains first');
      const ack=await exchange(instance,true,{commandId:control,leaseId:first.body.leaseId??randomUUID(),result:{status:'succeeded',data:{email:'target@fixture.test',banned:true}}});
      check(ack.status===200,label+': original control ACK completes');const next=await poll(instance);
      check(next.status===200,label+': next business-capable poll does not fail signing');
      check(commandId(next,instance)===valid,label+': later valid business read bypasses malformed head');
      check((await row(valid)).state==='leased',label+': valid business lease commits');
      check(JSON.stringify(await row(poison))===snapshot,label+': malformed retained state/identity/lease/result stay intact');
      scenarios.push({name:label,controlStatus:first.status,readStatus:next.status,validDispatched:commandId(next,instance)===valid,retainedUnchanged:JSON.stringify(await row(poison))===snapshot});
    }
    for(const asOf of ['now','infinity']){
      const instance=await service.createInstance('root','legacy-'+asOf,'enterprise'),poison=await seed(instance,read(asOf)),valid=await seed(instance,read()),control=randomUUID(),snapshot=JSON.stringify(await row(poison));
      await service.enqueueCommand('root',instance.id,control,{type:'users.ban',email:'target@fixture.test',banned:true,expectedBanned:false});const first=await poll(instance,false);
      check(first.status===200&&commandId(first,instance)===control,'legacy '+asOf+': control still dispatches');
      check((await exchange(instance,true,{commandId:control,leaseId:first.body.leaseId??randomUUID(),result:{status:'succeeded',data:{email:'target@fixture.test',banned:true}}})).status===200,'legacy '+asOf+': control ACK still completes');
      const next=await poll(instance,false);check(next.status===200&&next.body.command===null&&(await row(valid)).state==='queued','legacy '+asOf+': no business capability is inferred');
      check(JSON.stringify(await row(poison))===snapshot,'legacy '+asOf+': malformed head stays intact');
    }
    const validFormats=[['seconds',future.replace(/\.\d{3}Z$/,'Z')],['fraction-one',future.replace(/\.\d{3}Z$/,'.1Z')],['fraction-nine',future.replace(/\.\d{3}Z$/,'.123456789Z')],['year9999','9999-12-31T23:59:59Z'],['year0001','0001-01-01T00:00:00Z'],['leap2000','2000-02-29T00:00:00Z']];
    for(const[name,asOf]of validFormats){
      check(real.operationSchema.safeParse(read(asOf)).success,'format '+name+': actual business schema accepts the spelling');
      const instance=await service.createInstance('root','format-'+name,'enterprise'),id=await seed(instance,read(asOf)),response=await poll(instance),expected=Date.parse(asOf)>now-real.FLEET_BUSINESS_QUERY_MAX_AGE_MS;
      check(response.status===200,'format '+name+': poll remains available');check((commandId(response,instance)===id)===expected,'format '+name+': original freshness and supported precision retained');
      check((await row(id)).state===(expected?'leased':'queued'),'format '+name+': only fresh valid rows leased');
    }
    for(const[name,asOf,expected]of [['fresh',new Date(now-1000).toISOString(),true],['near-boundary',new Date(now-real.FLEET_BUSINESS_QUERY_MAX_AGE_MS+1).toISOString(),true],['boundary',new Date(now-real.FLEET_BUSINESS_QUERY_MAX_AGE_MS).toISOString(),false],['stale',new Date(now-real.FLEET_BUSINESS_QUERY_MAX_AGE_MS-1).toISOString(),false],['future',new Date(now+5000).toISOString(),true],['valid-ancient-leap','0004-02-29T00:00:00Z',false]]){
      const instance=await service.createInstance('root','valid-'+name,'enterprise'),id=await seed(instance,read(asOf)),response=await poll(instance);
      check(response.status===200,'valid '+name+': poll stays available');check((commandId(response,instance)===id)===expected,'valid '+name+': original strict freshness comparison retained');
      check((await row(id)).state===(expected?'leased':'queued'),'valid '+name+': lease only eligible reads');
    }
    const instance=await service.createInstance('root','control-and-read-FIFO','enterprise'),poison=await seed(instance,zero),poisonBefore=JSON.stringify(await row(poison)),reads=[randomUUID(),randomUUID()].sort(),controls=[randomUUID(),randomUUID()];
    for(const id of reads)await seed(instance,read(), 'queued',id);
    for(const id of controls)await service.enqueueCommand('root',instance.id,id,{type:'users.ban',email:'target@fixture.test',banned:true,expectedBanned:false});
    await pool.query('UPDATE app_fleet_commands SET created_at=$2 WHERE id=$1',[controls[0],new Date(now)]);
    await pool.query('UPDATE app_fleet_commands SET created_at=$2 WHERE id=$1',[controls[1],new Date(now+1000)]);
    const first=await poll(instance),firstRow=await row(controls[0]);check(commandId(first,instance)===controls[0],'controls preserve FIFO ahead of older retained reads');
    const active=await poll(instance);check(active.status===200&&active.body.command===null,'active control lease blocks later controls and reads');
    const success={status:'succeeded',data:{email:'target@fixture.test',banned:true}},ack={commandId:controls[0],leaseId:first.body.leaseId??randomUUID(),result:success};
    check((await exchange(instance,true,{...ack,leaseId:randomUUID()})).status===409,'wrong control ACK lease still rejects');
    check((await exchange(instance,true,ack)).status===200,'matching control ACK still completes');const terminal=JSON.stringify(await row(controls[0]));
    check((await exchange(instance,true,ack)).status===200&&JSON.stringify(await row(controls[0]))===terminal,'duplicate ACK preserves first terminal result');
    check((await exchange(instance,true,{...ack,result:{status:'failed',code:'DENIED'}})).status===409&&JSON.stringify(await row(controls[0]))===terminal,'conflicting terminal ACK still rejects');
    const second=await poll(instance);check(commandId(second,instance)===controls[1],'second control precedes business FIFO');
    await exchange(instance,true,{commandId:controls[1],leaseId:second.body.leaseId??randomUUID(),result:success});
    const readOne=await poll(instance);check(commandId(readOne,instance)===reads[0],'valid reads retain created_at,id tie order');
    await exchange(instance,true,{commandId:reads[0],leaseId:readOne.body.leaseId??randomUUID(),result:{status:'failed',code:'UNAVAILABLE'}});
    check(commandId(await poll(instance),instance)===reads[1],'next valid read follows after original read ACK');
    check(JSON.stringify(await row(poison))===poisonBefore,'control/read ordering never rewrites poisoned retained row');
    check((await exchange(instance,false,{status:status(true)},'B'.repeat(43))).status===401,'bearer authentication remains enforced');
    check(firstRow.operation.type==='users.ban','dispatch fixture never applies a source user mutation');
  }finally{
    if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    if(pool)await pool.end();
    try{if(created){assert.match(database,/^fleet_timestamp_[a-f0-9]{32}$/);await admin.query('DROP DATABASE '+database);cleanup=(await admin.query('SELECT count(*)::int count FROM pg_database WHERE datname=$1',[database])).rows[0].count===0;}}
    finally{await admin.end();}
  }
  check(cleanup,'owned random database removed after HTTP server and pool close');
  const failures=checks.filter(check=>!check.passed),result=failures.length?(options.baseline?'REPRODUCED':'FAIL'):'PASS';
  const literal=`FLEET_RETAINED_TIMESTAMP=${result} assertions=${checks.length} failures=${failures.length} REAL_CONNECTOR=1 PG=1 HTTP=1 FINITE_BOOTSTRAP_RATE_LIMIT=1 DATABASE_DROPPED=${cleanup?1:0}`;
  const record={result,exitStatus:failures.length?1:0,sourceMode:options.baseline?'git-baseline':sourceRoot?'mandatory-copy':'working-tree',sourceSHA256:hashes,sourceOrigins:origins,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),postgresVersion:version,database,databaseDropped:cleanup,layer:'actual extracted connector/schema/control-enqueue/ACK functions and real contracts; authenticated loopback HTTP and actual PG16; finite app bootstrap/rate-limit; no source mutation or production acceptance',checks,scenarios,errors,literalOutput:literal};
  await mkdir(OUT,{recursive:true});const output=path.join(OUT,options.baseline?'BASELINE_RESULT.json':sourceRoot?'ROLLBACK_RESULT.json':'MODIFIED_RESULT.json');await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);
  console.log(literal);if(failures.length)console.log('FAILED='+failures.map(check=>check.name).join('; '));process.exitCode=record.exitStatus;
}
await main();
