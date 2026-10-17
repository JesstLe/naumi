import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {build} from 'esbuild';
import {buildLinux,serviceRoot,POSTGRES_IMAGE} from './build-linux.mjs';

const args=process.argv.slice(2);assert(args.length%2===0&&args.every((v,i)=>i%2||['--output','--allow-development'].includes(v)));
const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]));assert(!options['--allow-development']||options['--allow-development']==='true');
const out=resolve(options['--output']||join(serviceRoot,'output/linux-verification'));
await mkdir(out,{recursive:true});
const suffix=randomBytes(6).toString('hex'),prefix='naumi-runtime-test-linux-'+suffix,network=prefix+'-network',volume=prefix+'-data',password=randomBytes(32).toString('hex');
const owned=[],exits=[],logs=[];let volumeCreated=false,networkCreated=false,success=false;
const redact=v=>String(v).replaceAll(password,'[fixture-secret]');
function docker(args,options={}) {
  try{return execFileSync('docker',args,{encoding:'utf8',timeout:120000,stdio:['pipe','pipe','pipe'],...options}).trim();}
  catch(e){throw Error('DOCKER_STEP_FAILED '+args.slice(0,2).join(' ')+' '+redact(e.stdout||'')+' '+redact(e.stderr||''));}
}
const dockerLogs=name=>{const r=spawnSync('docker',['logs',name],{encoding:'utf8',timeout:30000});assert.equal(r.status,0);return r.stdout+r.stderr;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
function ownRun(name,args,env){docker(['run','-d','--name',name,'--label','naumi.fixture=enterprise-linux',...args],{env:{...process.env,...env}});owned.push(name);}
const hardening=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--user','1000:1000','--pids-limit','128','--cpus','2','--memory','768m','--tmpfs','/tmp:rw,noexec,nosuid,size=64m,mode=1777'];
try {
  const release=await buildLinux({output:out,allowDevelopment:options['--allow-development']==='true'});
  execFileSync(process.execPath,['services/enterprise-workflow/build.mjs'],{cwd:resolve(serviceRoot,'../..'),stdio:'inherit'});
  assert.equal(JSON.parse(await readFile(join(serviceRoot,'dist/manifest.json'),'utf8')).releaseId,release.releaseId,'BUILD_CWD_REPRODUCIBILITY');
  const composeEnv={...process.env,ENTERPRISE_SLOT:'fixture',ENTERPRISE_IMAGE:release.imageId,ENTERPRISE_RUNTIME_CONFIG:'/private/fixture/runtime.json',ENTERPRISE_DELIVERY_ROOT:'/private/fixture/delivery'};
  const emptyEnv=join(out,'empty-compose.env');await writeFile(emptyEnv,'');
  const compose=JSON.parse(docker(['compose','--env-file',emptyEnv,'-f',join(serviceRoot,'deploy/linux/compose.example.yaml'),'config','--format','json'],{env:composeEnv}));
  for(const role of ['api','worker']){const s=compose.services[role];assert.equal(s.network_mode,'host');assert.equal(s.user,'1000:1000');assert.equal(s.read_only,true);assert.equal(s.image,release.imageId);assert.equal(s.restart,'no');assert.equal(s.environment.RUNTIME_ROLE,role);}
  const testContext=join(out,'acceptance-context');await mkdir(testContext,{recursive:true});
  await build({entryPoints:[join(serviceRoot,'tests/runtime.acceptance.ts')],outfile:join(testContext,'acceptance.mjs'),bundle:true,platform:'node',target:'node24',format:'esm',external:['pg']});
  await copyFile(join(serviceRoot,'deploy/linux/Dockerfile.acceptance'),join(testContext,'Dockerfile'));
  const testImage='naumi-enterprise-linux-test:'+suffix;
  const imageBuild=docker(['build','--platform','linux/amd64','--build-arg','POSTGRES_IMAGE='+POSTGRES_IMAGE,'--build-arg','RUNTIME_IMAGE='+release.image,'-t',testImage,testContext],{timeout:600000});
  await writeFile(join(out,'TEST_IMAGE_BUILD.log'),imageBuild);
  docker(['network','create','--internal','--label','naumi.fixture=enterprise-linux',network]);networkCreated=true;
  docker(['volume','create','--label','naumi.fixture=enterprise-linux',volume]);volumeCreated=true;
  ownRun(prefix,['--network',network,'--memory','512m','--cpus','2','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=runtime_fixture',POSTGRES_IMAGE],{POSTGRES_PASSWORD:password});
  let ready=false;for(let i=0;i<90;i++){try{docker(['exec',prefix,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await pause(500);}}assert(ready,'LINUX_POSTGRES_NOT_READY');
  // Root is used only on a new empty fixture volume, never an application launch or host directory.
  docker(['run','--rm','--network','none','--user','0:0','--mount',`type=volume,source=${volume},target=/scratch,volume-nocopy`,'--entrypoint','sh',release.imageId,'-c','chown 1000:1000 /scratch && chmod 700 /scratch']);
  const test=prefix+'-acceptance';
  ownRun(test,[...hardening,'--network','container:'+prefix,'--mount',`type=volume,source=${volume},target=/scratch,volume-nocopy`,'-e','NAUMI_VERIFY_ISOLATED_DB=1','-e','RUNTIME_TEST_DATABASE_URL','-e','RUNTIME_TEST_CONTAINER='+prefix,'-e','RUNTIME_BUNDLE_DIR=/app/dist','-e','NAUMI_RUNTIME_EVIDENCE_DIR=/scratch/evidence','-e','RUNTIME_TEST_NATIVE_PG=1','-e','RUNTIME_TEST_KEEP_SMOKE=1',testImage],{RUNTIME_TEST_DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:5432/runtime_fixture`});
  const exit=docker(['wait',test],{timeout:300000}),testLog=dockerLogs(test);await writeFile(join(out,'LINUX_PROCESS.log'),redact(testLog));console.log(redact(testLog));assert.equal(exit,'0','LINUX_PROCESS_FAILED');
  assert.equal(inspect(test).State.OOMKilled,false);assert(testLog.includes('checks=16'));
  docker(['cp',test+':/scratch/evidence',join(out,'evidence')]);
  const acceptance=JSON.parse(await readFile(join(out,'evidence/RUNTIME_ACCEPTANCE.json'),'utf8'));assert.equal(acceptance.releaseId,release.releaseId);assert.equal(acceptance.gitRevision,release.gitRevision);assert.equal(acceptance.passed,16);
  const smoke=await readFile(join(serviceRoot,'tests/linux-container-smoke.mjs'),'utf8');
  for(const role of ['api','worker']) {
    const name=prefix+'-'+role;
    ownRun(name,[...hardening,'--network','container:'+prefix,'--mount',`type=volume,source=${volume},target=/scratch,volume-nocopy`,'-e','RUNTIME_CONFIG=/scratch/smoke/runtime.json','-e','RUNTIME_ROLE='+role,release.imageId,role==='api'?'serve':'worker','--config','/scratch/smoke/runtime.json']);
    let ready=false;for(let i=0;i<80;i++){const state=inspect(name).State;if(!state.Running)throw Error('PRODUCTION_IMAGE_EARLY_EXIT '+redact(dockerLogs(name)));try{docker(['exec',name,'node','/app/healthcheck.mjs']);ready=true;break;}catch{await pause(250);}}assert(ready,'PRODUCTION_IMAGE_NOT_READY');
    const live=inspect(name);assert.equal(live.Config.User,'1000:1000');assert.equal(live.HostConfig.ReadonlyRootfs,true);assert.deepEqual(live.HostConfig.CapDrop,['ALL']);assert(live.HostConfig.SecurityOpt.includes('no-new-privileges:true'));assert.equal(live.HostConfig.PidsLimit,128);assert.equal(live.Image,release.imageId);
    assert.throws(()=>docker(['exec','-e','RUNTIME_ROLE='+(role==='api'?'worker':'api'),name,'node','/app/healthcheck.mjs']),'HEALTH_ROLE_MISMATCH_MUST_FAIL');
    assert(live.Mounts.every(m=>m.Type==='volume'&&m.Name===volume),'UNEXPECTED_MOUNT');assert.deepEqual(live.Config.Entrypoint,['node','--max-old-space-size=384','/app/dist/runtime.mjs']);
    const output=docker(['exec','-i',name,'node','--input-type=module'],{input:smoke});console.log(output);logs.push(output);
    assert.equal(docker(['wait',name],{timeout:30000}),'0');const ended=inspect(name);assert.equal(ended.State.OOMKilled,false);
    exits.push({role,imageId:ended.Image,user:ended.Config.User,readonly:ended.HostConfig.ReadonlyRootfs,exitCode:ended.State.ExitCode,oomKilled:ended.State.OOMKilled,publicPorts:ended.NetworkSettings.Ports,capDrop:ended.HostConfig.CapDrop,securityOpt:ended.HostConfig.SecurityOpt,memoryLimit:ended.HostConfig.Memory,pidsLimit:ended.HostConfig.PidsLimit});
    await writeFile(join(out,'CONTAINER_'+role+'.log'),redact(dockerLogs(name)+'\n'+output));
  }
  const image=docker(['image','inspect',release.imageId,'--format','{{json .Config}}']);assert(!image.includes(password));
  const report={release,linuxChecks:acceptance.passed,buildCwdReproducible:true,composeConfigValidated:true,healthRoleMismatchRejected:true,referenceLoad:acceptance.referenceLoad,containers:exits,networkInternal:JSON.parse(docker(['network','inspect',network]))[0].Internal,providerCalls:0,realCompanyBinding:false,realDatabaseTouched:false,productionReleased:false,capacityBoundary:'local Docker Linux containers, bounded fixture load; not target 4-core/8GiB combined Naumi capacity'};
  assert.equal(report.networkInternal,true);await writeFile(join(out,'LINUX_ACCEPTANCE.json'),JSON.stringify(report,null,2));
  success=true;console.log('LINUX_VERIFY_PASS: checks=16 runtime_image_api=1 runtime_image_worker=1 uid1000=1 readonly=1 config0600=1 no_socket=1 internal_network=1 persisted_bytes=1 graceful_exit0=2 provider_calls0=1');
} catch(e) {console.error(redact(e.message));process.exitCode=1;}
finally {
  for(const name of owned.reverse()) {try{const s=inspect(name);assert(s.Config.Labels['naumi.fixture']==='enterprise-linux'&&name.startsWith(prefix));docker(['rm','-f','-v',name]);}catch(e){console.error('LINUX_FIXTURE_CLEANUP_FAILED '+redact(e.message));process.exitCode=1;}}
  if(volumeCreated)try{docker(['volume','rm',volume]);}catch{process.exitCode=1;}
  if(networkCreated)try{docker(['network','rm',network]);}catch{process.exitCode=1;}
  console.log('LINUX_FIXTURE_CLEANUP: owned_only=1 acceptance='+Number(success)+' exit='+Number(process.exitCode||0));
}
