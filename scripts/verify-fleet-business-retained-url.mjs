/** Execute the actual retained-history helper and real contracts with finite SQL.
 * pg.Client resolves the real connection parameters but never connects to a host. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=name=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1);
assert.ok(args.every(a=>['--baseline=','--source-root=','--output-dir='].some(p=>a.startsWith(p))||a==='--expect-baseline'));
const baseline=arg('--baseline'),sourceRoot=arg('--source-root')?path.resolve(arg('--source-root')):undefined;
const expectBaseline=Boolean(baseline||args.includes('--expect-baseline'));
assert.ok(!(baseline&&sourceRoot));if(baseline)assert.match(baseline,/^[a-f0-9]{40}$/);
assert.ok(!sourceRoot||sourceRoot!==ROOT);assert.ok(!args.includes('--expect-baseline')||sourceRoot);
const OUT=path.resolve(arg('--output-dir')||path.join(ROOT,'output/fleet-business-retained-url-20261105/tests'));
const require=createRequire(import.meta.url),{Client}=require('pg');
const helper='scripts/lib/fleet-business-retained-fixture.ts',sourceSHA256={},sourceOrigins={};
const hash=b=>createHash('sha256').update(b).digest('hex');
async function source(file){
  const origin=sourceRoot?path.join(sourceRoot,file):path.join(ROOT,file);
  const data=baseline?execFileSync('git',['show',baseline+':'+file],{cwd:ROOT}):await readFile(origin);
  sourceSHA256[file]=hash(data);sourceOrigins[file]=baseline?'git:'+baseline+':'+file:origin;return data.toString('utf8');
}
const bundle=await build({absWorkingDir:ROOT,stdin:{contents:`export {seedRetainedFleetBusinessCommand} from './${helper}';`,resolveDir:ROOT,sourcefile:'retained-url-actual-helper.ts'},bundle:true,write:false,format:'cjs',platform:'node',target:'node20',logLevel:'silent',plugins:[{name:'actual-source',setup(p){p.onLoad({filter:/\.tsx?$/},async a=>{
  const rel=path.relative(ROOT,a.path).replaceAll('\\','/');
  if(rel!==helper&&!rel.startsWith('src/'))return;
  return{contents:await source(rel),loader:a.path.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(a.path)};
});}}]});
const mod={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,mod,mod.exports);
const seed=mod.exports.seedRetainedFleetBusinessCommand;
const actor='retained-url@fixture.test',instance='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const operation={type:'business.query',view:'usage',days:30,asOf:new Date().toISOString(),page:1,search:''};
const base='postgresql://postgres:fixture-only@127.0.0.1:65298/fleet_protocol_fixture';
const checks=[],cases=[],check=(v,name)=>checks.push({name,passed:Boolean(v)});
function poolFor(url,physicalDatabase=new URL(url).pathname.slice(1)){
  const cp=new Client({connectionString:url}).connectionParameters;
  const state={connections:0,writes:0,releases:0,events:[],row:null,resolved:{host:cp.host,port:cp.port,database:cp.database}};
  const tx={release(){state.releases++;},async query(sql,params=[]){
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)){state.events.push(sql);return{rows:[],rowCount:0};}
    if(sql==='SELECT current_database() AS database'){state.events.push('physical-database-check');return{rows:[{database:physicalDatabase}],rowCount:1};}
    if(sql.startsWith('INSERT INTO app_fleet_commands')){
      state.events.push('insert-attempt');if(state.row)return{rows:[],rowCount:0};state.writes++;
      state.row={id:params[0],instance_id:params[1],actor:params[2],operation:params[3],fingerprint:params[4],requested_by_root:params[5],state:params[6],result:params[7],created_at:params[8]};return{rows:[{id:params[0]}],rowCount:1};
    }
    if(sql.startsWith('SELECT instance_id,actor,fingerprint,requested_by_root,state FROM app_fleet_commands'))return{rows:state.row?[state.row]:[],rowCount:state.row?1:0};
    throw Error('UNEXPECTED_RETAINED_URL_FIXTURE_SQL');
  }};
  return{state,pool:{options:{connectionString:url},async connect(){state.connections++;return tx;}}};
}
const overrideQueries=['host=other-server','port=5432','host=other-server&port=5432','%68ost=other-server','%70ort=5432',
  'host=127.0.0.1&host=other-server','port=65298&port=5432','host=','port=','host=127.0.0.1','port=65298',
  'host=%2Fvar%2Frun%2Fpostgresql','application_name=fixture&host=other-server','host=other-server&port=5432&application_name=fixture'];
const previous=process.env.NAUMI_VERIFY_ISOLATED_DB;
try{
  process.env.NAUMI_VERIFY_ISOLATED_DB='1';
  const actual=new Client({connectionString:base+'?host=other-server&port=5432'}).connectionParameters;
  check(actual.host==='other-server'&&actual.port===5432,'installed pg resolves routing query parameters beyond URL authority (offline, no connect)');
  for(const query of overrideQueries){
    const h=poolFor(base+'?'+query);let error;
    try{await seed(h.pool,actor,instance,id,operation);}catch(e){error=e.message;}
    check(error==='retained history rejects host or port query overrides','query '+query+': explicit override rejection');
    check(h.state.connections===0&&h.state.events.length===0,'query '+query+': rejected before pool checkout or SQL');
    check(h.state.writes===0&&h.state.row===null,'query '+query+': zero retained-row writes');
    cases.push({mode:'routing-query',query,error,...h.state});
  }
  const allowed=[base,base.replace('postgresql:','postgres:'),base.replace('127.0.0.1','localhost'),base.replace('127.0.0.1','[::1]'),
    base.replace('fleet_protocol_fixture','fleet_central_103_20261104'),base+'?application_name=retained-fixture',base+'?sslmode=disable',
    base+'?application_name=host%3Dother-server%26port%3D5432'];
  for(const [index,url] of allowed.entries()){
    const h=poolFor(url);const result=await seed(h.pool,actor,instance,id,operation);
    check(result.id===id&&result.state==='queued'&&!result.replayed&&result.retainedFixtureOnly,'allowed '+index+': historical seed succeeds');
    check(h.state.connections===1&&h.state.writes===1&&h.state.releases===1,'allowed '+index+': original transaction released');
    check(h.state.events.join(',')==='BEGIN,physical-database-check,insert-attempt,COMMIT','allowed '+index+': physical DB checked before insert');
    cases.push({mode:'allowed',index,...h.state});
  }
  const replay=poolFor(base);await seed(replay.pool,actor,instance,id,operation);const before=JSON.stringify(replay.state.row);
  const repeated=await seed(replay.pool,actor,instance,id,operation);
  check(repeated.replayed&&replay.state.writes===1,'stable retained ID replay remains write-free');
  check(JSON.stringify(replay.state.row)===before,'replay leaves original result, state and timestamps unchanged');
  for(const flag of [undefined,'0']){
    if(flag===undefined)delete process.env.NAUMI_VERIFY_ISOLATED_DB;else process.env.NAUMI_VERIFY_ISOLATED_DB=flag;
    const h=poolFor(base);let rejected=false;try{await seed(h.pool,actor,instance,id,operation);}catch{rejected=true;}
    check(rejected,'isolation flag '+String(flag)+': required');check(h.state.connections===0&&h.state.writes===0,'isolation flag '+String(flag)+': zero checkout/write');
  }
  process.env.NAUMI_VERIFY_ISOLATED_DB='1';
  for(const [name,url] of [['host',base.replace('127.0.0.1','other-server')],['port',base.replace(':65298',':5432')],['database',base.replace('fleet_protocol_fixture','fleet_source_47_20261104')],['protocol',base.replace('postgresql:','https:')]]){
    const h=poolFor(url);let rejected=false;try{await seed(h.pool,actor,instance,id,operation);}catch{rejected=true;}
    check(rejected,'authority '+name+': existing guard rejects');check(h.state.connections===0&&h.state.writes===0,'authority '+name+': zero checkout/write');
  }
  const mismatch=poolFor(base,'fleet_source_47_20261104');let mismatchError;
  try{await seed(mismatch.pool,actor,instance,id,operation);}catch(e){mismatchError=e.message;}
  check(mismatchError?.includes('physical fixture database binding'),'physical database mismatch remains rejected');
  check(mismatch.state.writes===0&&mismatch.state.releases===1&&mismatch.state.events.at(-1)==='ROLLBACK','physical mismatch rolls back and releases before insert');
  const mutation=poolFor(base);let denied=false;try{await seed(mutation.pool,actor,instance,id,{type:'users.list',search:'',page:1});}catch{denied=true;}
  check(denied&&mutation.state.connections===0&&mutation.state.writes===0,'non-business operation still rejected before checkout');
}finally{if(previous===undefined)delete process.env.NAUMI_VERIFY_ISOLATED_DB;else process.env.NAUMI_VERIFY_ISOLATED_DB=previous;}
const failures=checks.filter(c=>!c.passed),result=failures.length?(expectBaseline?'REPRODUCED':'FAIL'):'PASS';
const literal=`FLEET_RETAINED_URL=${result} assertions=${checks.length} failures=${failures.length} OVERRIDE_CASES=${overrideQueries.length} ACTUAL_HELPER=1 REAL_CONTRACTS=1 REAL_PG_PARAMETERS=1 FINITE_POOL=1 NETWORK=0`;
const packageVersion=name=>readFile(path.join(path.dirname(require.resolve(name)),'package.json'),'utf8').then(JSON.parse).then(p=>p.version);
const pgVersion=JSON.parse(await readFile(path.join(ROOT,'node_modules/pg/package.json'),'utf8')).version;
const record={result,exitStatus:failures.length?1:0,sourceMode:sourceRoot?'actual-restored-copy':baseline?'git-baseline':'working-tree',sourceRef:baseline||null,sourceSHA256,sourceOrigins,
  scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),pgVersion,parserVersion:await packageVersion('pg-connection-string'),checks,cases,literalOutput:literal,
  layer:'actual complete helper and real imported contracts; installed pg.Client parameter parsing only; finite pool/SQL, no sockets, real PG or production calls'};
await mkdir(OUT,{recursive:true});const output=path.join(OUT,sourceRoot?'ROLLBACK_RESULT.json':baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');
await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);console.log(literal);
if(failures.length)console.log('FAILED='+failures.map(c=>c.name).join('; '));process.exitCode=record.exitStatus;
