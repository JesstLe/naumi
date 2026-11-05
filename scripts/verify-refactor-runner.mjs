/** Orchestrator self-test: real child processes and throwaway git roots. */
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const arg=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1]},root=path.resolve(arg('--source-root')||'.'),baseline=process.argv.includes('--baseline'),out=path.resolve(arg('--out')||'output/refactor-r6a-20261026/runner-self-test');await fs.mkdir(out,{recursive:true});let checks=0,cases=0;const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++};const yaml=createRequire(import.meta.url)('js-yaml');
const oldWorkflow=yaml.load(await fs.readFile(path.join(root,'.github/workflows/docker.yml'),'utf8')),ciFile=path.join(root,'.github/workflows/refactor-regression.yml');
if(baseline){eq(!!oldWorkflow.jobs.regression,false);eq(oldWorkflow.jobs.docker.needs,'resolve');eq(await fs.stat(ciFile).then(()=>true,()=>false),false);eq(await fs.stat(path.join(root,'scripts/verify-refactor.mjs')).then(()=>true,()=>false),false);console.log('REFACTOR_RUNNER=PASS mode=BASELINE cases=1 checks=4 BUILD_REQUIRES_CORE=0 SAME_SOURCE_REPORT=0 SOURCE=STATIC_WORKFLOW');process.exit(0);}
const ci=yaml.load(await fs.readFile(ciFile,'utf8'));
// One full feature-head regression through its PR, not duplicate push + PR builds.
// Main push, reusable release checks and manual execution remain unchanged.
eq(ci.on.push.branches,['main'],'MAIN_PUSH_REGRESSION_REQUIRED');
assert.ok(ci.on.pull_request && ci.on.workflow_call && 'workflow_dispatch' in ci.on);checks++;
eq(ci.on.workflow_call.inputs.source_commit.required,true,'REUSABLE_RELEASE_MUST_KEEP_EXACT_SOURCE');
eq(oldWorkflow.on.push.branches,['main']);
eq(ci.permissions,{contents:'read'});
const receiptSetup=ci.jobs.core.steps.find(s=>s.name==='Prepare receipt fixture database'),coreStep=ci.jobs.core.steps.find(s=>s.name==='Run source-bound core regression');
assert.ok(receiptSetup?.run.includes("CREATE DATABASE canvas_feedback_fixture"));checks++;
eq(receiptSetup.env.DATABASE_URL,coreStep.env.DATABASE_URL,'RECEIPT_DB_SETUP_MUST_USE_SAME_ISOLATED_SERVICE');
const receiptUrl=new URL(coreStep.env.CANVAS_FEEDBACK_TEST_DATABASE);eq(receiptUrl.hostname,'127.0.0.1');eq(receiptUrl.pathname,'/canvas_feedback_fixture');
assert.ok(ci.jobs.core.steps.indexOf(receiptSetup)<ci.jobs.core.steps.indexOf(coreStep));checks++;

eq(ci.jobs.core.if,"github.repository == 'JesstLe/naumi'");
eq(ci.jobs.core.steps.find(s=>s.name==='Run source-bound core regression').run,'node scripts/verify-refactor.mjs --expected-sha "${{ inputs.source_commit || github.sha }}" --out output/refactor-ci --native-sdk-manifest output/refactor-ci-native-sdk/SDK_RESULT.json');
const imageStep=ci.jobs.core.steps.find(s=>s.name==='Build fixed full application for native acceptance'),sdkStep=ci.jobs.core.steps.find(s=>s.name==='Prepare isolated native application SDK');
assert.ok(imageStep&&sdkStep&&ci.jobs.core.steps.indexOf(imageStep)<ci.jobs.core.steps.indexOf(sdkStep)&&ci.jobs.core.steps.indexOf(sdkStep)<ci.jobs.core.steps.indexOf(coreStep));checks++;
eq(imageStep.run,'node scripts/verify-refactor-image.mjs --expected-sha "${{ inputs.source_commit || github.sha }}" --out output/refactor-ci-image');
eq(sdkStep.run,'python -X utf8 scripts/verify-native-application.py prepare --image-manifest output/refactor-ci-image/BUILD_RESULT.json --out output/refactor-ci-native-sdk');
eq(ci.jobs.core.steps.find(s=>s.uses==='actions/upload-artifact@v4').with.name,'refactor-core-${{ inputs.source_commit || github.sha }}');
eq(oldWorkflow.jobs.docker.needs,['resolve','regression']);eq(oldWorkflow.jobs.regression.uses,'./.github/workflows/refactor-regression.yml');eq(oldWorkflow.jobs.regression.with.source_commit,'${{ needs.resolve.outputs.sha }}');eq(ci.jobs.core.steps[0].with.ref,'${{ inputs.source_commit || github.sha }}');eq(ci.jobs.core.steps[0].with['fetch-depth'],0,'HISTORICAL_ORIGINAL_COMPARISONS_REQUIRE_ANCESTOR_OBJECTS');for(const type of ['push','pull_request'])for(const p of ['src/**','scripts/**','services/**','.github/workflows/**']){assert.ok(ci.on[type].paths.includes(p));checks++;}assert.ok(ci.jobs.core.steps.some(s=>s.if==='always()'&&s.uses==='actions/upload-artifact@v4'));checks++;cases++;
const {runRefactorVerification,sourceIdentity}=await import(pathToFileURL(path.join(root,'scripts/verification/refactor-runner.mjs')).href),{refactorCases,selectRefactorCases}=await import(pathToFileURL(path.join(root,'scripts/verification/refactor-cases.mjs')).href);eq(new Set(refactorCases.map(c=>c.id)).size,refactorCases.length);for(const c of refactorCases){assert.ok(c.expect);await fs.stat(path.join(root,c.file));checks++;}assert.throws(()=>selectRefactorCases('missing'));checks++;cases++;
// New main-owner cases must keep evidence inside their runner-assigned case
// directory. Distinct-first concurrency is an explicit mode, not an output path.
for(const [id,expect,args] of [
 ['model-management-concurrency','MODEL_MANAGEMENT_CONCURRENCY=PASS',[]],
 ['model-management-distinct','MODEL_MANAGEMENT_DISTINCT_FIRST=PASS',['--distinct-first']],
]){const entry=refactorCases.find(c=>c.id===id);eq(entry.expect,expect);eq(entry.args,args);eq(entry.pg,true);eq(entry.tsx,true);}cases++;
eq(refactorCases.find(c=>c.id==='canvas-text-node-ux-pg').args,['--verify-instruction-history']);
 const assistantSource=await fs.readFile(path.join(root,'scripts/verify-main-sync-assistant-navigation.cjs'),'utf8');
assert.match(assistantSource,/arg\('--out',process\.env\.MAIN_SYNC_ASSISTANT_EVIDENCE\|\|'output\/main-sync-assistant-navigation'\)/);checks++;
const dir=await fs.mkdtemp(path.join(out,'fixture-')),git=(...a)=>execFileSync('git',a,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim();await fs.writeFile(path.join(dir,'.gitignore'),'output/\n');await fs.writeFile(path.join(dir,'ok.mjs'),"console.log('FIXTURE_OK');\n");await fs.writeFile(path.join(dir,'fail.mjs'),"console.log('FIXTURE_FAIL');process.exitCode=7;\n");await fs.writeFile(path.join(dir,'mutate.mjs'),"import fs from'node:fs';fs.writeFileSync('marker.txt','changed');console.log('FIXTURE_OK');\n");await fs.writeFile(path.join(dir,'evidence.mjs'),"import fs from'node:fs';import path from'node:path';const name=process.argv[2],out=process.env[name];if(!out)throw Error('EVIDENCE_ENV_MISSING: '+name);fs.writeFileSync(path.join(out,'EVIDENCE_PORT.json'),JSON.stringify({name,out}));console.log('FIXTURE_OK');\n");git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-m','fixture');const sha=git('rev-parse','HEAD');await fs.mkdir(path.join(dir,'output'));
const spec=(id,file='ok.mjs',pg=false)=>({id,file,pg,group:'fixture',expect:'FIXTURE_OK'}),run=(name,selected,opts={})=>runRefactorVerification({root:dir,out:path.join(dir,'output',name),cases:selected,commandFor:c=>[process.execPath,c.file],expectedSha:sha,scope:'fixture',env:{...process.env,NAUMI_VERIFY_ISOLATED_DB:undefined,DATABASE_URL:undefined},...opts});
try{
 let report=await run('pass',[spec('one')]);eq(report.status,'PARTIAL');eq(report.passed,1);eq(report.cases[0].exit,0);eq(report.completeCore,false);cases++;
 report=await run('failure',[spec('one','fail.mjs'),spec('two')]);eq(report.status,'FAIL');eq(report.cases.map(c=>c.status),['FAIL','NOT_RUN']);eq(report.cases[0].exit,7);assert.ok((await fs.readFile(report.cases[0].log,'utf8')).includes('FIXTURE_FAIL'));checks++;cases++;
 report=await run('marker',[{...spec('one'),expect:'UNSEEN_MARKER'}]);eq(report.status,'FAIL');eq(report.cases[0].exit,0);eq(report.cases[0].marker,false);cases++;
 report=await run('wrong-sha',[spec('one')],{expectedSha:'f'.repeat(40)});eq(report.error,'SOURCE_SHA_MISMATCH');eq(report.notRun,1);cases++;
 report=await run('db',[spec('one','ok.mjs',true)]);eq(report.error,'ISOLATED_FIXTURE_DATABASE_REQUIRED');eq(report.notRun,1);cases++;
 await fs.writeFile(path.join(dir,'local.txt'),'draft');report=await run('dirty',[spec('one')]);eq(report.error,'DIRTY_SOURCE_NOT_ACCEPTED');await fs.unlink(path.join(dir,'local.txt'));cases++;
 report=await run('mutation',[spec('one','mutate.mjs'),spec('two')]);eq(report.error,'SOURCE_CHANGED_DURING_VERIFICATION');eq(report.cases[1].status,'NOT_RUN');await fs.unlink(path.join(dir,'marker.txt'));cases++;
 report=await run('reused',[spec('one')],{resume:path.join(dir,'output/pass/REPORT.json')});eq(report.cases[0].reused,true);eq(report.passed,1);cases++;
 await fs.appendFile(path.join(dir,'output/pass/one.log'),'tampered');report=await run('tampered-log',[spec('one')],{resume:path.join(dir,'output/pass/REPORT.json')});eq(report.cases[0].reused,undefined);eq(report.passed,1);cases++;
 report=await run('spawn-failure',[spec('one')],{commandFor:()=>[path.join(dir,'missing-node'),'ok.mjs']});eq(report.status,'FAIL');eq(report.cases[0].status,'FAIL');cases++;
 const evidencePorts=[];
 for(const [id,name] of [
  ['canvas-text-autosave','CANVAS_TEXT_AUTOSAVE_EVIDENCE'],
  ['canvas-text-node-ux-pg','CANVAS_TEXT_NODE_UX_PG_EVIDENCE'],
  ['main-text-server-owners','MAIN_TEXT_SERVER_EVIDENCE'],
  ['main-sync-boundaries','MAIN_SYNC_BOUNDARY_EVIDENCE'],
  ['main-sync-assistant-navigation','MAIN_SYNC_ASSISTANT_EVIDENCE'],
  ['main-sync-canvas-owners','MAIN_SYNC_CANVAS_EVIDENCE'],
  ['video-capability-upgrade-ui','VIDEO_UPGRADE_UI_OUT'],
  ['collaboration-ui','COLLAB_UI_EVIDENCE'],
  ['model-management-concurrency','MODEL_MANAGEMENT_CONCURRENCY_EVIDENCE'],
  ['model-management-distinct','MODEL_MANAGEMENT_CONCURRENCY_EVIDENCE'],
 ]){
  const runName='evidence-'+id;report=await run(runName,[spec(id,'evidence.mjs')],{commandFor:c=>[process.execPath,c.file,name]});
  eq(report.status,'PARTIAL');eq(report.passed,1);
  const assigned=path.join(dir,'output',runName,id),port=JSON.parse(await fs.readFile(path.join(assigned,'EVIDENCE_PORT.json'),'utf8'));
  eq(port,{name,out:assigned});evidencePorts.push({id,...port,actualChild:true});cases++;
 }
 await fs.writeFile(path.join(out,'MAIN_OWNER_EVIDENCE_PORTS.json'),JSON.stringify(evidencePorts,null,2)+'\n');
 const native={...spec('native'),'nativeCase':'scene'},sdkFile=path.join(dir,'output/sdk.json');
 report=await run('native-sdk-missing',[native]);eq(report.error,'FIXED_NATIVE_SDK_REQUIRED');eq(report.notRun,1);cases++;
 const sdk={status:'PASS',source:await sourceIdentity(dir),sdkImageId:'explicit-fixture-port-not-real-image'};await fs.writeFile(sdkFile,JSON.stringify({...sdk,source:{...sdk.source,commit:'f'.repeat(40)}}));
 report=await run('native-sdk-mismatch',[native],{nativeSdkManifest:sdkFile,commandFor:c=>[process.execPath,c.file,'--out','placeholder']});eq(report.error,'NATIVE_SDK_SOURCE_MISMATCH');eq(report.notRun,1);cases++;
 await fs.writeFile(sdkFile,JSON.stringify(sdk));report=await run('native-sdk-valid',[native],{nativeSdkManifest:sdkFile,commandFor:c=>[process.execPath,c.file,'--out','placeholder']});eq(report.status,'PARTIAL');eq(report.passed,1);eq(report.cases[0].command.at(-1),path.join(dir,'output/native-sdk-valid/native'));assert.ok((await fs.readFile(report.cases[0].log,'utf8')).includes(JSON.stringify(report.cases[0].command)));checks++;cases++;
 await fs.writeFile(sdkFile,JSON.stringify({...sdk,sdkImageId:'changed-explicit-fixture-port'}));report=await run('native-sdk-resume-mismatch',[native],{nativeSdkManifest:sdkFile,commandFor:c=>[process.execPath,c.file,'--out','placeholder'],resume:path.join(dir,'output/native-sdk-valid/REPORT.json')});eq(report.error,'RESUME_SOURCE_MISMATCH');eq(report.notRun,1);cases++;
 eq((await sourceIdentity(dir)).commit,sha);eq(git('status','--porcelain'),'');
 // Preserve the actual npm exit and literal build evidence. These children test
 // the CI shell contract with explicit npm and production-seal ports, not Next.
 const gateway=yaml.load(await fs.readFile(path.join(root,'.github/workflows/image-gateway.yml'),'utf8'));
 const buildStep=gateway.jobs.verify.steps.find(s=>s.name==='Build full application');
 assert.ok(buildStep?.run.includes('if npm run build > output/image-gateway-build/build.log 2>&1; then'));checks++;
 eq(buildStep.shell,'bash');assert.ok(!buildStep['continue-on-error']&&buildStep.run.includes('exit "$status"'));checks++;
 eq(buildStep.env,{NODE_OPTIONS:'--max-old-space-size=4096'},'BUILD_ONLY_HEAP_MATCHES_FIXED_APPLICATION');
 assert.ok(!gateway.jobs.verify.env?.NODE_OPTIONS,'BUILD_HEAP_MUST_NOT_CHANGE_RUNTIME_OR_OTHER_TEST_STEPS');checks++;
 const artifact=gateway.jobs.verify.steps.find(s=>s.uses==='actions/upload-artifact@v4'&&s.if==='always()');
 for(const owned of ['output/image-gateway-build/','output/image-gateway-billing/']){assert.ok(artifact?.with.path.split(/\s+/).includes(owned));checks++;}
 const billingStep=gateway.jobs.verify.steps.find(s=>s.name==='Configurable billing and transactional regressions');
 eq(billingStep.run,'npm run verify:billing-all');eq(billingStep.env.BILLING_VERIFY_EVIDENCE,'output/image-gateway-billing');
 const bash=process.platform==='win32'?'D:/DEV/Git/bin/bash.exe':'bash';
 const fixture='node(){ test "$1" = "scripts/prepare-model-ui-production.mjs" || return 17; test "$3 $4" = "--out output/model-ui-production" || return 18; case "$2" in before-build|seal) ;; *) return 19;; esac; printf "%s\\n" "$2" >> output/production-shell-actions.log; if test "$NAUMI_FIXTURE_PREPARATION_FAIL" = "$2"; then return 11; fi; }\nnpm(){ test "$*" = "run build" || return 9; test "$NODE_OPTIONS" = "--max-old-space-size=4096" || return 13; printf "fixture build 100%%\\n"; printf "fixture detail\\n" >&2; return "$NAUMI_FIXTURE_BUILD_EXIT"; }\n';
 for(const exit of [0,7]){
  await fs.rm(path.join(dir,'output/production-shell-actions.log'),{force:true});
  const child=spawnSync(bash,['-e','-o','pipefail','-c',fixture+buildStep.run],{cwd:dir,env:{...process.env,...buildStep.env,NAUMI_FIXTURE_BUILD_EXIT:String(exit)},encoding:'utf8',windowsHide:true});
  eq(child.status,exit);const literal=await fs.readFile(path.join(dir,'output/image-gateway-build/build.log'),'utf8');
  eq(literal,'fixture build 100%\nfixture detail\n');assert.ok(child.stdout.includes(literal));checks++;
  eq(child.stdout.includes('::error title=Full application build failed::'),exit!==0);
  if(exit){assert.ok(child.stdout.includes('100%25%0Afixture detail'));checks++;}
  eq((await fs.readFile(path.join(dir,'output/image-gateway-build/SOURCE.txt'),'utf8')).trim(),sha);
  eq((await fs.readFile(path.join(dir,'output/production-shell-actions.log'),'utf8')).trim().split('\n'),exit?['before-build']:['before-build','seal'],'seal only a successful original build');
  await fs.writeFile(path.join(out,'BUILD_CONTRACT_'+exit+'.json'),JSON.stringify({fixture:true,command:[bash,'-e','-o','pipefail','-c',buildStep.run],npmFixtureExit:exit,exit:child.status,stdout:child.stdout,stderr:child.stderr,literal},null,2)+'\n');cases++;
 }
 for(const phase of ['before-build','seal']){
  await fs.rm(path.join(dir,'output/production-shell-actions.log'),{force:true});
  await fs.rm(path.join(dir,'output/image-gateway-build/build.log'),{force:true});
  const child=spawnSync(bash,['-e','-o','pipefail','-c',fixture+buildStep.run],{cwd:dir,env:{...process.env,...buildStep.env,NAUMI_FIXTURE_BUILD_EXIT:'0',NAUMI_FIXTURE_PREPARATION_FAIL:phase},encoding:'utf8',windowsHide:true});
  eq(child.status,11,'production '+phase+' failure stays failed');
  eq((await fs.readFile(path.join(dir,'output/production-shell-actions.log'),'utf8')).trim().split('\n'),phase==='seal'?['before-build','seal']:['before-build']);
  eq(await fs.stat(path.join(dir,'output/image-gateway-build/build.log')).then(()=>true,()=>false),phase==='seal','capture failure never invokes npm');
  await fs.writeFile(path.join(out,'BUILD_PREPARATION_FAILURE_'+phase+'.json'),JSON.stringify({fixture:true,phase,command:[bash,'-e','-o','pipefail','-c',buildStep.run],exit:child.status,stdout:child.stdout,stderr:child.stderr},null,2)+'\n');cases++;
 }
 // Actual billing driver + explicit child port: fail fast and retain both raw
 // streams, the original exit and untouched NOT_RUN cases; no PG acceptance.
 await fs.mkdir(path.join(dir,'scripts'),{recursive:true});await fs.mkdir(path.join(dir,'node_modules/tsx/dist'),{recursive:true});
 const billingNames=['baseline','rules','config','wallet','api','image-jobs','tools','async-tasks','entitlements','agent','facts','reconciliation','cost-audit','intents','coverage','canvas-extra','review','performance'];
 for(const name of billingNames)await fs.writeFile(path.join(dir,'scripts/verify-billing-'+name+'.ts'),'// explicit driver fixture\n');
 await fs.writeFile(path.join(dir,'node_modules/tsx/dist/cli.mjs'),`const name=process.argv.at(-1);console.log('BILLING_FIXTURE_STDOUT '+name);console.error('BILLING_FIXTURE_STDERR 100%');if(name.endsWith('api.ts'))process.exitCode=Number(process.env.BILLING_FIXTURE_EXIT||0);`);
 const driver=path.join(dir,'scripts/verify-billing-all.mjs');await fs.copyFile(path.join(root,'scripts/verify-billing-all.mjs'),driver);
 for(const exit of [0,7]){
  const evidence=path.join(dir,'output/billing-driver-'+exit),child=spawnSync(process.execPath,[driver,'--out',evidence],{cwd:dir,env:{...process.env,NAUMI_VERIFY_ISOLATED_DB:'1',DATABASE_URL:'postgres://fixture:fixture@127.0.0.1:1/billing_fixture',GITHUB_ACTIONS:'true',BILLING_FIXTURE_EXIT:String(exit)},encoding:'utf8',windowsHide:true});
  eq(child.status,exit);const report=JSON.parse(await fs.readFile(path.join(evidence,'REPORT.json'),'utf8'));eq(report.cases.map(row=>row.name),billingNames);
  eq([report.passed,report.failed,report.notRun],exit?[4,1,13]:[18,0,0]);eq(report.status,exit?'FAIL':'PASS');
  for(const row of report.cases.filter(row=>row.status!=='NOT_RUN')){
   const stdout=await fs.readFile(row.stdout),stderr=await fs.readFile(row.stderr);eq(row.stdoutSha256,(await import('node:crypto')).createHash('sha256').update(stdout).digest('hex'));eq(row.stderrSha256,(await import('node:crypto')).createHash('sha256').update(stderr).digest('hex'));
  }
  if(exit){eq(report.cases[4].exit,7);assert.ok(child.stdout.includes('::error title=Billing regression failed::')&&child.stdout.includes('100%25'));checks++;}
  await fs.writeFile(path.join(out,'BILLING_DRIVER_CONTRACT_'+exit+'.json'),JSON.stringify({fixture:true,exit:child.status,stdout:child.stdout,stderr:child.stderr,report},null,2)+'\n');cases++;
 }
 const result={status:'PASS',mode:'MODIFIED',cases,checks,actualChildren:true,workflow:'static parsed YAML',pushBranches:ci.on.push.branches,imagePushBranches:oldWorkflow.on.push.branches,remoteExecution:'NOT_PROVEN_BY_THIS_TEST',production:false,external:0};await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(`REFACTOR_RUNNER=PASS mode=MODIFIED cases=${cases} checks=${checks} ACTUAL_CHILDREN=1 FAIL_EXIT=RETAINED SOURCE_DRIFT=DETECTED WRONG_SHA=NO_RUN DIRTY=NO_PASS RESUME=EXACT_LOG WORKFLOW=STATIC FEATURE_TRIGGER=PR MAIN_PUSH=FULL IMAGE_PUSH=MAIN_ONLY NETWORK=0`);
}finally{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(out)+path.sep));await fs.rm(resolved,{recursive:true,force:true});}
