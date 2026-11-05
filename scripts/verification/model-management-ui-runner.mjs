/** One lifecycle for the nine existing ModelManagement UI commands.
 * Next and verification run in a byte copy: no config backup/restore can overwrite
 * a later developer edit. The child handle/IPC, not any found file, owns cleanup. */
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';import {createServer} from 'node:net';import {pathToFileURL} from 'node:url';
import {sourceIdentity,hash} from './refactor-runner.mjs';
import {prepareOwnedModelUiProduction} from './model-ui-production-build.mjs';
const loader=pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const observed=child=>new Promise(resolve=>{child.once('error',error=>resolve({exit:1,error:String(error)}));child.once('exit',(exit,signal)=>resolve({exit:exit??1,signal}));});
async function waitForExit(promise,ms){let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);})]);}finally{clearTimeout(timer);}}
async function stopOwned(child,completion,runId){
  if(!child || child.exitCode!==null || child.signalCode!==null)return;
  if(child.connected)child.send({action:'stop',runId});
  if(await waitForExit(completion,15000))return;
  if(process.platform==='win32'){
    const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await observed(killer);
  }else child.kill('SIGTERM');
  if(!await waitForExit(completion,5000))throw Error('OWNED_UI_PROCESS_DID_NOT_EXIT');
}
export async function runModelManagementUi(verificationFile,{root=process.cwd(),env=process.env,startupTimeoutMs=120000,pollMs=250,port=0,profile='model-management'}={}){
  root=await fs.realpath(root);
  const database=new URL(env.DATABASE_URL||'http://invalid');
  if(env.NAUMI_VERIFY_ISOLATED_DB!=='1'||database.hostname!=='127.0.0.1')throw Error('Requires isolated local PostgreSQL');
  if(!/^scripts\/verify-[\w-]+\.(?:ts|cjs)$/.test(verificationFile))throw Error('MODEL_UI_VERIFICATION_ENTRY_REQUIRED');
  const profiles={'model-management':{fixture:'scripts/model-management-ui-fixture.ts',metadata:'output/model-management-fixture/fixture.json',directory:'output/model-management-fixture'},'model-config':{fixture:'scripts/model-config-ui-fixture.ts',metadata:'output/model-ui-fixture.json',directory:'output/model-config-ui-fixture'}};
  const selected=profiles[profile];if(!selected)throw Error('MODEL_UI_PROFILE_INVALID');
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('MODEL_UI_PORT_INVALID');
  port=await new Promise((resolve,reject)=>{const probe=createServer();probe.once('error',()=>reject(Error('MODEL_UI_PORT_IN_USE')));probe.listen(port,'127.0.0.1',()=>{const assigned=probe.address().port;probe.close(()=>resolve(assigned));});});
  const origin=`http://127.0.0.1:${port}`;
  const base=path.join(root,selected.directory),runId=randomUUID();await fs.mkdir(base,{recursive:true});
  // Keep the previous standalone fixture marker authoritative; never stop it.
  if(await fs.stat(path.join(root,selected.metadata)).then(()=>true,()=>false))throw Error('Existing fixture must be stopped first');
  const lockPath=path.join(base,'runner.lock'),lock=await fs.open(lockPath,'wx');await lock.writeFile(JSON.stringify({runId,pid:process.pid})+'\n');
  const run=path.join(base,'runs',runId),source=path.join(run,'source');let fixture,fixtureDone,checker,checkerDone,result={runId,status:'STARTING',verificationFile,profile,root,source,origin,port,exit:1};
  try{
    await fs.mkdir(source,{recursive:true});
    const identity=await sourceIdentity(root);result.sourceIdentity=identity;
    const files=Object.keys(identity.hashes);
    for(const file of files){const src=path.resolve(root,file),dest=path.resolve(source,file);if(path.relative(root,src).startsWith('..')||path.relative(source,dest).startsWith('..'))throw Error('UI_SOURCE_PATH_ESCAPE');const stat=await fs.lstat(src);if(!stat.isFile()||stat.isSymbolicLink())throw Error('UI_SOURCE_MUST_BE_FILE');await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(src,dest);}
    for(const file of files)if(hash(await fs.readFile(path.join(source,file)))!==identity.hashes[file])throw Error('UI_SOURCE_CHANGED_DURING_COPY');
    await fs.mkdir(path.join(source,'output'),{recursive:true});await fs.writeFile(path.join(source,'output/model-ui-source.json'),JSON.stringify(identity)+'\n');
    await fs.symlink(path.join(root,'node_modules'),path.join(source,'node_modules'),process.platform==='win32'?'junction':'dir');
    // The source copy already owns its cwd. Keep Next's cache path short on
    // Windows rather than nesting another full evidence path inside it.
    // This input belongs to the invoking checkout, not the owned source copy's
    // cwd. CI supplies a relative pinned Router path under the original root.
    const started=Date.now();let production;
    if(profile==='model-config'&&verificationFile==='scripts/verify-business-ui.ts'){
      if(env.NAUMI_MODEL_UI_DEV_IMAGE)throw Error('MODEL_UI_BUSINESS_REQUIRES_PRODUCTION');
      production=await prepareOwnedModelUiProduction({root,source:identity,target:path.join(run,'production'),manifestFile:env.NAUMI_MODEL_UI_PRODUCTION_MANIFEST,env});
      result.production=production.evidence;
      await fs.writeFile(path.join(run,'PRODUCTION.json'),JSON.stringify(production.evidence,null,2)+'\n');
      if(Date.now()-started>=startupTimeoutMs)throw Error('MODEL_UI_PRODUCTION_PREPARATION_TIMEOUT');
    }
    const childEnv={...env,...production?.environment,...(production?{NAUMI_MODEL_UI_PRODUCTION_DIR:production.directory,NAUMI_MODEL_UI_PRODUCTION_BUILD_ID:production.evidence.buildId}:{}),...(env.NAUMI_VERIFY_ROUTER_SOURCE?{NAUMI_VERIFY_ROUTER_SOURCE:path.resolve(root,env.NAUMI_VERIFY_ROUTER_SOURCE)}:{}),NEXT_DIST_DIR:'.next',NAUMI_MODEL_UI_RUN_ID:runId,NAUMI_MODEL_UI_PORT:String(port),NAUMI_MODEL_UI_BASE_URL:origin,NAUMI_MODEL_UI_SOURCE_MANIFEST:'output/model-ui-source.json'};
    const spawnTs=(file,server=false,ipc=false)=>spawn(process.execPath,[...(server?['--conditions=react-server']:[]),'--import',loader,file],{cwd:source,env:childEnv,windowsHide:true,stdio:ipc?['ignore','inherit','inherit','ipc']:['ignore','inherit','inherit']});
    fixture=spawnTs(selected.fixture,true,true);fixtureDone=observed(fixture);
    const metadata=path.join(source,selected.metadata);let ready=false,readyMetadata;
    while(Date.now()-started<startupTimeoutMs){
      if(fixture.exitCode!==null||fixture.signalCode!==null)throw Error('Fixture exited during setup: '+JSON.stringify(await fixtureDone));
      let state;try{state=JSON.parse(await fs.readFile(metadata,'utf8'));}catch{}
      if(state){if(state.runId!==runId)throw Error('MODEL_UI_METADATA_OWNER_MISMATCH');try{if((await fetch(origin+'/api/health',{signal:AbortSignal.timeout(2000)})).ok){ready=true;readyMetadata=state;break;}}catch{}}
      await wait(pollMs);
    }
    if(!ready)throw Error('Fixture startup timed out');
    if(profile==='model-config'&&verificationFile==='scripts/verify-business-ui.ts'){
      // Production output is sealed/copied before startup, not compiled during
      // the original browser deadline. Keep authenticated readiness in the same
      // startup budget; no retry/reload is added to the acceptance checker.
      if(readyMetadata?.runtime!=='production-standalone'||readyMetadata?.buildId!==production.evidence.buildId)throw Error('MODEL_UI_PRODUCTION_METADATA_MISMATCH');
      if(typeof readyMetadata?.userCookie!=='string')throw Error('MODEL_UI_PREPARATION_USER_MISSING');
      const begun=Date.now(),response=await fetch(origin+'/canvas',{headers:{cookie:'nv_user='+readyMetadata.userCookie},redirect:'manual',signal:AbortSignal.timeout(Math.max(1,startupTimeoutMs-(Date.now()-started)))});
      await response.arrayBuffer();if(response.status!==200)throw Error('MODEL_UI_CANVAS_PREPARATION_FAILED:'+response.status);
      result.preparedPages=[{path:'/canvas',status:response.status,ms:Date.now()-begun,startupBudgetMs:startupTimeoutMs,runtime:'production-standalone',buildId:production.evidence.buildId}];
    }
    checker=spawnTs(verificationFile);checkerDone=observed(checker);const checked=await checkerDone;result={...result,status:checked.exit===0?'PASS':'FAIL',exit:checked.exit,check:checked};
  }catch(error){result={...result,status:'FAIL',error:String(error),stack:error.stack};}
  finally{
    try{
      await stopOwned(checker,checkerDone,runId);await stopOwned(fixture,fixtureDone,runId);
      if(fixtureDone){result.fixtureExit=await fixtureDone;if(result.check?.exit===0&&result.fixtureExit.exit!==0)throw Error('FIXTURE_CLEANUP_FAILED: '+JSON.stringify(result.fixtureExit));}
    }catch(error){result={...result,status:'FAIL',exit:result.exit||1,cleanupError:String(error)};}
    await fs.mkdir(run,{recursive:true});await fs.writeFile(path.join(run,'RUN.json'),JSON.stringify(result,null,2)+'\n');
    await lock.close();const owner=JSON.parse(await fs.readFile(lockPath,'utf8'));if(owner.runId!==runId)throw Error('MODEL_UI_LOCK_OWNER_CHANGED');await fs.unlink(lockPath);
  }
  console.log(`MODEL_UI_RUNNER=${result.status} ENTRY=${verificationFile} EXIT=${result.exit} ISOLATED_SOURCE=1 RESTORE_WRITES=0 CHILDREN_CLOSED=${result.cleanupError?0:1} EVIDENCE=${path.join(run,'RUN.json')}`);
  return result;
}
