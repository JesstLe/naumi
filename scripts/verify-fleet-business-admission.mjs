/** Actual common admission function and policy + real operation contracts.
 * Finite pool/transaction only; real PG/HTTP retained-state checks run separately. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11);
const sourceArg=process.argv.find(a=>a.startsWith('--source-root='))?.slice(14);
const outputArg=process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13);
const sourceRoot=sourceArg?path.resolve(sourceArg):undefined,expectBaseline=Boolean(baseline||process.argv.includes('--expect-baseline'));
const OUT=outputArg?path.resolve(outputArg):path.join(ROOT,'output/fleet-business-admission-guard-20261105/tests');
assert.ok(process.argv.slice(2).every(a=>a.startsWith('--baseline=')||a.startsWith('--source-root=')||a.startsWith('--output-dir=')||a==='--expect-baseline'));
assert.ok(!(baseline&&sourceRoot));assert.ok(!process.argv.includes('--expect-baseline')||sourceRoot);assert.ok(!sourceRoot||sourceRoot!==ROOT);
if(baseline)assert.match(baseline,/^[a-zA-Z0-9_./-]+$/);
for(const a of process.argv.slice(2))if(a.includes('='))assert.ok(a.split('=').slice(1).join('='));
const server='src/lib/fleet/server.ts',contracts='src/lib/fleet/contracts.ts';
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceSHA256={},sourceOrigins={};
async function source(file){
  const origin=sourceRoot?path.join(sourceRoot,file):path.join(ROOT,file);
  const text=baseline?execFileSync('git',['show',baseline+':'+file],{cwd:ROOT,encoding:'utf8'}):await readFile(origin,'utf8');
  sourceSHA256[file]=hash(text);sourceOrigins[file]=baseline?'git:'+baseline:origin;return text;
}
const checks=[],cases=[];const check=(value,name)=>checks.push({name,passed:Boolean(value)});
async function main(){
  const text=await source(server),tree=ts.createSourceFile(server,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const declarations=[];
  for(const name of ['FleetError','requireFleetBusinessAdmission','enqueueCommand']){
    const node=tree.statements.find(n=>(ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n))&&n.name?.text===name);
    if(name!=='requireFleetBusinessAdmission')assert.ok(node,'actual '+name+' required');if(node)declarations.push(node.getText(tree));
  }
  const message=tree.statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(tree)==='FLEET_BUSINESS_ADMISSION_HOLD'));
  if(message)declarations.unshift(message.getText(tree));
  const producer=ts.transpileModule(declarations.join('\n')+'\nglobalThis.actualEnqueue=enqueueCommand;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const built=await build({absWorkingDir:ROOT,stdin:{contents:`export {operationSchema,commandCapability,canonical,digest} from './${contracts}';`,resolveDir:ROOT,sourcefile:'admission-real-contract.ts'},bundle:true,write:false,format:'cjs',platform:'node',target:'node20',logLevel:'silent',plugins:[{name:'actual-contract',setup(p){p.onLoad({filter:/contracts\.ts$/},async args=>path.relative(ROOT,args.path).replaceAll('\\','/')===contracts?{contents:await source(contracts),loader:'ts',resolveDir:path.dirname(args.path)}:undefined);}}]});
  const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(createRequire(import.meta.url),module,module.exports);const real=module.exports;
  function harness(existing=null){
    const state={schemaCalls:0,connections:0,writes:0,rows:existing?[structuredClone(existing)]:[],released:0,accessCalls:0};
    const tx={release(){state.released++;},async query(sql,args=[]){
      if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.startsWith('SELECT pg_advisory_xact_lock'))return{rows:[],rowCount:0};
      if(sql.startsWith('SELECT enabled FROM app_fleet_instances'))return{rows:[{enabled:true}],rowCount:1};
      if(sql.startsWith('SELECT fingerprint,state FROM app_fleet_commands')){const r=state.rows.find(r=>r.id===args[0]);return{rows:r?[r]:[],rowCount:r?1:0};}
      if(sql.startsWith('INSERT INTO app_fleet_commands')){state.writes++;state.rows.push({id:args[0],instanceId:args[1],actor:args[2],operation:JSON.parse(args[3]),fingerprint:args[4],requestedByRoot:args[5],state:'queued'});return{rows:[],rowCount:1};}
      if(sql.startsWith('INSERT INTO app_fleet_audit')){state.writes++;return{rows:[],rowCount:1};}
      throw Error('UNEXPECTED_ADMISSION_FIXTURE_QUERY:'+sql);
    }};
    const context=vm.createContext({exports:{},Error,...real,
      process:{env:{FLEET_CONTROL_ENABLED:'1',FLEET_BUSINESS_ENABLED:'1',FLEET_BUSINESS_ADMISSION:'open',PREPARATION_ONLY:'false'}},
      ensureFleetSchema:async()=>{state.schemaCalls++;},getPool:()=>({connect:async()=>{state.connections++;return tx;}}),assertInstanceAccess:async()=>{state.accessCalls++;},
    });vm.runInContext(producer,context,{timeout:2000});return{state,enqueue:context.actualEnqueue};
  }
  const instance=randomUUID(),actor='root@fixture.test',business={type:'business.query',view:'usage',days:30,asOf:new Date().toISOString(),page:1,search:''};
  for(const mode of ['root','delegated','existing-id']){
    const id=randomUUID(),existing=mode==='existing-id'?{id,state:'succeeded',fingerprint:real.digest(real.canonical({instanceId:instance,actor,operation:business})),result:{status:'succeeded',data:{fixture:'retained'}}}:null;
    const h=harness(existing),before=real.canonical(h.state.rows);let result,error;
    try{result=await h.enqueue(actor,instance,id,business,{actor,root:mode!=='delegated',legacyCompatibilityReady:true});}catch(e){error={message:e.message,status:e.status};}
    check(error?.status===503&&error?.message==='跨站业务查询仍处于兼容准备阶段',mode+': actual admission is closed regardless authority or attempted flags');
    check(h.state.schemaCalls===0&&h.state.connections===0,mode+': refusal occurs before schema/bootstrap or pool checkout');
    check(h.state.writes===0&&real.canonical(h.state.rows)===before,mode+': no command/audit/result bytes written');
    check(h.state.accessCalls===0,mode+': heartbeat/grant claims cannot replace release admission');
    cases.push({mode,result,error,...h.state});
  }
  for(const operation of [{type:'users.list',search:'',page:1},{type:'users.ban',email:'control@fixture.test',banned:true,expectedBanned:false}]){
    const id=randomUUID(),h=harness();const first=await h.enqueue(actor,instance,id,operation);
    check(first.id===id&&first.state==='queued'&&!first.replayed,operation.type+': actual compatible control remains admitted');
    check(h.state.schemaCalls===1&&h.state.connections===1&&h.state.writes===2&&h.state.released===1,operation.type+': original transaction and audit complete');
    const before=real.canonical(h.state.rows),writes=h.state.writes,again=await h.enqueue(actor,instance,id,operation);
    check(again.replayed&&real.canonical(h.state.rows)===before&&h.state.writes===writes,operation.type+': stable-ID replay remains write-free');
    let conflict;try{await h.enqueue(actor,instance,id,{...operation,...(operation.type==='users.list'?{search:'changed'}:{banned:false,expectedBanned:true})});}catch(e){conflict=e.status;}
    check(conflict===409&&real.canonical(h.state.rows)===before,operation.type+': conflicting reuse remains rejected');cases.push({mode:operation.type,...h.state});
  }
  const failures=checks.filter(c=>!c.passed),result=failures.length?(expectBaseline?'REPRODUCED':'FAIL'):'PASS',exit=failures.length?1:0;
  const literal=`FLEET_BUSINESS_ADMISSION=${result} assertions=${checks.length} failures=${failures.length} ACTUAL_COMMON_BOUNDARY=1 REAL_CONTRACT=1 FINITE_DB=1 PG=0 HTTP=0 NETWORK=0`;
  const record={result,exitStatus:exit,sourceMode:sourceRoot?'actual-restored-copy':baseline?'git-baseline':'working-tree',sourceRef:baseline||null,sourceRoot:sourceRoot||null,sourceSHA256,sourceOrigins,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),layer:'actual common admission/policy + real contracts; finite database; no production activation or real PG/HTTP',checks,cases,literalOutput:literal};
  await mkdir(OUT,{recursive:true});const p=path.join(OUT,sourceRoot?'ROLLBACK_RESULT.json':baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');await writeFile(p,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(p,'utf8')).literalOutput,literal);console.log(literal);if(failures.length)console.log('FAILED='+failures.map(c=>c.name).join('; '));process.exitCode=exit;
}
await main();
