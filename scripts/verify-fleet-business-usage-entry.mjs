/** Actual Next page + entry helper, with finite auth/component boundaries.
 * No Next server, browser, database or network. Baseline reads original Git
 * blobs; restored-copy mode requires the actual restored page on disk. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'output/fleet-business-usage-entry-20261105');
const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11);
const sourceArg=process.argv.find(a=>a.startsWith('--source-root='))?.slice(14);
const sourceRoot=sourceArg?path.resolve(sourceArg):undefined,expectBaseline=Boolean(baseline||process.argv.includes('--expect-baseline'));
assert.ok(process.argv.slice(2).every(a=>a.startsWith('--baseline=')||a.startsWith('--source-root=')||a==='--expect-baseline'));
assert.ok(!(baseline&&sourceRoot));if(baseline)assert.match(baseline,/^[a-zA-Z0-9_./-]+$/);
assert.ok(!process.argv.includes('--expect-baseline')||sourceRoot);assert.ok(!sourceRoot||sourceRoot!==ROOT);
const page='src/app/admin/usage/page.tsx',helper='src/components/admin/business-data/entry.ts';
const fixtureKey='__naumiUsageEntryFixture',hash=b=>createHash('sha256').update(b).digest('hex');
const blobs={},origins={},checks=[],cases=[];const beforeEnv=process.env.FLEET_CONTROL_ENABLED,beforeFixture=globalThis[fixtureKey];
const check=(value,name)=>checks.push({name,passed:Boolean(value)});
async function main(){
  const stub=`const f=()=>globalThis[${JSON.stringify(fixtureKey)}];
export async function requireAdminPage(path){f().auth.push(path);if(!f().allowed)throw new Error('fixture-auth-denied');}
export function UserUsage(){return null;} UserUsage.entryView='local';
export function FleetBusinessDashboard(){return null;} FleetBusinessDashboard.entryView='fleet';`;
  const built=await build({absWorkingDir:ROOT,stdin:{contents:`export {default as AdminUsagePage} from './${page}';`,resolveDir:ROOT,sourcefile:'usage-entry-fixture.ts'},
    bundle:true,write:false,platform:'node',format:'esm',target:'node20',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent',
    plugins:[{name:'actual-page-finite-boundaries',setup(plugin){
      plugin.onResolve({filter:/^@\/(?:lib\/admin-page|components\/admin\/bi\/user-usage|components\/admin\/business-data\/business-dashboard)$/},()=>({path:'finite-entry-io',namespace:'finite-entry'}));
      plugin.onLoad({filter:/.*/,namespace:'finite-entry'},()=>({contents:stub,loader:'js'}));
      plugin.onLoad({filter:/\.[jt]sx?$/},async args=>{
        const relative=path.relative(ROOT,args.path).replaceAll('\\','/');if(![page,helper].includes(relative))return;
        let contents;
        if(baseline){contents=execFileSync('git',['show',baseline+':'+relative],{cwd:ROOT,encoding:'utf8'});origins[relative]='git:'+baseline;}
        else if(sourceRoot){const candidate=path.join(sourceRoot,relative);try{contents=await readFile(candidate,'utf8');origins[relative]=candidate;}catch(error){if(relative===page)throw error;contents=await readFile(args.path,'utf8');origins[relative]=args.path;}}
        else{contents=await readFile(args.path,'utf8');origins[relative]=args.path;}
        blobs[relative]=hash(contents);return{contents,loader:relative.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(args.path)};
      });
    }}]});
  const {AdminUsagePage}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
  check(Object.keys(blobs).length===2,'actual page and actual entry helper loaded');
  const inputs=[
    ['fleet-off-email','0',{email:'account@fixture.test'},'local'],
    ['fleet-default','1',{},'fleet'],
    ['bare-email','1',{email:'account@fixture.test'},'local'],
    ['email-and-remote','1',{email:'account@fixture.test',site:'47105059-0142-4000-8000-000000000047'},'fleet'],
    ['email-and-all','1',{email:'account@fixture.test',site:'all'},'fleet'],
    ['email-and-local-site','1',{email:'account@fixture.test',site:'local'},'fleet'],
    ['email-and-explicit-view','1',{email:'account@fixture.test',view:'ledger'},'fleet'],
    ['explicit-native-owner','1',{email:'account@fixture.test',site:'all',detail:'local'},'local'],
    ['legacy-empty-from','1',{email:'account@fixture.test',from:''},'local'],
    ['legacy-tenant','1',{email:'account@fixture.test',tenantId:'fixture-tenant'},'local'],
    ['explicit-empty-view','1',{email:'account@fixture.test',view:''},'fleet'],
    ['bare-email-array','1',{email:['one@fixture.test','two@fixture.test']},'local'],
  ];
  for(const[name,flag,params,expected]of inputs){
    process.env.FLEET_CONTROL_ENABLED=flag;const state={auth:[],allowed:true};globalThis[fixtureKey]=state;const before=JSON.stringify(params);
    const result=await AdminUsagePage({searchParams:Promise.resolve(params)}),view=result.props.children.type.entryView;
    check(result.type===Symbol.for('react.suspense'),name+': actual Suspense owner retained');
    check(view===expected,name+': expected '+expected+' got '+view);
    check(JSON.stringify(state.auth)==='["/admin/usage"]',name+': actual page still checks admin first');
    check(JSON.stringify(params)===before,name+': URL parameters unchanged');cases.push({name,params,expected,actual:view});
  }
  let paramsRead=false;const denied={auth:[],allowed:false};globalThis[fixtureKey]=denied;
  await assert.rejects(()=>AdminUsagePage({searchParams:{then(){paramsRead=true;throw new Error('params read before auth');}}}),/fixture-auth-denied/);
  check(!paramsRead,'denied admin never reads searchParams or chooses either dashboard');
  const failures=checks.filter(x=>!x.passed),result=failures.length?(expectBaseline?'REPRODUCED':'FAIL'):'PASS',exit=failures.length?1:0;
  const literal=`FLEET_BUSINESS_USAGE_ENTRY=${result} assertions=${checks.length} failures=${failures.length} REAL_PAGE=1 FINITE_AUTH_COMPONENTS=1 PG=0 HTTP=0 NETWORK=0`;
  const record={result,exitStatus:exit,layer:'actual async Next page + actual businessLocalDetail; finite auth/components',sourceMode:sourceRoot?'actual-restored-copy':baseline?'git-baseline':'working-tree',sourceRef:baseline||null,sourceRoot:sourceRoot||null,sourceSHA256:blobs,sourceOrigins:origins,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),checks,cases,literalOutput:literal};
  await mkdir(OUT,{recursive:true});const output=path.join(OUT,sourceRoot?'ROLLBACK_RESULT.json':baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);console.log(literal);if(failures.length)console.log('FAILED='+failures.map(x=>x.name).join('; '));process.exitCode=exit;
}
try{await main();}finally{if(beforeEnv===undefined)delete process.env.FLEET_CONTROL_ENABLED;else process.env.FLEET_CONTROL_ENABLED=beforeEnv;if(beforeFixture===undefined)delete globalThis[fixtureKey];else globalThis[fixtureKey]=beforeFixture;}
