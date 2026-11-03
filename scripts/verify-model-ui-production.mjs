/** Manifest/copy and real minimal HTTP-child tests. Not a Next/PG acceptance. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {sourceIdentity,hash} from './verification/refactor-runner.mjs';
import {captureModelUiProduction,sealModelUiProduction,prepareOwnedModelUiProduction,isModelUiBuildInput} from './verification/model-ui-production-build.mjs';
const arg=name=>{const n=process.argv.indexOf(name);return n<0?undefined:process.argv[n+1];};
const out=path.resolve(arg('--out')||path.join(process.env.MODEL_UI_PRODUCTION_EVIDENCE||'output/model-ui-production-unit','run'));
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const root=path.join(out,'project');await fs.mkdir(root);let checks=0;const records=[];
const put=async(name,text)=>{await fs.mkdir(path.dirname(path.join(root,name)),{recursive:true});await fs.writeFile(path.join(root,name),text);};
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
await put('.gitignore','output/\n.next/\nnode_modules/\n');
await put('package.json','{"name":"model-ui-build-unit","private":true}\n');
await put('next.config.mjs','export default {output:"standalone"};\n');
await put('src/runtime.ts','export const label=process.env.NEXT_PUBLIC_DEMO||"";\n');
await put('public/icon.txt','public original\n');
await put('docs/record.md','# Original\n');
await put('scripts/verify-fixture.mjs','// Original fixture\n');
const desiredPackages=Object.fromEntries(['next','pg'].map(name=>['node_modules/'+name,{version:'1.0.0',resolved:'https://fixture.invalid/'+name,integrity:'sha512-fixture-'+name}]));
const desiredLock={lockfileVersion:3,packages:{'':{name:'model-ui-build-unit'},...desiredPackages,'node_modules/optional-fixture':{version:'1.0.0',optional:true}}};
await put('package-lock.json',JSON.stringify(desiredLock));
await put('node_modules/.package-lock.json',JSON.stringify({lockfileVersion:3,packages:desiredPackages}));
const packageFiles=name=>({['node_modules/'+name+'/package.json']:JSON.stringify({name,version:'1.0.0',main:'index.js'}),['node_modules/'+name+'/index.js']:'module.exports={fixture:true};\n'});
for(const name of ['next','pg'])for(const [file,bytes] of Object.entries(packageFiles(name)))await put(file,bytes);

const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true}).trim();
git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-m','unit source');
const env={NEXT_PUBLIC_DEMO:'visible',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:''};
const metadata=path.join(root,'output/build');await captureModelUiProduction({root,out:metadata,env});
const server=`const http=require('node:http');const server=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({mode:process.env.NODE_ENV,privateValue:process.env.RUNTIME_PRIVATE_FIXTURE,publicValue:process.env.NEXT_PUBLIC_DEMO}));});server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>process.send?.({port:server.address().port}));process.on('SIGTERM',()=>server.close(()=>process.exit(0)));process.on('message',message=>{if(message?.action==='stop')server.close(()=>process.exit(0));});`;
await put('.next/BUILD_ID','unit-build-1\n');
await put('.next/required-server-files.json',JSON.stringify({config:{output:'standalone',distDir:'.next',env:{NEXT_PUBLIC_CONFIG_LABEL:'built-config'}}}));
await put('.next/standalone/server.js',server);
await put('.next/standalone/package.json','{"type":"commonjs"}');
for(const name of ['next','pg'])for(const [file,bytes] of Object.entries(packageFiles(name)))await put('.next/standalone/'+file,bytes);
await put('.next/standalone/.next/BUILD_ID','unit-build-1\n');
await put('.next/standalone/node_modules/fixture-native/data.txt','owned dependency bytes\n');
await put('.next/standalone/admin.html','prefix file');
await put('.next/standalone/admin/billing/page.js','prefix directory child');
await put('.next/static/chunk.js','console.log("unit static");\n');
const runtimeFile=path.join(root,'src/runtime.ts'),originalRuntime=await fs.readFile(runtimeFile);
await fs.writeFile(runtimeFile,Buffer.concat([originalRuntime,Buffer.from('// during-build drift\n')]));
await assert.rejects(sealModelUiProduction({root,out:metadata,env}),/SOURCE_CHANGED_DURING_BUILD/);checks++;await fs.writeFile(runtimeFile,originalRuntime);
for(const file of Object.keys(packageFiles('pg')))await fs.unlink(path.join(root,'.next/standalone',file));
await assert.rejects(sealModelUiProduction({root,out:metadata,env}),/DEPENDENCY_NOT_EMBEDDED/);checks++;
for(const [file,bytes] of Object.entries(packageFiles('pg')))await put('.next/standalone/'+file,bytes);
const sealed=await sealModelUiProduction({root,out:metadata,env});eq(sealed.status,'SEALED');eq(sealed.publicEnvironment.NEXT_PUBLIC_SUPABASE_URL,'');eq(sealed.configEnv.NEXT_PUBLIC_CONFIG_LABEL,'built-config');
const manifest=path.join(metadata,'BUILD.json'),originalManifest=await fs.readFile(manifest),sourceFile=path.join(metadata,'SOURCE.txt'),originalSource=await fs.readFile(sourceFile);
let attempt=0;
async function rejected(name,pattern,options={}){
  const target=path.join(root,'output','reject-'+(++attempt)),source=await sourceIdentity(root);
  await assert.rejects(prepareOwnedModelUiProduction({root,source,target,manifestFile:manifest,env,...options}),pattern);checks++;
  eq(await fs.lstat(target).then(()=>true,()=>false),false,'reject before first copy');records.push({name,rejectedBeforeCopy:true});
}
await rejected('missing sealed metadata',/ENOENT/,{manifestFile:path.join(metadata,'missing.json')});
await fs.writeFile(manifest,JSON.stringify({...sealed,status:'CAPTURED'}));await rejected('unsealed',/NOT_SEALED/);await fs.writeFile(manifest,originalManifest);
await fs.writeFile(sourceFile,'0'.repeat(40)+'\n');await rejected('source commit mismatch',/SOURCE_COMMIT_MISMATCH/);await fs.writeFile(sourceFile,originalSource);
await fs.writeFile(runtimeFile,Buffer.concat([originalRuntime,Buffer.from('// product drift\n')]));await rejected('product input drift',/BUILD_INPUT_CHANGED/);await fs.writeFile(runtimeFile,originalRuntime);
await put('src/new-runtime.ts','export const extra=1;');await rejected('input set drift',/BUILD_INPUT_CHANGED/);await fs.unlink(path.join(root,'src/new-runtime.ts'));
const modeSeal=structuredClone(sealed);modeSeal.buildInputs['src/runtime.ts'].mode^=0o111;await fs.writeFile(manifest,JSON.stringify(modeSeal));await rejected('mode identity drift',/BUILD_INPUT_CHANGED/);await fs.writeFile(manifest,originalManifest);
await rejected('public nonempty mismatch',/PUBLIC_ENV_MISMATCH/,{env:{...env,NEXT_PUBLIC_DEMO:'other'}});
await rejected('Supabase nonempty mismatch',/PUBLIC_ENV_MISMATCH/,{env:{...env,NEXT_PUBLIC_SUPABASE_URL:'https://other.example.test'}});
const asset=path.join(root,'.next/static/chunk.js'),originalAsset=await fs.readFile(asset);await fs.appendFile(asset,'// later asset');await rejected('static artifact mismatch',/BUILD_ARTIFACT_MISMATCH/);await fs.writeFile(asset,originalAsset);
const buildId=path.join(root,'.next/BUILD_ID');await fs.writeFile(buildId,'later-id');await rejected('build ID drift',/BUILD_IDENTITY_CHANGED/);await fs.writeFile(buildId,'unit-build-1\n');
await put('docs/record.md','# Later documentation only\n');await put('scripts/verify-fixture.mjs','// Later assertion fixture\n');
eq(isModelUiBuildInput('src/live.md'),true);eq(isModelUiBuildInput('public/live.md'),true);eq(isModelUiBuildInput('package-lock.json'),true);eq(isModelUiBuildInput('next.config.mjs'),true);eq(isModelUiBuildInput('docs/record.md'),false);
const current=await sourceIdentity(root),target=path.join(root,'output/owned-app'),prepared=await prepareOwnedModelUiProduction({root,source:current,target,manifestFile:manifest,env:{NEXT_PUBLIC_DEMO:'visible'}});
eq(prepared.evidence.ownedCopyExact,true);eq(prepared.evidence.postCopySource,prepared.evidence.currentSource);eq(await fs.readFile(path.join(target,'admin.html'),'utf8'),'prefix file');eq(await fs.readFile(path.join(target,'admin/billing/page.js'),'utf8'),'prefix directory child');eq(prepared.evidence.dependencyMode,'embedded');eq(Object.values(prepared.evidence.dependencies.packages).every(row=>row.location==='embedded'),true);eq(prepared.evidence.buildId,'unit-build-1');eq(prepared.evidence.bridge.testDocumentOnlyChanges.map(r=>r.name),['docs/record.md','scripts/verify-fixture.mjs']);eq(prepared.evidence.bridge.digestChanged,true);eq(prepared.evidence.bridge.sourceDirty,true);
eq(prepared.environment.NEXT_PUBLIC_SUPABASE_URL,'');eq(prepared.environment.NEXT_PUBLIC_CONFIG_LABEL,'built-config');eq('RUNTIME_PRIVATE_FIXTURE' in prepared.environment,false);
const rootServer=await fs.readFile(path.join(root,'.next/standalone/server.js'));await fs.appendFile(path.join(target,'server.js'),'\n// owned copy mutation\n');eq(await fs.readFile(path.join(root,'.next/standalone/server.js')),rootServer,'owned app is not linked to root');
const child=spawn(process.execPath,[prepared.server],{cwd:target,env:{...process.env,...prepared.environment,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:'0',RUNTIME_PRIVATE_FIXTURE:'private-runtime-only'},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
const exited=new Promise(resolve=>child.once('exit',(exit,signal)=>resolve({exit,signal})));let ready;
try{
  ready=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('message',resolve);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('UNIT_CHILD_STARTUP_TIMEOUT')),5000).unref())]);
  const response=await fetch(`http://127.0.0.1:${ready.port}`,{signal:AbortSignal.timeout(3000)});eq(response.status,200);eq(await response.json(),{mode:'production',privateValue:'private-runtime-only',publicValue:'visible'});
}finally{if(child.connected)child.send({action:'stop'});else child.kill('SIGTERM');const done=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(Error('UNIT_CHILD_CLEANUP_TIMEOUT')),5000).unref())]);eq(done,{exit:0,signal:null});}
await assert.rejects(fetch(`http://127.0.0.1:${ready.port}`,{signal:AbortSignal.timeout(500)}));checks++;
eq(await fs.readFile(asset),originalAsset);eq(await fs.readFile(manifest),originalManifest);eq((await sourceIdentity(root)).digest,current.digest,'real child never writes original checkout');
let externalCases=0,boundaryManifest=manifest,boundaryEnv=env;
if(process.platform==='win32'){
  const externalEnv={...env,NAUMI_MODEL_UI_LOCKED_EXTERNAL_DEPS:'1'},externalOut=path.join(root,'output/locked-build');
  await captureModelUiProduction({root,out:externalOut,env:externalEnv});
  for(const name of ['next','pg'])for(const file of Object.keys(packageFiles(name)))await fs.unlink(path.join(root,'.next/standalone',file));
  const externalSeal=await sealModelUiProduction({root,out:externalOut,env:externalEnv});eq(externalSeal.productionDependencies.mode,'locked-external-windows');eq(externalSeal.callerDependencies.installedGraph.missingOptional,['node_modules/optional-fixture']);
  const externalManifest=path.join(externalOut,'BUILD.json'),source=await sourceIdentity(root),newTarget=label=>path.join(root,'output','external-'+label);
  boundaryManifest=externalManifest;boundaryEnv=externalEnv;
  await assert.rejects(prepareOwnedModelUiProduction({root,source,target:newTarget('without-opt-in'),manifestFile:externalManifest,env}),/OPT_IN_CHANGED/);checks++;externalCases++;
  const externalPrepared=await prepareOwnedModelUiProduction({root,source,target:newTarget('exact'),manifestFile:externalManifest,env:externalEnv});eq(externalPrepared.evidence.dependencyMode,'locked-external-windows');eq(externalPrepared.evidence.dependencies.packages.next.entry,externalSeal.callerDependencies.packages.next.entry);externalCases++;
  const installedFile=path.join(root,'node_modules/.package-lock.json'),originalInstalled=await fs.readFile(installedFile);
  for(const mutation of ['nonoptional','version','integrity','extra']){
    const installed=JSON.parse(originalInstalled);if(mutation==='nonoptional')delete installed.packages['node_modules/pg'];
    else if(mutation==='extra')installed.packages['node_modules/foreign']={version:'1.0.0'};
    else installed.packages['node_modules/pg'][mutation]='different';
    await fs.writeFile(installedFile,JSON.stringify(installed));
    await assert.rejects(prepareOwnedModelUiProduction({root,source,target:newTarget(mutation),manifestFile:externalManifest,env:externalEnv}),/INSTALLED_DEPENDENCY_GRAPH_MISMATCH/);checks++;externalCases++;
  }
  await fs.writeFile(installedFile,Buffer.concat([originalInstalled,Buffer.from('\n')]));
  await assert.rejects(prepareOwnedModelUiProduction({root,source,target:newTarget('installed-bytes'),manifestFile:externalManifest,env:externalEnv}),/CALLER_DEPENDENCIES_CHANGED/);checks++;externalCases++;await fs.writeFile(installedFile,originalInstalled);
  const entry=path.join(root,'node_modules/pg/index.js'),originalEntry=await fs.readFile(entry);await fs.appendFile(entry,'// later installed bytes');
  await assert.rejects(prepareOwnedModelUiProduction({root,source,target:newTarget('entry-bytes'),manifestFile:externalManifest,env:externalEnv}),/CALLER_DEPENDENCIES_CHANGED/);checks++;externalCases++;await fs.writeFile(entry,originalEntry);
}else{
  await assert.rejects(captureModelUiProduction({root,out:path.join(root,'output/rejected-platform'),env:{...env,NAUMI_MODEL_UI_LOCKED_EXTERNAL_DEPS:'1'}}),/EXTERNAL_WINDOWS_ONLY/);checks++;externalCases++;
}
const boundaryBefore=await sourceIdentity(root);
await assert.rejects(prepareOwnedModelUiProduction({root,source:boundaryBefore,target:path.join(root,'output/rejected-head-boundary'),manifestFile:boundaryManifest,env:boundaryEnv,onCopyComplete:()=>{git('commit','--allow-empty','-m','unit same-tree HEAD change during copy');}}),/SOURCE_CHANGED_DURING_COPY/);checks++;
const boundaryAfter=await sourceIdentity(root);eq(boundaryAfter.digest,boundaryBefore.digest,'same source bytes do not imply same HEAD');eq(boundaryAfter.commit===boundaryBefore.commit,false,'real unit Git HEAD changed after copy');
const result={status:'PASS',checks,records,externalCases,postCopyHeadBoundary:{before:boundaryBefore.commit,after:boundaryAfter.commit,digestExact:boundaryBefore.digest===boundaryAfter.digest,rejected:true},actualMinimalChild:true,next:false,pg:false,buildExecuted:false,sourceCommit:current.commit,bridge:prepared.evidence.bridge,ownedChildClosed:true,sourceBuildUnchanged:true,readManifestSha256:hash(originalManifest)};
await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(result,null,2)+'\n');
console.log(`MODEL_UI_PRODUCTION=PASS CHECKS=${checks} SEAL_DRIFT=REJECTED SOURCE_COMMIT=EXACT PUBLIC_ENV=EXACT ASSETS=EXACT DEPENDENCIES=GUARDED OWNED_COPY=1 PRIVATE_RUNTIME=RETAINED ACTUAL_CHILD_CLOSED=1 NEXT=NOT_RUN PG=NOT_RUN BUILD=NOT_RUN`);
