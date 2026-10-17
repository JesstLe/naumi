// Owned-container acceptance adapter, not a production release executor.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {renderEnterpriseProxy,judgeEnterpriseRetirement} from './proxy-contract.mjs';
export const NGINX_IMAGE='nginx@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5';
const sha=b=>createHash('sha256').update(b).digest('hex'),pause=ms=>new Promise(r=>setTimeout(r,ms));
export function createProxyFixture({docker,run,inspect,logs,prefix,out,sensitive,sandbox}){
 const secret=randomBytes(32).toString('hex');sensitive.push(secret);
 const proxyVolume=prefix+'-proxy-data',nginx=prefix+'-proxy',greenWeb=prefix+'-green-web',greenApi=prefix+'-green-api';let volumeCreated=false,driver,meta,webConfig,blueConfig,greenConfig,current,expected,versions,assetSummary,candidateObservation;
 const records=[],observations=[],configurationTests=[];
 const node=(code,input)=>docker(['exec','-i',driver,'node','--input-type=module'],{input:code+(input===undefined?'':'\n')});
 const write=(path,bytes)=>node(`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(path)},${JSON.stringify(bytes)},{mode:0o600});`);
 const request=async(url,headers={},body)=>JSON.parse(node(`const r=await fetch(${JSON.stringify(url)},{method:${JSON.stringify(body===undefined?'GET':'POST')},headers:${JSON.stringify(headers)},${body===undefined?'':`body:${JSON.stringify(JSON.stringify(body))},`}signal:AbortSignal.timeout(10000)});console.log(JSON.stringify({status:r.status,body:await r.json()}));`));
 const webBase=slot=>'http://127.0.0.1:'+(slot==='blue'?meta.webPort:meta.greenWebPort);
 const runtimeBase=slot=>'http://127.0.0.1:'+(slot==='blue'?meta.apiPort:meta.greenApiPort);
 const sample=async()=>{
  const w=await request(webBase('blue')+'/api/internal/release/status',{'x-release-control-secret':secret});assert.equal(w.status,200);
  const r=await request(runtimeBase('blue')+'/internal/lifecycle/status',{authorization:'Bearer '+blueConfig.controlToken});assert.equal(r.status,200);
  expected??={web:{instanceId:prefix+'-blue',bootId:w.body.identity.bootId,commit:versions.blue.web.gitRevision},runtime:{installationId:blueConfig.installationId,slot:blueConfig.slot,bootId:r.body.bootId,releaseId:blueConfig.releaseId}};
  assert.equal(w.body.identity.instanceId,expected.web.instanceId);assert.equal(w.body.identity.commit,expected.web.commit);assert.equal(r.body.slot,expected.runtime.slot);assert.equal(r.body.releaseId,expected.runtime.releaseId);
  const value={web:w.body,runtime:r.body,expected,receivedAt:new Date().toISOString()},gate=judgeEnterpriseRetirement(value);observations.push({value,gate});return {value,gate};
 };
 async function routeProof(slot){
  let result;for(let i=0;i<60;i++){
   result=JSON.parse(node(`const r=await fetch(${JSON.stringify(webConfig.NAUMI_ENTERPRISE_PUBLIC_ORIGIN+'/api/version')},{headers:{connection:'close'},signal:AbortSignal.timeout(10000)});console.log(JSON.stringify({status:r.status,slot:r.headers.get('x-enterprise-proxy-slot'),revision:r.headers.get('x-enterprise-proxy-revision'),requestId:r.headers.get('x-enterprise-request-id'),body:await r.json()}));`));
   if(result.status===200&&result.slot===slot)break;await pause(100);
  }
  assert.equal(result.slot,slot);assert.equal(result.status,200);assert.equal(result.body.commit,versions[slot].web.gitRevision);
  const target='127.0.0.1:'+(slot==='blue'?meta.webPort:meta.greenWebPort);let logged;
  for(let i=0;i<30;i++){logged=logs(nginx).split('\n').filter(l=>l.startsWith('{')).map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(r=>r?.requestId===result.requestId);if(logged)break;await pause(100);}
  assert.equal(logged?.upstream,target,'ACTUAL_NGINX_UPSTREAM_MISMATCH');return {...result,actualUpstream:logged.upstream};
 }
 async function publish(candidate,expectedHash){
  const operation=randomUUID();
  node(`import fs from 'node:fs';import {createHash} from 'node:crypto';const hash=()=>createHash('sha256').update(fs.readFileSync('/proxy/nginx.conf')).digest('hex');const fd=fs.openSync('/proxy/.fixture-switch-lock','wx',0o600);fs.closeSync(fd);try{if(hash()!==${JSON.stringify(expectedHash)})throw Error('PROXY_CONFIG_CAS');fs.writeFileSync('/proxy/candidate.conf',${JSON.stringify(candidate.text)},{mode:0o644});fs.writeFileSync('/proxy/.fixture-switch-lock',${JSON.stringify(operation)});}catch(e){fs.unlinkSync('/proxy/.fixture-switch-lock');throw e;}`);
  try{
   docker(['exec',nginx,'nginx','-t','-c','/etc/enterprise-proxy/candidate.conf']);
   node(`import fs from 'node:fs';import {createHash} from 'node:crypto';if(fs.readFileSync('/proxy/.fixture-switch-lock','utf8')!==${JSON.stringify(operation)})throw Error('PROXY_LOCK_CHANGED');if(createHash('sha256').update(fs.readFileSync('/proxy/nginx.conf')).digest('hex')!==${JSON.stringify(expectedHash)})throw Error('PROXY_CONFIG_CAS');fs.renameSync('/proxy/candidate.conf','/proxy/nginx.conf');const fd=fs.openSync('/proxy','r');fs.fsyncSync(fd);fs.closeSync(fd);`);
   docker(['exec',nginx,'nginx','-s','reload','-c','/etc/enterprise-proxy/nginx.conf']);
   const proof=await routeProof(candidate.plan.slot),dump=docker(['exec',nginx,'nginx','-T','-c','/etc/enterprise-proxy/nginx.conf']),configDump='NGINX_T_REV'+candidate.plan.revision+'.txt';await writeFile(join(out,configDump),dump);records.push({plan:candidate.plan,configSha256:candidate.configSha256,planSha256:candidate.planSha256,effectiveConfigSha256:sha(dump),configDump,proof});current=candidate;
  }finally{node(`import fs from 'node:fs';if(fs.existsSync('/proxy/.fixture-switch-lock')&&fs.readFileSync('/proxy/.fixture-switch-lock','utf8')===${JSON.stringify(operation)})fs.unlinkSync('/proxy/.fixture-switch-lock');`);}
 }
 const phase=async(text)=>{for(let i=0;i<240;i++){if(logs(driver).includes(text))return;assert(inspect(driver).State.Running,logs(driver));await pause(500);}throw Error('PROXY_DRIVER_PHASE_TIMEOUT '+text);};
 return {
  extraEnv:{NAUMI_COMPOSITION_PROXY_TEST:'1',NAUMI_COMPOSITION_RELEASE_SECRET:secret},
  get driverMount(){return `type=volume,source=${proxyVolume},target=/proxy,volume-nocopy`;},
  async prepare(runtimeImage){docker(['volume','create','--label','naumi.fixture=enterprise-production-composition',proxyVolume]);volumeCreated=true;docker(['run','--rm','--network','none','--user','0:0','--mount',`type=volume,source=${proxyVolume},target=/proxy,volume-nocopy`,'--entrypoint','sh',runtimeImage,'-c','chown 1000:1000 /proxy && chmod 755 /proxy']);},
  webEnvironment(env,metadata,slot='blue',legacy=false){return {...env,NAUMI_RELEASE_RUNTIME:'1',NAUMI_INSTANCE_ID:prefix+'-'+slot,NAUMI_RELEASE_ADMISSION_START:'open',RELEASE_CONTROL_SECRET:secret,NAUMI_RELEASE_HTTP_CONTROL_PORT:String(slot==='blue'?(legacy?3002:metadata.blueObserverPort):metadata.greenObserverPort),NODE_OPTIONS:'--max-old-space-size=1024'};},
  async start({driverName,metadata,web, runtime,blueWeb,blueRuntime,webConfiguration,runtimeConfiguration,webEnv,mount,networkContainer}){
   driver=driverName;meta=metadata;webConfig=webConfiguration;blueConfig=runtimeConfiguration;
   versions={blue:{web:blueWeb,runtime:blueRuntime},green:{web,runtime}};
   greenConfig={...blueConfig,releaseId:runtime.releaseId,allowDevelopmentBuild:runtime.sourceDirty,slot:'candidate-green',apiPort:meta.greenApiPort,workerPort:meta.greenWorkerPort};write('/app/output/composition/green-runtime.json',JSON.stringify(greenConfig));
   run(greenApi,[...sandbox,'--user','1000:1000','--memory','512m','--network','container:'+networkContainer,'--mount',mount,'-e','RUNTIME_CONFIG=/app/output/composition/green-runtime.json',runtime.imageId,'serve','--config','/app/output/composition/green-runtime.json']);
   const greenEnv=this.webEnvironment({...webEnv,PORT:String(meta.greenWebPort),NAUMI_WORKFLOW_SERVICE_URL:runtimeBase('green')},meta,'green');
   run(greenWeb,[...sandbox,'--memory','1536m','--network','container:'+networkContainer,'--tmpfs','/data:rw,nosuid,size=64m,uid=1001,gid=1001,mode=700',...Object.keys(greenEnv).flatMap(k=>['-e',k]),web.imageId,'node','--require','/app/scripts/release-http-observer.cjs','server.js'],greenEnv);
   let ready=false;for(let i=0;i<120;i++){assert(inspect(greenWeb).State.Running,logs(greenWeb));try{const w=await request(webBase('green')+'/api/version'),r=await request(runtimeBase('green')+'/readyz');if(w.status===200&&r.status===200&&w.body.commit===web.gitRevision&&r.body.releaseId===runtime.releaseId){ready=true;break;}}catch{}await pause(250);}assert(ready);
   const greenObservation=await request(webBase('green')+'/api/internal/release/status',{'x-release-control-secret':secret});assert.equal(greenObservation.status,200);assert.equal(greenObservation.body.transport.verified,true,'GREEN_CONFIGURED_OBSERVER_PORT_REQUIRED');assert.equal(greenObservation.body.identity.instanceId,prefix+'-green');assert.equal(greenObservation.body.identity.commit,web.gitRevision);candidateObservation={web:greenObservation.body,runtime:(await request(runtimeBase('green')+'/internal/lifecycle/status',{authorization:'Bearer '+greenConfig.controlToken})).body};assert.equal(candidateObservation.runtime.slot,'candidate-green');assert.equal(candidateObservation.runtime.releaseId,runtime.releaseId);
   // Preserve immutable old/new static bytes without keeping an extra Web alive.
   node("import fs from 'node:fs';for(const d of ['blue','green','assets'])fs.mkdirSync('/proxy/'+d,{recursive:true});");
   for(const [slot,name] of [['blue',prefix+'-web'],['green',greenWeb]]){
    const tar=execFileSync('docker',['cp',name+':/app/.next/static','-'],{maxBuffer:256*1024*1024,stdio:['ignore','pipe','pipe']});docker(['cp','-',driver+':/proxy/'+slot],{input:tar});
   }
   assetSummary=JSON.parse(node(`import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';const hashes={},counts={blue:0,green:0},hash=b=>createHash('sha256').update(b).digest('hex');let bytes=0;function walk(root,relative,slot){for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('ASSET_SYMLINK');const file=path.join(relative,entry.name);if(entry.isDirectory())walk(root,file,slot);else{const b=fs.readFileSync(path.join(root,file)),key=file.split(path.sep).join('/'),h=hash(b);if(hashes[key]&&hashes[key]!==h)throw Error('STATIC_ASSET_COLLISION');hashes[key]=h;counts[slot]++;bytes+=b.length;if(Object.keys(hashes).length>20000||bytes>512*1024*1024)throw Error('ASSET_LIMIT');const to=path.join('/proxy/assets',file);fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o755});fs.writeFileSync(to,b,{mode:0o644});}}}walk('/proxy/blue/static','','blue');walk('/proxy/green/static','','green');console.log(JSON.stringify({counts,uniqueFiles:Object.keys(hashes).length,bytes,manifestSha256:hash(JSON.stringify(Object.entries(hashes).sort()))}));`));
   current=renderEnterpriseProxy({publicOrigin:webConfig.NAUMI_ENTERPRISE_PUBLIC_ORIGIN,listenPort:meta.proxyPort,slot:'blue',webPort:meta.webPort,revision:1});write('/proxy/nginx.conf',current.text);node("import fs from 'node:fs';fs.chmodSync('/proxy/nginx.conf',0o644);");
   run(nginx,[...sandbox,'--user','1000:1000','--memory','128m','--network','container:'+networkContainer,'--mount',`type=volume,source=${proxyVolume},target=/etc/enterprise-proxy,readonly,volume-nocopy`,'--entrypoint','nginx',NGINX_IMAGE,'-c','/etc/enterprise-proxy/nginx.conf','-g','daemon off;']);
   let proof;for(let i=0;i<60;i++){assert(inspect(nginx).State.Running,logs(nginx));try{proof=await routeProof('blue');break;}catch{await pause(100);}}assert(proof);const dump=docker(['exec',nginx,'nginx','-T','-c','/etc/enterprise-proxy/nginx.conf']);await writeFile(join(out,'NGINX_T_REV1.txt'),dump);records.push({plan:current.plan,configSha256:current.configSha256,planSha256:current.planSha256,effectiveConfigSha256:sha(dump),configDump:'NGINX_T_REV1.txt',proof});
  },
  async exercise(){
   await phase('PROXY_HELD_REQUEST_READY');const held=await sample();assert(held.value.web.observations.activeRequests>0);assert.equal(held.gate.mayRetire,false);assert(held.gate.reasons.includes('WEB_HTTP_NOT_DRAINED'));
   const premature=await request(runtimeBase('blue')+'/internal/lifecycle/stop',{authorization:'Bearer '+blueConfig.controlToken,'content-type':'application/json'},{installationId:blueConfig.installationId,releaseId:blueConfig.releaseId,slot:blueConfig.slot,bootId:held.value.runtime.bootId,role:'api',operationId:randomUUID(),reason:'must preserve accepted Web upload'});assert.equal(premature.status,409);
   const originalHash=current.configSha256;const invalid={...current,text:current.text+'\nnot_a_directive;\n'};await assert.rejects(publish(invalid,originalHash));const afterInvalid=node("import fs from 'node:fs';import{createHash}from'node:crypto';console.log(createHash('sha256').update(fs.readFileSync('/proxy/nginx.conf')).digest('hex'));");assert.equal(afterInvalid,originalHash);configurationTests.push('nginx invalid syntax rejected before replacing original');
   const green=renderEnterpriseProxy({publicOrigin:webConfig.NAUMI_ENTERPRISE_PUBLIC_ORIGIN,listenPort:meta.proxyPort,slot:'green',webPort:meta.greenWebPort,revision:2});await publish(green,originalHash);
   await assert.rejects(publish(green,originalHash),/PROXY_CONFIG_CAS/);configurationTests.push('stale expected config hash rejected');write('/app/output/composition/cutover-ready','1');
   await phase('PROXY_ROLLBACK_READY');const settled=await sample();assert.equal(settled.value.web.observations.activeRequests,0);assert.equal(settled.value.runtime.activeRequests,0);assert.equal(settled.gate.mayRetire,false);assert(settled.gate.reasons.includes('WEB_ACCEPTED_TASKS_UNKNOWN_OR_ACTIVE'));assert.equal(settled.gate.observations.web.acceptedTasks,null);
   for(const value of [false,'0',null])assert(judgeEnterpriseRetirement({...settled.value,web:{...settled.value.web,observations:{...settled.value.web.observations,activeRequests:value}}}).reasons.includes('WEB_HTTP_NOT_DRAINED'));
   assert(judgeEnterpriseRetirement({...settled.value,receivedAt:'2000-01-01T00:00:00Z'}).reasons.includes('OBSERVATION_STALE'));assert(judgeEnterpriseRetirement({...settled.value,expected:{...expected,web:{...expected.web,bootId:randomUUID()}}}).reasons.includes('WEB_IDENTITY_CHANGED'));
   const control={instanceId:expected.web.instanceId,bootId:expected.web.bootId,expectedRevision:settled.value.web.admission.revision,operationId:randomUUID(),action:'drain'};const drain=await request(webBase('blue')+'/api/internal/release/control',{'x-release-control-secret':secret,'content-type':'application/json'},control);assert.equal(drain.status,200);const drained=await sample();assert.equal(drained.gate.mayRetire,false);
   const resume=await request(webBase('blue')+'/api/internal/release/control',{'x-release-control-secret':secret,'content-type':'application/json'},{...control,expectedRevision:drain.body.admission.revision,operationId:randomUUID(),action:'resume'});assert.equal(resume.status,200);
   await publish(renderEnterpriseProxy({publicOrigin:webConfig.NAUMI_ENTERPRISE_PUBLIC_ORIGIN,listenPort:meta.proxyPort,slot:'blue',webPort:meta.webPort,revision:3}),green.configSha256);write('/app/output/composition/rollback-ready','1');
  },
  async finish(){
   driver=greenApi;
   const s=await request(runtimeBase('green')+'/internal/lifecycle/status',{authorization:'Bearer '+greenConfig.controlToken});const body={installationId:greenConfig.installationId,releaseId:greenConfig.releaseId,slot:greenConfig.slot,bootId:s.body.bootId,role:'api',operationId:randomUUID(),reason:'owned fixture cleanup, not global release retirement'};
   for(const action of ['drain','stop'])assert.equal((await request(runtimeBase('green')+'/internal/lifecycle/'+action,{authorization:'Bearer '+greenConfig.controlToken,'content-type':'application/json'},body)).status,202);
   assert.equal(docker(['wait',greenApi]),'0');docker(['kill','--signal=TERM',greenWeb]);assert(['0','143'].includes(docker(['wait',greenWeb])));
   docker(['exec',nginx,'nginx','-s','quit','-c','/etc/enterprise-proxy/nginx.conf']);assert.equal(docker(['wait',nginx]),'0');
   for(const [name,file]of [[nginx,'NGINX.log'],[greenWeb,'GREEN_WEB.log'],[greenApi,'GREEN_RUNTIME.log']])await writeFile(join(out,file),logs(name));
   const report={evidenceMode:'fixture',sameBuild:versions.blue.web.imageId===versions.green.web.imageId&&versions.blue.runtime.imageId===versions.green.runtime.imageId,crossCommit:versions.blue.web.gitRevision!==versions.green.web.gitRevision,versions:{blue:{webCommit:versions.blue.web.gitRevision,webImageId:versions.blue.web.imageId,runtimeRelease:versions.blue.runtime.releaseId,runtimeImageId:versions.blue.runtime.imageId},green:{webCommit:versions.green.web.gitRevision,webImageId:versions.green.web.imageId,runtimeRelease:versions.green.runtime.releaseId,runtimeImageId:versions.green.runtime.imageId}},nginxImage:NGINX_IMAGE,assetSummary,candidateObservation,records,configurationTests,observations,fullLifecycleDisposition:'HOLD',productionReleaseComplete:false,heldUploadCompleted:true,rollbackKeptCurrentData:true,cleanupOnlyAfterControlledRequests:true};await writeFile(join(out,'PROXY_ACCEPTANCE.json'),JSON.stringify(report,null,2));return report;
  },
  cleanup(){if(volumeCreated)docker(['volume','rm',proxyVolume]);}
 };
}
