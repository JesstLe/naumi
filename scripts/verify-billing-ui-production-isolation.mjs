/** Actual billing runner preparation + real source/build-copy owner, using tiny
 * embedded packages and local HTTP children. This is not Next/PG/browser acceptance. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const arg=name=>{const n=process.argv.indexOf(name);return n<0?undefined:process.argv[n+1];};
const sourceRoot=path.resolve(arg('--source-root')||'.'),out=path.resolve(arg('--out')||path.join(process.env.BILLING_UI_PRODUCTION_ISOLATION_EVIDENCE||'output/billing-ui-production-isolation','run'));
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
let checks=0,stage='source',project,sealed,artifactDrift;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const runnerFile=path.join(sourceRoot,'scripts/verify-billing-ui.mjs'),runnerRaw=await fs.readFile(runnerFile),runnerText=runnerRaw.toString('utf8');
const ast=ts.createSourceFile(runnerFile,runnerText,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const variable=(statement,name)=>ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(d=>ts.isIdentifier(d.name)&&d.name.text===name);
const boundary=ast.statements.findIndex(s=>variable(s,'schema'));assert.ok(boundary>=0,'actual database boundary is present');
const prefixStatements=ast.statements.slice(0,boundary).filter(s=>!ts.isImportDeclaration(s));
const envStatement=ast.statements.find(s=>variable(s,'env')),serverStatement=ast.statements.find(s=>variable(s,'server'));
assert.ok(envStatement&&serverStatement,'actual runtime environment and spawn declarations are present');
const usedPrefix=new Set();for(const statement of prefixStatements){(function walk(n){if(ts.isIdentifier(n))usedPrefix.add(n.text);ts.forEachChild(n,walk);})(statement);}
const imports=[];
for(const statement of ast.statements.filter(ts.isImportDeclaration)){
 const specifier=statement.moduleSpecifier.text;
 if(specifier==='node:child_process')continue; // spawn is an observable process-selection port below.
 if(specifier.startsWith('node:')){imports.push(statement.getText(ast));continue;}
 if(['./verification/refactor-runner.mjs','./verification/model-ui-production-build.mjs'].includes(specifier)){
  const absolute=pathToFileURL(path.resolve(path.dirname(runnerFile),specifier)).href;
  imports.push(statement.getText(ast).replace(statement.moduleSpecifier.getText(ast),JSON.stringify(absolute)));continue;
 }
 const clause=statement.importClause,names=[clause?.name?.text,...(clause?.namedBindings&&ts.isNamedImports(clause.namedBindings)?clause.namedBindings.elements.map(n=>n.name.text):[])].filter(Boolean);
 assert.ok(names.every(name=>!usedPrefix.has(name)),'unhandled actual prefix dependency '+specifier);
}
const prefix=prefixStatements.map(s=>s.getText(ast)).join('\n');
const helperFile=path.join(sourceRoot,'scripts/verification/model-ui-production-build.mjs');
const {captureModelUiProduction,sealModelUiProduction,prepareOwnedModelUiProduction}=await import(pathToFileURL(helperFile));
const {sourceIdentity}=await import(pathToFileURL(path.join(sourceRoot,'scripts/verification/refactor-runner.mjs')));
const sourceHashes={'scripts/verify-billing-ui.mjs':sha(runnerRaw),'scripts/verification/model-ui-production-build.mjs':sha(await fs.readFile(helperFile)),'scripts/verification/refactor-runner.mjs':sha(await fs.readFile(path.join(sourceRoot,'scripts/verification/refactor-runner.mjs')))};
const cleanEnv={...process.env};for(const name of Object.keys(cleanEnv))if(name.startsWith('NEXT_PUBLIC_')||['DESKTOP_UI_BUILD','ENTERPRISE_UI_BUILD','FLEET_UI_BUILD','MEDIA_PRIVATE','BUILD_VERSION','SOURCE_COMMIT','NAUMI_BUILD_CPUS','NAUMI_MODEL_UI_LOCKED_EXTERNAL_DEPS','NAUMI_MODEL_UI_PRODUCTION_MANIFEST','VERIFY_APP_ORIGIN','BILLING_UI_APP_MODE'].includes(name))delete cleanEnv[name];
Object.assign(cleanEnv,{NAUMI_VERIFY_ISOLATED_DB:'1',DATABASE_URL:'postgres://fixture:fixture@127.0.0.1:1/isolation_fixture',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',NEXT_PUBLIC_UNIT_VALUE:'frozen-public'});
const processRuns=[];
async function runPrefix(root,extra={}){
 const file=path.join(root,'output/prefix.mjs'),dump=path.join(root,'output/PREFIX.json');await fs.mkdir(path.dirname(file),{recursive:true});
 const capture=`let __selectedSpawn=null;const spawn=(executable,args,options)=>{if(__selectedSpawn)throw Error('MULTIPLE_SERVER_SELECTIONS');__selectedSpawn={executable,args,environment:Object.fromEntries(Object.entries(options.env||{}).filter(([name])=>name.startsWith('NEXT_PUBLIC_')||['PORT','HOSTNAME','NODE_ENV'].includes(name))),cwd:options.cwd||process.cwd()};return {fixtureProcessSelection:true};};`;
 const script=[...imports,`import {writeFileSync as __write} from 'node:fs';`,capture,prefix,`const schema='unused-no-database',supplier={origin:'http://127.0.0.1:1'};`,envStatement.getText(ast),serverStatement.getText(ast),`__write(${JSON.stringify(dump)},JSON.stringify({production:typeof production==='undefined'?null:production,external:external||null,development,base,selectedSpawn:__selectedSpawn},null,2)+'\\n');`].join('\n');
 await fs.writeFile(file,script);
 const child=spawn(process.execPath,[file],{cwd:root,env:{...cleanEnv,...extra},windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const done=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(exit,signal)=>resolve({exit,signal}));});processRuns.push({kind:'actual-prefix',root,file,exit:done.exit,signal:done.signal,stdout,stderr,prefixSha256:sha(Buffer.from(prefix))});
 if(done.exit!==0)throw Error('ACTUAL_BILLING_PREFIX_FAILED: '+stderr);
 return JSON.parse((await fs.readFile(dump,'utf8')).trim());
}
async function put(root,name,value){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);}
async function rows(folder){const result={};async function visit(relative=''){for(const entry of await fs.readdir(path.join(folder,relative),{withFileTypes:true})){const name=relative?relative+'/'+entry.name:entry.name,file=path.join(folder,name),s=await fs.lstat(file);if(s.isDirectory())await visit(name);else{assert.ok(s.isFile()&&!s.isSymbolicLink());result[name]={type:'file',sha256:sha(await fs.readFile(file)),bytes:s.size,mode:s.mode&0o777};}}}await visit();return result;}
async function artifacts(root){return {standalone:await rows(path.join(root,'.next/standalone')),static:await rows(path.join(root,'.next/static')),public:await rows(path.join(root,'public'))};}
const delta=(before,after)=>Object.fromEntries(Object.keys(before).map(group=>[group,{added:Object.keys(after[group]).filter(n=>!before[group][n]).sort(),removed:Object.keys(before[group]).filter(n=>!after[group][n]).sort(),changed:Object.keys(before[group]).filter(n=>after[group][n]&&JSON.stringify(before[group][n])!==JSON.stringify(after[group][n])).sort()}]));
async function sourceModes(root,source){return Object.fromEntries(await Promise.all(Object.keys(source.hashes).map(async n=>[n,(await fs.stat(path.join(root,n))).mode&0o777])));}
const server=`const http=require('node:http'),fs=require('node:fs'),path=require('node:path');const server=http.createServer((req,res)=>{if(req.url==='/api/health'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({directory:__dirname,publicValue:process.env.NEXT_PUBLIC_UNIT_VALUE}));}const file=req.url==='/_next/static/chunks/unit.js'?'.next/static/chunks/unit.js':req.url==='/icon.txt'?'public/icon.txt':null;if(!file){res.statusCode=404;return res.end('missing');}try{res.end(fs.readFileSync(path.join(__dirname,file)));}catch{res.statusCode=404;res.end('missing');}});server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>process.send?.({port:server.address().port,directory:__dirname}));process.on('message',m=>{if(m?.action==='stop')server.close(()=>process.exit(0));});process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`;
async function minimalProject(){
 const root=path.join(out,'project');await fs.mkdir(root);
 for(const [n,v] of Object.entries({'.gitignore':'output/\n.next/\nnode_modules/\n','package.json':'{"name":"billing-isolation-fixture","private":true}\n','next.config.mjs':'export default {output:"standalone"};\n','src/runtime.ts':'export const value=process.env.NEXT_PUBLIC_UNIT_VALUE;\n','public/icon.txt':'fixture public bytes\n','scripts/verify-fixture.mjs':'// declared fixture source\n'}))await put(root,n,v);
 const packages=Object.fromEntries(['next','pg'].map(name=>['node_modules/'+name,{version:'1.0.0',resolved:'https://fixture.invalid/'+name,integrity:'sha512-fixture-'+name}]));
 await put(root,'package-lock.json',JSON.stringify({lockfileVersion:3,packages:{'':{name:'billing-isolation-fixture'},...packages}}));await put(root,'node_modules/.package-lock.json',JSON.stringify({lockfileVersion:3,packages}));
 for(const base of ['','.next/standalone/'])for(const name of ['next','pg']){await put(root,base+'node_modules/'+name+'/package.json',JSON.stringify({name,version:'1.0.0',main:'index.js'}));await put(root,base+'node_modules/'+name+'/index.js','module.exports={fixture:true};\n');}
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']});git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.test');git('add','.');git('commit','-m','controlled source');
 await captureModelUiProduction({root,env:cleanEnv});
 for(const [n,v] of Object.entries({'.next/BUILD_ID':'billing-isolation-build\n','.next/required-server-files.json':JSON.stringify({config:{output:'standalone',distDir:'.next',env:{}}}),'.next/standalone/.next/BUILD_ID':'billing-isolation-build\n','.next/standalone/server.js':server,'.next/standalone/package.json':'{"type":"commonjs"}\n','.next/static/chunks/unit.js':'fixture static bytes\n'}))await put(root,n,v);
 return {root,sealed:await sealModelUiProduction({root,env:cleanEnv})};
}
async function httpChild(label,selection,directory){
 const executable=selection.executable,args=selection.args;eq(executable,process.execPath,label+' uses actual Node');eq(args.length,1,label+' selects one standalone entry');eq(path.resolve(selection.cwd,args[0]),path.join(directory,'server.js'),label+' selects owned server, not original');
 const child=spawn(executable,args,{cwd:selection.cwd,env:{...cleanEnv,...selection.environment,PORT:'0',HOSTNAME:'127.0.0.1'},windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});let stdout='',stderr='',ready;child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(exit,signal)=>resolve({exit,signal}));});
 try{
  ready=await Promise.race([new Promise(resolve=>child.once('message',resolve)),exited.then(x=>{throw Error('OWNED_CHILD_EARLY_EXIT:'+JSON.stringify(x));}),new Promise((_,reject)=>setTimeout(()=>reject(Error('OWNED_CHILD_STARTUP_TIMEOUT')),5000).unref())]);eq(ready.directory,directory,label+' runs owned directory');
  const origin='http://127.0.0.1:'+ready.port,health=await fetch(origin+'/api/health',{signal:AbortSignal.timeout(3000)});eq(health.status,200);eq(await health.json(),{directory,publicValue:'frozen-public'});
  for(const [url,body] of [['/_next/static/chunks/unit.js','fixture static bytes\n'],['/icon.txt','fixture public bytes\n']]){const response=await fetch(origin+url,{signal:AbortSignal.timeout(3000)});eq(response.status,200,label+' serves '+url);eq(await response.text(),body);}
 }finally{
  if(child.connected)child.send({action:'stop'});else child.kill('SIGTERM');const done=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(Error('OWNED_CHILD_CLEANUP_TIMEOUT')),5000).unref())]);eq(done,{exit:0,signal:null});processRuns.push({kind:'real-minimal-http-child',label,executable,args,cwd:selection.cwd,ready,stdout,stderr,...done});
 }
 await assert.rejects(fetch('http://127.0.0.1:'+ready.port,{signal:AbortSignal.timeout(500)}));checks++;
}
try{
 stage='create-and-seal';({root:project,sealed}=await minimalProject());const sourceBefore=await sourceIdentity(project),modesBefore=await sourceModes(project,sourceBefore),artifactsBefore=await artifacts(project),manifestFile=path.join(project,'output/model-ui-production/BUILD.json'),manifestHash=sha(await fs.readFile(manifestFile));
 stage='actual-billing-prefix';const billing=await runPrefix(project);artifactDrift=delta(artifactsBefore,await artifacts(project));
 stage='business-prepare-after-billing';const business=await prepareOwnedModelUiProduction({root:project,source:await sourceIdentity(project),target:path.join(project,'output/business-owned'),env:cleanEnv});
 eq(await artifacts(project),artifactsBefore,'billing preparation preserves complete sealed artifact tree');eq(sha(await fs.readFile(manifestFile)),manifestHash,'original seal stays byte-exact');eq(await sourceIdentity(project),sourceBefore,'all source hashes unchanged');eq(await sourceModes(project,sourceBefore),modesBefore,'all source modes unchanged');
 assert.ok(billing.production,'actual prefix returns production owner');checks++;eq(billing.production.evidence.dependencyMode,'embedded');eq(billing.production.evidence.ownedCopyExact,true);eq(business.evidence.ownedCopyExact,true);eq(billing.production.directory===business.directory,false,'billing and business have different owners');
 stage='real-owned-http';await httpChild('billing',billing.selectedSpawn,billing.production.directory);await httpChild('business',{executable:process.execPath,args:[business.server],cwd:project,environment:business.environment},business.directory);
 stage='copy-independence-and-guards';const ownedStatic=path.join(billing.production.directory,'.next/static/chunks/unit.js'),otherStatic=path.join(business.directory,'.next/static/chunks/unit.js'),sourceStatic=path.join(project,'.next/static/chunks/unit.js'),originalStatic=await fs.readFile(sourceStatic);await fs.appendFile(ownedStatic,'// owned mutation\n');eq(await fs.readFile(otherStatic),originalStatic,'owned copies do not overwrite siblings');eq(await fs.readFile(sourceStatic),originalStatic,'owned copy has no write-through to root');await fs.writeFile(ownedStatic,originalStatic);
 await fs.appendFile(sourceStatic,'// deliberate controlled root drift\n');const rejectedTarget=path.join(project,'output/reject-root-drift');await assert.rejects(prepareOwnedModelUiProduction({root:project,source:await sourceIdentity(project),target:rejectedTarget,env:cleanEnv}),/MODEL_UI_BUILD_ARTIFACT_MISMATCH/);checks++;eq(await fs.stat(rejectedTarget).then(()=>true,()=>false),false,'guard rejects before copy');await fs.writeFile(sourceStatic,originalStatic);
 stage='external-development';const modes=[];for(const [label,env] of [['external',{VERIFY_APP_ORIGIN:'http://127.0.0.1:1'}],['development',{BILLING_UI_APP_MODE:'development'}]]){const root=path.join(out,label);await fs.mkdir(root);const result=await runPrefix(root,env);eq(result.production,null,label+' does not request sealed production');eq(await fs.stat(path.join(root,'.next')).then(()=>true,()=>false),false,label+' leaves no production tree');if(label==='external')eq(result.selectedSpawn,null,'external starts no server');else eq(result.selectedSpawn.args,['node_modules/next/dist/bin/next','dev','-H','127.0.0.1','-p','31089'],'development keeps original command');modes.push({label,production:result.production,selectedSpawn:result.selectedSpawn});}
 eq(await artifacts(project),artifactsBefore,'final sealed artifact bytes/size/modes exact');eq(await sourceIdentity(project),sourceBefore,'final source exact');eq(await sourceModes(project,sourceBefore),modesBefore,'final source modes exact');
 const report={status:'PASS',checks,sourceRoot,sourceHashes,actualRunnerAst:{prefixUtf16Start:prefixStatements[0].getStart(ast),prefixUtf16End:prefixStatements.at(-1).end,prefixSha256:sha(Buffer.from(prefix)),databaseBoundaryLine:ast.getLineAndCharacterOfPosition(ast.statements[boundary].getStart(ast)).line+1,spawnStatement:serverStatement.getText(ast)},project,buildId:sealed.buildId,sourceBefore,sourceModes:modesBefore,artifactDrift,billing:billing.production.evidence,business:business.evidence,compatibilityModes:modes,processRuns,realHttpChildren:2,originalRootServerStarted:false,sourceBuildUnchanged:true,guardPreserved:true,controlledGuardMutationRestored:true,controlledOwnedMutationRestored:true,scope:{actualBillingPreparation:true,actualSpawnSelection:true,actualProductionOwner:true,database:false,provider:false,next:false,browser:false,realSupplierCalls:0}};
 await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log(`BILLING_UI_PRODUCTION_ISOLATION=PASS CHECKS=${checks} ACTUAL_PREFIX=1 REAL_HTTP_CHILDREN=2 BILLING_ROOT_ARTIFACT_WRITES=0 OWNED_COPIES=2 NEXT=0 PG=0 SUPPLIER=0`);
}catch(error){await fs.writeFile(path.join(out,'FAILURE.json'),JSON.stringify({status:'FAIL',stage,error:String(error),stack:error.stack,sourceRoot,sourceHashes,project,buildId:sealed?.buildId,artifactDrift,processRuns},null,2)+'\n');console.error(error);process.exitCode=1;}
