const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events'),{spawn}=require('node:child_process'),ts=require('typescript'),esbuild=require('esbuild');
const args=process.argv.slice(2),value=n=>{const i=args.indexOf(n);return i<0?undefined:args[i+1]},baseline=args.includes('--baseline');
const root=process.cwd(),source=path.resolve(value('--source-root')||root),out=path.resolve(value('--out')||process.env.NATIVE_FIXTURE_EVIDENCE||'output/native-fixture-lifecycle');
const checks=[],loaded={},normal={},issues={};const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function read(name){const b=await fs.readFile(path.join(source,name));loaded[name]=hash(b);return b.toString('utf8')}
function ast(text){return ts.createSourceFile('fixture.ts',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS)}
function find(node,predicate){if(predicate(node))return node;let result;ts.forEachChild(node,c=>{if(!result)result=find(c,predicate)});return result}
function context(extra={}){const module={exports:{}};return{module,exports:module.exports,require,Buffer,URL,Request,Response,AbortSignal,AbortController,process,setTimeout,clearTimeout,console:{log(){},error(){}},...extra}}
function evaluate(text,extra={}){const c=context(extra),code=esbuild.transformSync(text,{loader:'ts',format:'cjs',target:'node24'}).code;vm.runInNewContext(code,c);return c.module.exports}
function check(name,test){assert.ok(test,name);checks.push(name);console.log('PASS '+name)}
function fakeChild(){const c=new EventEmitter();Object.assign(c,{pid:13579,exitCode:null,signalCode:null,signals:[],kill(signal){this.signals.push(signal);this.exitCode=0;queueMicrotask(()=>this.emit('exit',0,null));return true}});return c}

async function main(){
 await fs.mkdir(out,{recursive:true});
 const scene=await read('scripts/verify-scene-native-interactions.ts'),app=await read('scripts/verify-scene-native-application.ts'),harness=await read('scripts/video-fusion/harness.ts'),director=await read('scripts/verify-director-native-application.ts');
 let lifecycleText,readiness;
 if(!baseline){lifecycleText=await read('scripts/video-fusion/process-lifecycle.ts');readiness=evaluate(await read('scripts/verification/native-route-readiness.ts'));}
 // Execute the actual scene function up to its browser-context boundary. The
 // browser/fetch/HTTP adapters are explicit ports,not full-app acceptance.
 const boundary=new Error('OWN_PREWARM_BOUNDARY'),requests=[];let browserClosed=0;
 const browser={async newContext(){throw boundary},async close(){browserClosed++}};
 const playwright={chromium:{async launch(){return browser}},expect:{configure(){return{}}}};
 const compiled=await esbuild.build({absWorkingDir:root,entryPoints:[path.join(source,'scripts/verify-scene-native-interactions.ts')],bundle:true,write:false,metafile:true,platform:'node',target:'node24',format:'cjs',packages:'external',nodePaths:[path.join(root,'node_modules')],tsconfig:path.join(source,'tsconfig.json')});
 for(const name of Object.keys(compiled.metafile.inputs)){const absolute=path.resolve(root,name);if(absolute.startsWith(source+path.sep)){const relative=path.relative(source,absolute).split(path.sep).join('/');loaded[relative]=hash(await fs.readFile(absolute));}}
 const c=context({__dirname:path.join(source,'scripts'),require:n=>n==='@playwright/test'?playwright:require(n),fetch:async()=>({status:200,async text(){return'<html></html>'}})});
 vm.runInNewContext(compiled.outputFiles[0].text,c);
 const fixture={cookies:{a:'nv_user=fixture'},async request(account,method,url){requests.push({account,method,url});return{status:/\/outputs$|\/generate$|^\/api\/video\/references$/.test(url)?405:200,body:{}}}};
 await assert.rejects(c.module.exports.verifySceneInteractions(fixture,out,'existing-video'),e=>e===boundary);
 normal.sceneReadRequests=requests.filter(r=>!(/\/outputs$|\/generate$|^\/api\/video\/references$/.test(r.url)));
 const methodRequests=requests.filter(r=>/\/outputs$|\/generate$|^\/api\/video\/references$/.test(r.url));
 check('actual scene preparation preserves19 original read routes',normal.sceneReadRequests.length===19);
 check('preparation never issues a mutating request',requests.every(r=>r.method==='GET'));
 check('preparation closes its browser port on failure',browserClosed===1);
 issues.sceneMissingWriteReadiness=methodRequests.length===0?1:0;
 check('scene method-only readiness matches selected implementation',methodRequests.length===(baseline?0:3));
 if(!baseline){
  const index=scene.indexOf('await prewarmNativeWriteRoutes(');check('method readiness precedes actual Canvas HTML and WebGL residency',index>=0&&index<scene.indexOf('const htmlResponse='));
  let calls=0;await assert.rejects(readiness.prewarmNativeWriteRoutes({async request(){calls++;return{status:200}}},['/bad-method-contract']));check('readiness retains strict405 and has no automatic retry',calls===1);
 }
 // Director had a working method-only preparation already. Execute its actual
 // old inline block or new helper call,without starting its main/App/PG.
 const directorAst=ast(director),block=baseline?find(directorAst,n=>ts.isForOfStatement(n)&&n.getText(directorAst).includes('response.status,405')):find(directorAst,n=>ts.isVariableStatement(n)&&n.getText(directorAst).includes('const writeRoutes=await prewarmNativeWriteRoutes'));
 assert.ok(block);const directorRequests=[];
 const projection=evaluate('export async function run(h,id){'+block.getText(directorAst)+'}',{prewarmNativeWriteRoutes:readiness?.prewarmNativeWriteRoutes,assert});
 await projection.run({async request(account,method,url){directorRequests.push({account,method,url});return{status:405}}},'director-known');
 normal.directorRequests=directorRequests;check('director retains exactly its original3 read-only method preparations',directorRequests.length===3&&directorRequests.every(r=>r.method==='GET'));
 // Original stop/error handlers are projected verbatim; modified uses the
 // actual narrow process owner. These process-error controls issue no command.
 const oldStop=baseline?find(ast(harness),n=>ts.isFunctionDeclaration(n)&&n.name?.text==='stopChild').getText(ast(harness)):null;
 const loadProcess=(platform,spawnPort)=>baseline?evaluate(oldStop+'\nexport const stop=stopChild;',{process:{platform},spawn:spawnPort}):evaluate(lifecycleText,{process:{platform},require:n=>n==='node:child_process'?{spawn:spawnPort}:require(n)});
 for(const mode of ['spawn-error','nonzero']){
  const child=fakeChild(),spawnPort=()=>{const command=new EventEmitter();command.stderr=new EventEmitter();command.kill=()=>true;queueMicrotask(()=>{if(mode==='spawn-error')command.emit('error',new Error('fixture spawn ENOMEM'));else{command.emit('exit',5);command.emit('close',5)}});return command};
  const lib=loadProcess('win32',spawnPort);let error;try{await(baseline?lib.stop(child):lib.stopFixtureChild(child))}catch(e){error=e}
  issues['stopFalseSuccess_'+mode]=error?0:1;check('active child '+mode+' does not get a false cleanup receipt',baseline?!error:!!error);
 }
 const exitedChild=fakeChild();exitedChild.exitCode=0;let spawnCalls=0;const exitedLib=loadProcess('win32',()=>{spawnCalls++;throw Error('must not spawn')});await(baseline?exitedLib.stop(exitedChild):exitedLib.stopFixtureChild(exitedChild));normal.alreadyExitedSpawns=spawnCalls;check('already exited owner is not signalled again',spawnCalls===0);
 const linuxChild=fakeChild(),linuxLib=loadProcess('linux',()=>{throw Error('Linux must not taskkill')});await(baseline?linuxLib.stop(linuxChild):linuxLib.stopFixtureChild(linuxChild));normal.linuxSignals=linuxChild.signals;check('normal POSIX child retains TERM and observed exit',JSON.stringify(linuxChild.signals)==='["SIGTERM"]');
 const failureAst=ast(app),failure=find(failureAst,n=>ts.isCatchClause(n)&&n.block.getText(failureAst).includes('postgres-failure.log'));assert.ok(failure);
 for(const writeFails of [false,true]){
  const primary=new Error('original scene output failure'),streams=[];const processLib=baseline?null:evaluate(lifecycleText);
  const handler=evaluate('export async function handle(error)'+failure.block.getText(failureAst),{container:'owned-fixture',out:'owned-output',path,spawnSync:()=>({error:new Error('fixture spawn ENOMEM')}),fixtureCommandOutput:processLib?.fixtureCommandOutput,async writeFile(name,data){if(typeof data!=='string')throw new TypeError('data='+String(data));streams.push(data);if(writeFails)throw new Error('fixture diagnostic storage failure')}});
  let observed;try{await handler.handle(primary)}catch(e){observed=e}
  issues['primaryMasked_'+writeFails]=observed===primary?0:1;check('primary error survives '+(writeFails?'diagnostic write failure':'missing command streams'),baseline?observed!==primary:observed===primary);
  if(!baseline)check('failed command is represented as textual diagnostic',streams[0].includes('COMMAND_ERROR=Error: fixture spawn ENOMEM'));
 }
 const output=baseline?x=>x.stdout+x.stderr:evaluate(lifecycleText).fixtureCommandOutput;
 normal.commandOutput=output({stdout:'stdout\n',stderr:'stderr\n'});check('normal stdout/stderr bytes remain exact',normal.commandOutput==='stdout\nstderr\n');
 let realChildExit=false;
 if(!baseline){
  const realLib=evaluate(lifecycleText),token=crypto.randomUUID(),child=spawn(process.execPath,['-e',`process.send({owner:${JSON.stringify(token)}});setInterval(()=>{},1000)`],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  try{
   const message=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('OWN_CHILD_READY_TIMEOUT')),10000);child.once('message',value=>{clearTimeout(timer);resolve(value)});child.once('error',error=>{clearTimeout(timer);reject(error)})});assert.equal(message.owner,token);
   await realLib.stopFixtureChild(child);realChildExit=child.exitCode!==null||child.signalCode!==null;check('actual owned child exits before cleanup is acknowledged',realChildExit);
  }finally{if(child.exitCode===null&&child.signalCode===null)await realLib.stopFixtureChild(child);}
 }
 let comparison='CAPTURED';if(value('--compare')){const old=JSON.parse(await fs.readFile(value('--compare'),'utf8'));assert.deepEqual(normal,old.normal);comparison='EXACT'}
 assert.equal(Object.values(issues).reduce((a,b)=>a+b,0),baseline?5:0);
 const report={status:baseline?'BASELINE_REPRODUCED':'PASS',checks,issues,normal,comparison,loaded,sourceRoot:source,realChildExit,explicitPorts:['browser-context boundary','read-only HTTP/fetch','process-spawn failure controls'],fullAppAcceptance:false,realPG:false,supplierPosts:0,externalRequests:0};
 await fs.writeFile(path.join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`NATIVE_FIXTURE_LIFECYCLE=${report.status} CHECKS=${checks.length} READINESS_MISSING=${issues.sceneMissingWriteReadiness} FALSE_STOP=${issues['stopFalseSuccess_spawn-error']+issues['stopFalseSuccess_nonzero']} PRIMARY_MASKED=${issues.primaryMasked_false+issues.primaryMasked_true} NORMAL=${comparison} REAL_CHILD_EXIT=${Number(realChildExit)} PG=0 SUPPLIER_POSTS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
