/** Actual entry-function ASTs and actual fixture policy; finite first-I/O barriers.
 * No Pool, product-pool import, SQL statement or network operation reaches a host. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
assert.ok(args.every(a=>['--baseline=','--source-root=','--output-dir='].some(p=>a.startsWith(p))||a==='--expect-baseline'));
for(const a of args)if(a.includes('='))assert.ok(a.slice(a.indexOf('=')+1));
const arg=n=>args.find(a=>a.startsWith(n+'='))?.slice(n.length+1),baseline=arg('--baseline'),sourceRoot=arg('--source-root')?path.resolve(arg('--source-root')):undefined;
assert.ok(!(baseline&&sourceRoot));if(baseline)assert.match(baseline,/^[a-f0-9]{40}$/);assert.ok(!sourceRoot||sourceRoot!==ROOT);assert.ok(!args.includes('--expect-baseline')||sourceRoot);
const expectBaseline=Boolean(baseline||args.includes('--expect-baseline')),OUT=path.resolve(arg('--output-dir')||path.join(ROOT,'output/fleet-business-fixture-entry-20261105/tests'));
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSHA256={},sourceOrigins={};
/** Read and fingerprint the requested verifier source from Git, an independent copy or the working tree. */
async function source(file){const origin=sourceRoot?path.join(sourceRoot,file):path.join(ROOT,file);const b=baseline?execFileSync('git',['show',baseline+':'+file],{cwd:ROOT}):await readFile(origin);sourceSHA256[file]=hash(b);sourceOrigins[file]=baseline?'git:'+baseline+':'+file:origin;return b.toString('utf8');}
const policy='scripts/lib/fleet-business-fixture-url.ts';let policyText;
const entries=[['protocol','scripts/verify-fleet-business-protocol.ts','main','fleet_protocol_fixture'],['receipt-worker','scripts/verify-fleet-business-queue-compat.ts','worker','fleet_receipt_compat_'+'a'.repeat(32)],['business-worker','scripts/verify-fleet-business-worker.ts','main','fleet_source_47_20261104'],['queue','scripts/verify-fleet-business-queue-compat.ts','verifyFleetBusinessQueueCompatibility','fleet_protocol_fixture'],['control','scripts/verify-fleet-business-control-priority.ts','verifyFleetBusinessControlPriority','fleet_protocol_fixture']];
const compiled=[];
for(const [kind,file,name,database]of entries){
  const text=await source(file),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),node=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,'actual entry '+name);
  const usesPolicy=tree.statements.some(n=>ts.isImportDeclaration(n)&&n.moduleSpecifier.text==='./lib/fleet-business-fixture-url');
  if(usesPolicy&&policyText===undefined)policyText=await source(policy);
  const code=ts.transpileModule((usesPolicy?policyText+'\n':'')+node.getText(tree)+'\nglobalThis.actualEntry='+name+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  compiled.push({kind,file,database,code});
}
const require=createRequire(import.meta.url),{Client}=require('pg'),checks=[],cases=[],check=(v,name)=>checks.push({name,passed:Boolean(v)}),BOUNDARY='FINITE_FIRST_IO_BOUNDARY';
const prefix='postgresql://postgres:fixture-only@127.0.0.1:65298/',receipt=prefix+'fleet_receipt_compat_'+'a'.repeat(32);
/** Run an extracted verifier entry in a finite VM and return all attempted pool, SQL, product-import and network boundary observations. */
async function execute(entry,config={}){
  const url=config.url??prefix+entry.database,env={NAUMI_VERIFY_ISOLATED_DB:'1',DATABASE_URL:url,...config.env};
  if(config.flag!==undefined)env.NAUMI_VERIFY_ISOLATED_DB=config.flag;
  const state={poolConstructions:0,sqlCalls:0,productImports:0,ddlAttempts:0,network:0,events:[]};
  const stop=()=>{throw Error(BOUNDARY);};
  const finitePool=connectionString=>({options:{connectionString},
    /** Record the first attempted SQL and any schema-reset intent, then stop at the finite I/O boundary without executing it. */
    async query(sql){state.sqlCalls++;if(/DROP SCHEMA|CREATE DATABASE|DROP DATABASE/i.test(sql))state.ddlAttempts++;state.events.push('sql:'+String(sql).slice(0,40));stop();},async end(){}});
  class Pool{constructor(options){state.poolConstructions++;state.events.push('pool');const p=new Client(options).connectionParameters;state.resolved={host:p.host,port:p.port,database:p.database};return finitePool(options.connectionString);}}
  const central=finitePool(config.centralUrl??url),sourcePool=finitePool(config.sourceUrl??receipt);
  const context=vm.createContext({exports:{},assert,URL,Error,process:{env},Pool,randomUUID,fetch:()=>{state.network++;throw Error('UNEXPECTED_NETWORK');},
    /** Supply a finite worker stdin envelope with the configured or database-derived mode without reading a real file descriptor. */
    readFileSync:()=>JSON.stringify({mode:config.mode??(url.includes('fleet_central_103_20261104')?'poll':'tick'),options:{},actor:'fixture',requestId:'fixture'}),
    /** Allow only the protocol pool-cleanup stub and record/stop every other application import at the first-I/O boundary. */
    require:module=>{if(module==='../src/platform/db/pool'&&entry.kind==='protocol')return{closeDatabasePools:async()=>{}};state.productImports++;state.events.push('product-import:'+module);stop();},console:{log(){},error(){}},});
  vm.runInContext(entry.code,context,{timeout:3000});let error;
  try{await context.actualEntry(...(entry.kind==='queue'?[central,{}]:entry.kind==='control'?[{central,source:sourcePool,origin:'http://127.0.0.1:65432',tick(){stop();},dropAck(){},withheldAck(){return null;}}]:[]));}catch(e){error={name:e.name,message:e.message};}
  return{...state,error};
}
const variants=[['host-query',u=>u+'?host=other-server&port=5432'],['encoded-host',u=>u+'?%68ost=other-server'],['duplicate-port',u=>u+'?port=65298&port=5432'],['empty-query-value',u=>u+'?host='],['nonrouting-query',u=>u+'?application_name=fixture'],['fragment',u=>u+'#fixture'],['wrong-port',u=>u.replace(':65298',':5432')],['missing-port',u=>u.replace(':65298','')],['wrong-host',u=>u.replace('127.0.0.1','other-server')],['wrong-protocol',u=>u.replace('postgresql:','https:')],['wrong-database',u=>u.replace(/\/[^/]+$/,'/postgres')]];
/** Require an explicit fixture guard error and prove it occurred before any pool, SQL, application import or network attempt. */
function rejected(result,label){const guard=result.error&&(result.error.name==='AssertionError'||/^(ISOLATED_FIXTURE_REQUIRED|NAMED_FIXTURE_REQUIRED|SOURCE_FIXTURE_REQUIRED|CENTRAL_FIXTURE_REQUIRED|UNKNOWN_MODE|FLEET_FIXTURE_)/.test(result.error.message));check(guard,label+': explicit pre-I/O rejection');check(result.poolConstructions+result.sqlCalls+result.productImports+result.network===0,label+': zero Pool/SQL/product import/network');}
for(const entry of compiled){
  const base=prefix+entry.database;
  for(const [name,change]of variants){const result=await execute(entry,{url:change(base)});rejected(result,entry.kind+'/'+name);cases.push({entry:entry.kind,case:name,...result});}
  const flag=await execute(entry,{flag:'0'});rejected(flag,entry.kind+'/missing-isolation');cases.push({entry:entry.kind,case:'missing-isolation',...flag});
  const good=await execute(entry);check(good.error?.message===BOUNDARY,entry.kind+': valid URL reaches finite first-I/O barrier');check(good.poolConstructions+good.sqlCalls+good.productImports>0&&good.network===0,entry.kind+': positive is not a blanket denial');cases.push({entry:entry.kind,case:'valid',...good});
  const alternate=await execute(entry,{url:base.replace('postgresql:','postgres:')});check(alternate.error?.message===BOUNDARY,entry.kind+': postgres protocol remains valid');
}
for(const kind of ['queue','control']){
  const entry=compiled.find(e=>e.kind===kind);
  for(const centralUrl of [prefix+'fleet_protocol_fixture?host=other-server',prefix+'fleet_central_103_20261104',prefix.replace('fixture-only','different-fixture-only')+'fleet_protocol_fixture']){
    const result=await execute(entry,{centralUrl});rejected(result,kind+'/actual-pool-binding');cases.push({entry:kind,case:'actual-pool-binding',...result});
  }
}
for(const sourceUrl of [receipt+'?host=other-server',prefix+'fleet_protocol_fixture']){const result=await execute(compiled.find(e=>e.kind==='control'),{sourceUrl});rejected(result,'control/actual-source-pool');cases.push({entry:'control',case:'actual-source-pool',...result});}
const worker=compiled.find(e=>e.kind==='business-worker'),centralPositive=await execute(worker,{url:prefix+'fleet_central_103_20261104'});check(centralPositive.error?.message===BOUNDARY,'worker: both named central/source modes preserved');
for(const config of [{url:prefix+'fleet_central_103_20261104',mode:'tick'},{url:prefix+'fleet_source_47_20261104',mode:'poll'},{mode:'unknown'}]){const result=await execute(worker,config);rejected(result,'worker/mode-database-binding');cases.push({entry:'business-worker',case:'mode-database-binding',mode:config.mode,...result});}
const failures=checks.filter(c=>!c.passed),result=failures.length?(expectBaseline?'REPRODUCED':'FAIL'):'PASS';
const literal=`FLEET_FIXTURE_ENTRY=${result} assertions=${checks.length} failures=${failures.length} ENTRY_BOUNDARIES=5 ACTUAL_FUNCTION_AST=1 REAL_POLICY=1 FINITE_FIRST_IO=1 NETWORK=0`;
const record={result,exitStatus:failures.length?1:0,sourceMode:sourceRoot?'actual-restored-copy':baseline?'git-baseline':'working-tree',sourceRef:baseline||null,sourceSHA256,sourceOrigins,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),checks,cases,literalOutput:literal,layer:'actual entire entry function ASTs and actual imported policy; finite Pool/SQL/product-import barriers, no real PG or network; full real integration recorded separately'};
await mkdir(OUT,{recursive:true});const output=path.join(OUT,sourceRoot?'ROLLBACK_RESULT.json':baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);console.log(literal);if(failures.length)console.log('FAILED='+failures.map(v=>v.name).join('; '));process.exitCode=record.exitStatus;
