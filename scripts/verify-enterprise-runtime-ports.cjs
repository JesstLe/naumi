// Execute the actual acceptance allocator, not a copied port algorithm.
// A deterministic OS probe sequence reproduces reuse; the real runtime config
// validator remains authoritative and must continue rejecting role collisions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter,once}=require('node:events'),net=require('node:net'),os=require('node:os');
const {generateKeyPairSync}=require('node:crypto'),{pathToFileURL}=require('node:url'),ts=require('typescript');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=path.resolve(arg('--source-root',path.join(__dirname,'..'))),relative='services/enterprise-workflow/tests/runtime.acceptance.ts';
const source=fs.readFileSync(path.join(root,relative),'utf8'),ast=ts.createSourceFile(relative,source,ts.ScriptTarget.Latest,true);
const declarations=[];
for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
 if(ts.isIdentifier(declaration.name)&&['allocatedPorts','port'].includes(declaration.name.text))declarations.push('const '+declaration.getText(ast)+';');
}
assert(declarations.some(x=>x.startsWith('const port=')),'load the actual port owner');
const code=ts.transpileModule(declarations.join('\n')+'\nexports.port=port;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(createServer){const result={};vm.runInNewContext(code,{exports:result,createServer,once,assert,Set});return result.port;}
function probe(values){let index=0;return {get calls(){return index},createServer(){const server=new EventEmitter();server.listen=()=>{queueMicrotask(()=>server.emit('listening'));return server;};server.address=()=>({port:values[Math.min(index++,values.length-1)]});server.close=done=>{done();return server;};return server;}};}
(async()=>{
 let checks=0;
 const {loadRuntimeConfig}=await import(pathToFileURL(path.join(root,'services/enterprise-workflow/src/runtime-config.ts')).href);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-runtime-port-contract-'));
 try{
  const keys=generateKeyPairSync('ed25519'),base={version:1,installationId:'port-contract',slot:'fixture',expectedDatabase:'runtime_fixture',databaseUrl:'postgresql://fixture:fixture@127.0.0.1:5432/runtime_fixture',releaseId:'a'.repeat(64),allowDevelopmentBuild:true,deploymentMode:'dedicated',tenants:[{enterpriseId:'00000000-0000-4000-8000-000000000001',sourceInstance:'fixture-source',sourceEnterprise:'00000000-0000-4000-8000-000000000002'}],publicKeys:{fixture:keys.publicKey.export({type:'spki',format:'pem'}).toString()},deliveryRoot:path.join(temp,'delivery'),apiPort:52001,workerPort:52002,controlToken:'0123456789abcdef'.repeat(4),connectors:[]};
  async function config(name,value){const file=path.join(temp,name+'.json');fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});return loadRuntimeConfig(file);}
  await assert.rejects(config('same-role-port',{...base,apiPort:52002}),error=>error.code==='RUNTIME_PORT_COLLISION');checks++;
  const repeated=probe([52001,52002,52002,52003]),allocate=load(()=>repeated.createServer());
  const apiPort=await allocate(),workerPort=await allocate(),peerApiPort=await allocate();
  if(peerApiPort===workerPort){
   await assert.rejects(config('reused-worker',{...base,apiPort:peerApiPort,workerPort}),error=>error.code==='RUNTIME_PORT_COLLISION');
   console.error(`RUNTIME_TEST_PORTS=REPRODUCED API_PORT=${peerApiPort} WORKER_PORT=${workerPort} CODE=RUNTIME_PORT_COLLISION ACTUAL_CONFIG_VALIDATOR=1`);
  }
  assert.notEqual(peerApiPort,workerPort,'released worker port must not be reissued to an inherited API config');
  assert.equal(repeated.calls,4,'duplicate probe is retried rather than published');checks++;
  await config('inherited-worker',{...base,apiPort:peerApiPort,workerPort});checks++;
  const sequential=probe(Array.from({length:40},(_,n)=>53000+Math.floor(n/2))),parallel=load(()=>sequential.createServer());
  const values=await Promise.all(Array.from({length:20},()=>parallel()));assert.equal(new Set(values).size,20);checks++;
  const exhausted=probe([54000]),bounded=load(()=>exhausted.createServer());await bounded();await assert.rejects(bounded(),/RUNTIME_TEST_PORT_EXHAUSTED/);assert.equal(exhausted.calls,101);checks++;
  const actual=load(net.createServer);const real=[];for(let i=0;i<24;i++)real.push(await actual());assert.equal(new Set(real).size,24);checks++;
  console.log(`RUNTIME_TEST_PORTS=PASS CASES=${checks} ACTUAL_ALLOCATOR=1 DETERMINISTIC_REUSE=1 REAL_LOOPBACK_PORTS=${real.length} PRODUCTION_COLLISION_GUARD=RETAINED DATABASE_CONNECTIONS=0`);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
