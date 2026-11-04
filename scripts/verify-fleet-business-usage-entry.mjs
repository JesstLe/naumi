/** Actual Next center/usage pages + entry helper, with finite auth/components.
 * No Next server, browser, database or network. Baseline reads original Git
 * blobs; restored-copy mode requires every tested source file on disk. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11);
const sourceArg=process.argv.find(a=>a.startsWith('--source-root='))?.slice(14);
const outputArg=process.argv.find(a=>a.startsWith('--output-dir='))?.slice(13);
const OUT=outputArg?path.resolve(outputArg):path.join(ROOT,'output/fleet-business-usage-entry-20261105');
const sourceRoot=sourceArg?path.resolve(sourceArg):undefined,expectBaseline=Boolean(baseline||process.argv.includes('--expect-baseline'));
assert.ok(process.argv.slice(2).every(a=>a.startsWith('--baseline=')||a.startsWith('--source-root=')||a.startsWith('--output-dir=')||a==='--expect-baseline'));
assert.ok(!(baseline&&sourceRoot));if(baseline)assert.match(baseline,/^[a-zA-Z0-9_./-]+$/);
assert.ok(!process.argv.includes('--expect-baseline')||sourceRoot);assert.ok(!sourceRoot||sourceRoot!==ROOT);
const page='src/app/admin/usage/page.tsx',center='src/app/admin/center/page.tsx',helper='src/components/admin/business-data/entry.ts',model='src/components/admin/business-data/model.ts',contracts='src/lib/bi/contracts.ts';
const fixtureKey='__naumiUsageEntryFixture',hash=b=>createHash('sha256').update(b).digest('hex');
const blobs={},origins={},checks=[],cases=[];const beforeEnv=process.env.FLEET_CONTROL_ENABLED,beforeFixture=globalThis[fixtureKey];
const check=(value,name)=>checks.push({name,passed:Boolean(value)});
async function main(){
  const stub=`const f=()=>globalThis[${JSON.stringify(fixtureKey)}];
export async function requireAdminPage(path){f().auth.push(path);if(!f().allowed)throw new Error('fixture-auth-denied');}
export function UserUsage(){return null;} UserUsage.entryView='local';
export function FleetBusinessDashboard(){return null;} FleetBusinessDashboard.entryView='fleet';
export function AdminCenterShell(){return null;} AdminCenterShell.entryView='shell';
export function PlatformConsole(){return null;} PlatformConsole.entryView='platform';
export function BiDashboard(){return null;} BiDashboard.entryView='bi';`;
  const built=await build({absWorkingDir:ROOT,stdin:{contents:`export {default as AdminUsagePage} from './${page}';export {default as AdminCenterPage} from './${center}';export {businessNavigation,businessFilter} from './${model}';export {businessLocalDetail} from './${helper}';`,resolveDir:ROOT,sourcefile:'usage-entry-fixture.ts'},
    bundle:true,write:false,platform:'node',format:'esm',target:'node20',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent',
    plugins:[{name:'actual-page-finite-boundaries',setup(plugin){
      plugin.onResolve({filter:/^@\/(?:lib\/admin-page|components\/admin\/bi\/(?:user-usage|dashboard)|components\/admin\/business-data\/business-dashboard|components\/admin\/center-shell|components\/saas\/platform-console)$/},()=>({path:'finite-entry-io',namespace:'finite-entry'}));
      plugin.onLoad({filter:/.*/,namespace:'finite-entry'},()=>({contents:stub,loader:'js'}));
      plugin.onLoad({filter:/\.[jt]sx?$/},async args=>{
        const relative=path.relative(ROOT,args.path).replaceAll('\\','/');if(![page,center,helper,model,contracts].includes(relative))return;
        let contents;
        if(baseline){contents=execFileSync('git',['show',baseline+':'+relative],{cwd:ROOT,encoding:'utf8'});origins[relative]='git:'+baseline;}
        else if(sourceRoot){const candidate=path.join(sourceRoot,relative);contents=await readFile(candidate,'utf8');origins[relative]=candidate;}
        else{contents=await readFile(args.path,'utf8');origins[relative]=args.path;}
        blobs[relative]=hash(contents);return{contents,loader:relative.endsWith('.tsx')?'tsx':'ts',resolveDir:path.dirname(args.path)};
      });
    }}]});
  const {AdminUsagePage,AdminCenterPage,businessNavigation,businessFilter,businessLocalDetail}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
  check(Object.keys(blobs).length===5,'actual center/usage pages, entry helper, navigation model and BI sections loaded');
  const owners=node=>!node||typeof node!=='object'?[]:[...(node.type?.entryView?[{owner:node.type.entryView,props:node.props}]:[]),...[node.props?.children].flat().flatMap(owners)];
  const inputs=[
    ['fleet-off-email','0',{email:'account@fixture.test'},'local'],
    ['fleet-default-keeps-native','1',{},'local'],
    ['fleet-default-period-keeps-native','1',{days:'90'},'local'],
    ['explicit-all','1',{site:'all'},'fleet'],
    ['explicit-local','1',{site:'local'},'fleet'],
    ['explicit-remote','1',{site:'47105059-0142-4000-8000-000000000047'},'fleet'],
    ['explicit-default-view','1',{view:'usage'},'fleet'],
    ['explicit-section','1',{section:'usage'},'fleet'],
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
  const centerInputs=[
    ['bare','1',{},'local-overview','overview'],
    ['bare-period','1',{days:'90'},'local-overview','overview'],
    ['invalid-section','1',{section:'invalid'},'local-overview','overview'],
    ['array-section','1',{section:['overview']},'local-overview','overview'],
    ['usage-is-not-BI-section','1',{section:'usage'},'local-overview','overview'],
    ['empty-section','1',{section:''},'local-overview','overview'],
    ...['overview','users','orders','ledger','artworks'].map(section=>['explicit-'+section,'1',{section},'fleet',section]),
    ...['operations','models','calls','conversations','access','management'].map(section=>['native-'+section,'1',{section,site:'all',view:'ledger'},'local-bi',section]),
    ['scope-only','1',{site:'all'},'fleet','overview'],
    ['view-only','1',{view:'ledger'},'fleet','overview'],
    ['local-detail','1',{section:'overview',site:'all',detail:'local'},'local-overview','overview'],
    ['empty-native-filter','1',{section:'overview',site:'all',period:''},'local-overview','overview'],
    ['legacy-email','1',{email:'account@fixture.test'},'local-overview','overview'],
    ['fleet-off','0',{section:'overview',site:'all'},'local-overview','overview'],
  ];
  for(const[name,flag,params,expected,section]of centerInputs){
    process.env.FLEET_CONTROL_ENABLED=flag;globalThis[fixtureKey]={auth:[],allowed:true};const before=JSON.stringify(params);
    const result=await AdminCenterPage({searchParams:Promise.resolve(params)}),nodes=owners(result),fleet=nodes.find(n=>n.owner==='fleet'),bi=nodes.find(n=>n.owner==='bi');
    check(expected==='fleet'?Boolean(fleet):!fleet&&Boolean(bi),'center '+name+': expected '+expected);
    check(expected==='fleet'?fleet?.props.entry===section&&fleet?.props.initialView===({overview:'usage',users:'users',orders:'orders',ledger:'ledger',artworks:'creations'}[section]):bi?.props.initialSection===section,'center '+name+': selected section and initial view retained');
    check(expected==='local-overview'?nodes.some(n=>n.owner==='shell'&&n.props.active==='overview')&&nodes.some(n=>n.owner==='platform'&&n.props.embedded===true)&&bi?.props.embedded===true:!nodes.some(n=>n.owner==='platform'),'center '+name+': complete native overview composition preserved');
    const explicitSection=typeof params.section==='string'&&['overview','users','operations','ledger','artworks','models','calls','conversations','orders','access','management'].includes(params.section);
    const destination=explicitSection||Object.hasOwn(params,'site')||Object.hasOwn(params,'view')?'/admin/center?section='+section:'/admin/center';
    check(JSON.stringify(globalThis[fixtureKey].auth)===JSON.stringify([destination])&&JSON.stringify(params)===before,'center '+name+': native/default auth path and immutable URL retained');
    cases.push({name:'center-'+name,params,expected,owners:nodes.map(n=>n.owner)});
  }
  // Round-trip actual navigation output through the actual Next page. A valid
  // query alone does not prove the server will keep the fleet dashboard owner.
  const email='same+scope@fixture.test',remote='47105059-0142-4000-8000-000000000047';
  const scoped=new URLSearchParams({site:'all',view:'usage',email,keep:'untouched'});
  const navigationInputs=[
    ['period',scoped,{days:90,page:1},'usage'],
    ['next-page',scoped,{page:2},'usage'],
    ['tab',scoped,{view:'ledger',page:1},'usage'],
    ['return-to-default-tab',new URLSearchParams({site:'all',view:'ledger',email}),{view:'usage',page:1},'usage'],
    ['remote-to-all',new URLSearchParams({site:remote,view:'usage',email}),{site:'all'},'usage'],
    ['remote-site',new URLSearchParams({site:remote,email}),{days:7},'usage'],
    ['local-site',new URLSearchParams({site:'local',email}),{page:2},'usage'],
    ['add-account',new URLSearchParams(),{email},'usage'],
    ['default-period',new URLSearchParams({site:'all',email,days:'90'}),{days:30},'usage'],
    ['first-page',new URLSearchParams({site:'all',email,page:'2'}),{page:1},'usage'],
    ...['users','orders','ledger','creations'].map(view=>['entry-'+view,new URLSearchParams({section:view,site:'all',view,email}),{days:7},view]),
  ];
  for(const[name,params,patch,initialView]of navigationInputs){
    const before=params.toString(),url=businessNavigation(params,patch,initialView),after=businessFilter(url,initialView);
    const expected={...businessFilter(params,initialView),...patch};
    check(url.get('site')===expected.site&&url.get('view')===expected.view,name+': explicit site and view scope retained');
    check(after.email===email&&after.site===expected.site&&after.view===expected.view&&after.days===expected.days&&after.page===expected.page,name+': parsed account and patched filters retained');
    check(params.toString()===before&&url.get('keep')===params.get('keep')&&url.get('section')===params.get('section'),name+': input and unrelated parameters preserved');
    const object=Object.fromEntries(url);check(!businessLocalDetail(object,true),name+': scoped URL is not a legacy local-detail link');
    process.env.FLEET_CONTROL_ENABLED='1';globalThis[fixtureKey]={auth:[],allowed:true};
    const result=await AdminUsagePage({searchParams:Promise.resolve(object)}),view=result.props.children.type.entryView;
    check(view==='fleet',name+': actual page reload stays fleet');
    check(JSON.stringify(globalThis[fixtureKey].auth)==='["/admin/usage"]',name+': page reload retains admin check');
    cases.push({name:'navigation-'+name,url:url.toString(),expected:'fleet',actual:view});
  }
  const cleared=businessNavigation(scoped,{email:undefined});
  check(!cleared.has('site')&&cleared.get('view')==='usage'&&!cleared.has('email')&&cleared.get('keep')==='untouched','clearing account keeps an explicit Fleet owner marker');
  const compact=businessNavigation(new URLSearchParams('keep=untouched'),{days:90});
  check(!compact.has('site')&&compact.get('view')==='usage'&&compact.get('days')==='90'&&compact.get('keep')==='untouched','unfiltered navigation keeps Fleet ownership while cleaning other defaults');
  for(const[name,params,patch]of [
    ['period',new URLSearchParams('site=all'),{days:90}],['default-period',new URLSearchParams('site=all&days=90'),{days:30}],
    ['default-tab',new URLSearchParams('view=ledger'),{view:'usage'}],['all-sites',new URLSearchParams({site:remote}),{site:'all'}],
    ['first-page',new URLSearchParams('site=all&page=2'),{page:1}],['clear-account',scoped,{email:undefined}],
    ['search',scoped,{search:'designer',email:undefined}],['usage-section-not-center-anchor',new URLSearchParams('section=usage&site=all'),{days:90}],
  ]){
    const url=businessNavigation(params,patch),object=Object.fromEntries(url);
    check(url.has('site')||url.has('view'),'unscoped '+name+': explicit Fleet marker survives');
    for(const[kind,render]of [['usage',AdminUsagePage],['center',AdminCenterPage]]){
      process.env.FLEET_CONTROL_ENABLED='1';globalThis[fixtureKey]={auth:[],allowed:true};const result=await render({searchParams:Promise.resolve(object)});
      check(owners(result).some(n=>n.owner==='fleet'),'unscoped '+name+': actual '+kind+' reload stays Fleet');
    }
    cases.push({name:'unscoped-'+name,url:url.toString(),expected:'fleet'});
  }
  const legacy={email};check(businessLocalDetail(legacy,true),'legacy bare email retains its local owner without navigation');
  let paramsRead=false;const denied={auth:[],allowed:false};globalThis[fixtureKey]=denied;
  await assert.rejects(()=>AdminUsagePage({searchParams:{then(){paramsRead=true;throw new Error('params read before auth');}}}),/fixture-auth-denied/);
  check(!paramsRead,'denied admin never reads searchParams or chooses either dashboard');
  globalThis[fixtureKey]={auth:[],allowed:false};await assert.rejects(()=>AdminCenterPage({searchParams:Promise.resolve({section:'users'})}),/fixture-auth-denied/);
  check(JSON.stringify(globalThis[fixtureKey].auth)==='["/admin/center?section=users"]','denied center still authenticates selected entry before rendering');
  globalThis[fixtureKey]={auth:[],allowed:false};await assert.rejects(()=>AdminCenterPage({searchParams:Promise.resolve({})}),/fixture-auth-denied/);
  check(JSON.stringify(globalThis[fixtureKey].auth)==='["/admin/center"]','bare center auth destination does not manufacture an explicit Fleet overview');
  const failures=checks.filter(x=>!x.passed),result=failures.length?(expectBaseline?'REPRODUCED':'FAIL'):'PASS',exit=failures.length?1:0;
  const literal=`FLEET_BUSINESS_USAGE_ENTRY=${result} assertions=${checks.length} failures=${failures.length} REAL_PAGE=1 FINITE_AUTH_COMPONENTS=1 PG=0 HTTP=0 NETWORK=0`;
  const record={result,exitStatus:exit,layer:'actual navigation model + both async Next pages + entry helpers/BI sections; finite auth/components; no server or browser',sourceMode:sourceRoot?'actual-restored-copy':baseline?'git-baseline':'working-tree',sourceRef:baseline||null,sourceRoot:sourceRoot||null,sourceSHA256:blobs,sourceOrigins:origins,scriptSHA256:hash(await readFile(fileURLToPath(import.meta.url))),checks,cases,literalOutput:literal};
  await mkdir(OUT,{recursive:true});const output=path.join(OUT,sourceRoot?'ROLLBACK_RESULT.json':baseline?'BASELINE_RESULT.json':'MODIFIED_RESULT.json');await writeFile(output,JSON.stringify(record,null,2)+'\n');assert.equal(JSON.parse(await readFile(output,'utf8')).literalOutput,literal);console.log(literal);if(failures.length)console.log('FAILED='+failures.map(x=>x.name).join('; '));process.exitCode=exit;
}
try{await main();}finally{if(beforeEnv===undefined)delete process.env.FLEET_CONTROL_ENABLED;else process.env.FLEET_CONTROL_ENABLED=beforeEnv;if(beforeFixture===undefined)delete globalThis[fixtureKey];else globalThis[fixtureKey]=beforeFixture;}
