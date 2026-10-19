import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildEnterpriseWeb,root,WEB_NODE_IMAGE} from './build-enterprise-web.mjs';
import {startResourceSampler} from './enterprise-production/resource-metrics.mjs';
import {createProxyFixture} from './enterprise-production/proxy-fixture.mjs';
import {buildLinux,POSTGRES_IMAGE} from '../services/enterprise-workflow/build-linux.mjs';

const args=process.argv.slice(2);assert(args.length%2===0&&args.every((v,i)=>i%2||['--output','--allow-development','--web-report','--proxy','--baseline-report','--full-modules','--runtime-report','--measure-resources','--active-load'].includes(v)));
const options=Object.fromEntries(Array.from({length:args.length/2},(_,i)=>[args[i*2],args[i*2+1]]));assert(!options['--allow-development']||options['--allow-development']==='true');
assert(!options['--proxy']||options['--proxy']==='true');
assert(!options['--full-modules']||['true','false'].includes(options['--full-modules']));const fullModules=options['--full-modules']!=='false';
assert(!options['--baseline-report']||!fullModules,'CROSS_VERSION_FULL_SCHEMA_REQUIRES_COMPATIBLE_BASELINE');
const out=resolve(options['--output']||join(root,'output/enterprise-production'));await mkdir(out,{recursive:true});
const prefix='naumi-production-composition-'+randomBytes(6).toString('hex'),network=prefix+'-net',volume=prefix+'-data',password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),videoSecret=randomBytes(32).toString('hex');
const owned=[],sensitive=[password,secret,videoSecret];let netCreated=false,volumeCreated=false,success=false;
const clean=x=>sensitive.reduce((v,s)=>s?v.replaceAll(s,'[fixture-secret]'):v,String(x));
function docker(args,options={}){try{return execFileSync('docker',args,{encoding:'utf8',timeout:120000,stdio:['pipe','pipe','pipe'],...options}).trim();}catch(e){throw Error('DOCKER_STEP_FAILED '+args.slice(0,2).join(' ')+' '+clean(e.stdout||'')+' '+clean(e.stderr||''));}}
const logs=name=>{const r=spawnSync('docker',['logs',name],{encoding:'utf8',timeout:30000});assert.equal(r.status,0);return r.stdout+r.stderr;};
const inspect=name=>JSON.parse(docker(['inspect',name]))[0],pause=ms=>new Promise(r=>setTimeout(r,ms));
function run(name,args,env={}){docker(['run','-d','--name',name,'--label','naumi.fixture=enterprise-production-composition',...args],{env:{...process.env,...env}});owned.push(name);}
assert(!options['--measure-resources']||options['--measure-resources']==='true');
assert(!options['--active-load']||options['--active-load']==='true');const activeLoad=options['--active-load']==='true';assert(!activeLoad||options['--measure-resources']==='true'&&fullModules&&!options['--proxy'],'ACTIVE_LOAD_REQUIRES_FULL_MEASURED_COMPOSITION');
const measuring=options['--measure-resources']==='true';assert(!measuring||!options['--proxy'],'RESOURCE_PROXY_SEPARATE_EXPERIMENT');
const proxyRequested=()=>options['--proxy']==='true';
let proxy,resourceSampler,resourceReport;
let measuredWorkers=[];
const sandbox=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges:true','--pids-limit','192','--cpus','2','--tmpfs','/tmp:rw,noexec,nosuid,size=64m,mode=1777'];
try{
 const allowDevelopment=options['--allow-development']==='true';
 const web=options['--web-report']?JSON.parse(await readFile(resolve(options['--web-report']),'utf8')):await buildEnterpriseWeb({output:join(out,'web-build'),allowDevelopment});
 const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();assert(allowDevelopment||(!web.sourceDirty&&web.gitRevision===revision),'FIXED_WEB_SOURCE_REQUIRED');
 const webImage=JSON.parse(docker(['image','inspect',web.imageId]))[0];assert.equal(docker(['image','inspect',web.image,'--format','{{.Id}}']),web.imageId,'WEB_TAG_CHANGED');assert.equal(docker(['image','inspect',web.depsImage,'--format','{{.Id}}']),web.depsId,'DEPS_TAG_CHANGED');assert.equal(webImage.Config.Labels['org.naumi.web.git-revision'],web.gitRevision);assert.equal(webImage.Config.Labels['org.naumi.web.product-sha256'],web.productSha256);
 const runtime=options['--runtime-report']?JSON.parse(await readFile(resolve(options['--runtime-report']),'utf8')):await buildLinux({output:join(out,'runtime-build'),allowDevelopment});assert.equal(runtime.productSha256,web.productSha256);assert(allowDevelopment||!runtime.sourceDirty&&runtime.gitRevision===web.gitRevision);assert.equal(docker(['image','inspect',runtime.image,'--format','{{.Id}}']),runtime.imageId,'RUNTIME_TAG_CHANGED');const runtimeImage=JSON.parse(docker(['image','inspect',runtime.imageId]))[0];assert.equal(runtimeImage.Config.Labels['org.naumi.workflow.release'],runtime.releaseId);assert.equal(runtimeImage.Config.Labels['org.opencontainers.image.revision'],runtime.gitRevision);assert.equal(runtimeImage.Config.User,'1000:1000');
 const baseline=options['--baseline-report']?JSON.parse(await readFile(resolve(options['--baseline-report']),'utf8')):null;assert(!baseline||proxyRequested(),'BASELINE_REQUIRES_PROXY');
 const blueWeb=baseline?.web??web,blueRuntime=baseline?.runtime??runtime;for(const image of [blueWeb,blueRuntime]){assert.equal(docker(['image','inspect',image.image,'--format','{{.Id}}']),image.imageId,'BASELINE_IMAGE_CHANGED');if(baseline)assert(image.sourceDirty===false&&/^[a-f0-9]{40}$/.test(image.gitRevision));}assert.equal(blueWeb.productSha256,web.productSha256);assert.equal(blueRuntime.productSha256,runtime.productSha256);

 // Test-only source/dependencies layer. Actual services below use unmodified production images.
 const context=join(out,'acceptance-context');await mkdir(context,{recursive:true});
 const files=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of new Set(files)){if(!(file.startsWith('src/')||file.startsWith('scripts/')||file.startsWith('services/enterprise-workflow/src/')||file.startsWith('services/enterprise-workflow/tests/')||['package.json','tsconfig.json','services/enterprise-workflow/package.json','docs/apimart-image25-pricing-20261008.json'].includes(file)))continue;assert(!file.split('/').includes('..'));const target=join(context,file);await mkdir(resolve(target,'..'),{recursive:true});await copyFile(join(root,file),target);}
 await copyFile(join(root,'scripts/enterprise-production/Dockerfile.acceptance'),join(context,'Dockerfile'));
 if(options['--proxy']==='true'){proxy=createProxyFixture({docker,run,inspect,logs,prefix,out,sensitive,sandbox});await proxy.prepare(runtime.imageId);}
 const testImage=prefix+'-test';docker(['build','--platform','linux/amd64','--build-arg','NODE_IMAGE='+WEB_NODE_IMAGE,'--build-arg','DEPS_IMAGE='+web.depsImage,'--build-arg','WEB_IMAGE='+blueWeb.image,'--build-arg','RUNTIME_IMAGE='+blueRuntime.image,'-t',testImage,context],{timeout:600000});
 docker(['network','create','--internal','--label','naumi.fixture=enterprise-production-composition',network]);netCreated=true;docker(['volume','create','--label','naumi.fixture=enterprise-production-composition',volume]);volumeCreated=true;
 run(prefix,['--network',network,'--memory','512m','--cpus','2','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=source_composition',POSTGRES_IMAGE],{POSTGRES_PASSWORD:password});
 let dbReady=false;for(let i=0;i<90;i++){try{docker(['exec',prefix,'pg_isready','-h','127.0.0.1','-U','postgres']);dbReady=true;break;}catch{await pause(500);}}assert(dbReady);
 const mount=`type=volume,source=${volume},target=/app/output,volume-nocopy`;
 docker(['run','--rm','--network','none','--user','0:0','--mount',mount,'--entrypoint','sh',runtime.imageId,'-c','chown 1000:1000 /app/output && chmod 700 /app/output']);
 const driver=prefix+'-driver',api=prefix+'-runtime',site=prefix+'-web';
 const driverEnv={...proxy?.extraEnv,NAUMI_VERIFY_ISOLATED_DB:'1',DATABASE_URL:`postgresql://postgres:${password}@127.0.0.1:5432/source_composition`,SETTINGS_SECRET:secret,VIDEO_WORKER_SECRET:videoSecret,NAUMI_VIDEO_WORKER:'0',NAUMI_MULTI_USER:'1',NAUMI_COMPOSITION_FULL_MODULES:fullModules?'1':'0',NAUMI_COMPOSITION_ACTIVE_LOAD:activeLoad?'1':'0',NAUMI_COMPOSITION_EXTERNAL_SERVICES:'1',NAUMI_COMPOSITION_WEB_REVISION:blueWeb.gitRevision,NAUMI_COMPOSITION_EVIDENCE_DIR:'/app/output/evidence',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',SMTP_HOST:'',NEXT_TELEMETRY_DISABLED:'1'};
 // Evidence directory is explicitly created as the unprivileged volume owner.
 docker(['run','--rm','--network','none','--mount',mount,'--entrypoint','node',runtime.imageId,'-e',"require('fs').mkdirSync('/app/output/evidence',{recursive:true})"]);
 run(driver,[...sandbox,'--user','1000:1000','--memory','1024m','--network','container:'+prefix,'--mount',mount,...(proxy?['--mount',proxy.driverMount]:[]),...Object.keys(driverEnv).flatMap(k=>['-e',k]),testImage],driverEnv);
 let boot=false;for(let i=0;i<240;i++){if(logs(driver).includes('COMPOSITION_BOOTSTRAP_READY')){boot=true;break;}assert(inspect(driver).State.Running,clean(logs(driver)));await pause(500);}assert(boot,'DRIVER_BOOTSTRAP_TIMEOUT');
 const metadata=JSON.parse(docker(['exec',driver,'node','-e',"process.stdout.write(require('fs').readFileSync('/app/output/composition/bootstrap.json'))"]));
 const webConfig=JSON.parse(docker(['exec',driver,'node','-e',"process.stdout.write(require('fs').readFileSync('/app/output/composition/web.json'))"]));sensitive.push(webConfig.NAUMI_WORKFLOW_SIGNING_KEY);
 const runtimeConfig=JSON.parse(docker(['exec',driver,'node','-e',"process.stdout.write(require('fs').readFileSync('/app/output/composition/runtime.json'))"]));sensitive.push(runtimeConfig.controlToken,new URL(runtimeConfig.databaseUrl).password);
 run(api,[...sandbox,'--user','1000:1000','--memory','512m','--network','container:'+prefix,'--mount',mount,'-e','RUNTIME_CONFIG='+metadata.configPath,blueRuntime.imageId,'serve','--config',metadata.configPath]);
 let webEnv={...Object.fromEntries(Object.entries(webConfig).filter(([k])=>k==='DATABASE_URL'||k.startsWith('NAUMI_'))),SETTINGS_SECRET:secret,VIDEO_WORKER_SECRET:videoSecret,NAUMI_VIDEO_WORKER:'0',NAUMI_MULTI_USER:'1',PORT:String(metadata.webPort),HOSTNAME:'127.0.0.1',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',SMTP_HOST:'',MEDIA_DIR:'/data/media',NODE_OPTIONS:'--max-old-space-size=1024'};
 if(activeLoad)webEnv={...webEnv,NAUMI_INSTANCE_ID:site,SOURCE_COMMIT:blueWeb.gitRevision};
 if(proxy)webEnv=proxy.webEnvironment(webEnv,metadata,'blue',!!baseline);
 run(site,[...sandbox,'--memory','1536m','--network','container:'+prefix,'--tmpfs','/data:rw,nosuid,size=64m,uid=1001,gid=1001,mode=700',...Object.keys(webEnv).flatMap(k=>['-e',k]),blueWeb.imageId,...(proxy?['node','--require','/app/scripts/release-http-observer.cjs','server.js']:[])],webEnv);
 if(measuring){
  const wfWorker=prefix+'-workflow-worker',naumiWorker=prefix+'-naumi-worker';
  run(wfWorker,[...sandbox,'--user','1000:1000','--memory','512m','--network','container:'+prefix,'--mount',mount,'-e','RUNTIME_CONFIG='+metadata.configPath,'-e','RUNTIME_ROLE=worker',blueRuntime.imageId,'worker','--config',metadata.configPath]);
  const workerEnv={NAUMI_APP_ORIGIN:'http://127.0.0.1:'+metadata.webPort,VIDEO_WORKER_SECRET:videoSecret,SOURCE_COMMIT:blueWeb.gitRevision,NAUMI_INSTANCE_ID:naumiWorker,NAUMI_WORKER_RELEASE_CONTROL:'1',NAUMI_WORKER_START_PAUSED:'1',VIDEO_WORKER_INTERVAL_MS:activeLoad?'5000':'15000',NAUMI_WORKER_TARGET_INSTANCE_ID:site,NAUMI_WORKER_CONTROL_PORT:String(metadata.naumiWorkerPort),NAUMI_WORKER_STATE_FILE:'/tmp/worker/state.json',NODE_OPTIONS:'--max-old-space-size=64'};
  run(naumiWorker,[...sandbox,'--memory','128m','--network','container:'+prefix,...Object.keys(workerEnv).flatMap(k=>['-e',k]),blueWeb.imageId,'node','scripts/video-worker.mjs'],workerEnv);
  measuredWorkers=[wfWorker,naumiWorker];
  const targets=[[site,'web'],[api,'workflow-api'],[wfWorker,'workflow-worker-standby'],[naumiWorker,'naumi-worker-paused'],[prefix,'postgres-source-and-workflow-fixture']].map(([name,role])=>{const c=inspect(name);return {id:c.Id,imageId:c.Image,role};});
  resourceSampler=await startResourceSampler({targets,out});
 }
 let servicesReady=false;for(let i=0;i<240;i++){assert(inspect(site).State.Running,clean(logs(site)));assert(inspect(api).State.Running,clean(logs(api)));try{docker(['exec',driver,'node','-e',`Promise.all([fetch('http://127.0.0.1:${metadata.apiPort}/readyz'),fetch('http://127.0.0.1:${metadata.webPort}/api/version')]).then(rs=>{if(rs.some(r=>r.status!==200))process.exit(1)}).catch(()=>process.exit(1))`]);servicesReady=true;break;}catch{await pause(500);}}assert(servicesReady);
 if(proxy)await proxy.start({driverName:driver,metadata,web,runtime,blueWeb,blueRuntime,webConfiguration:webConfig,runtimeConfiguration:runtimeConfig,webEnv,mount,networkContainer:prefix});
 if(measuring){
  let ready=false;for(let i=0;i<80;i++){try{docker(['exec',measuredWorkers[0],'node','/app/healthcheck.mjs']);docker(['exec','-e','NODE_OPTIONS=',site,'node','-e',`(async()=>{const r=await fetch('http://127.0.0.1:${metadata.naumiWorkerPort}/status',{headers:{'x-video-worker-secret':process.env.VIDEO_WORKER_SECRET}});if(r.status!==200)process.exit(1);const s=await r.json();if(!s.paused||s.activeTicks!==0)process.exit(1)})().catch(()=>process.exit(1))`]);ready=true;break;}catch{await pause(250);}}assert(ready,'MEASUREMENT_WORKERS_NOT_STANDBY');
 }
 docker(['exec',driver,'node','-e',"require('fs').writeFileSync('/app/output/composition/services-ready','1')"]);
 if(proxy)await proxy.exercise();
 const exit=docker(['wait',driver],{timeout:720000}),driverLog=logs(driver);await writeFile(join(out,'DRIVER.log'),clean(driverLog));console.log(clean(driverLog));assert.equal(exit,'0');assert.equal(inspect(driver).State.OOMKilled,false);
 docker(['cp',driver+':/app/output/evidence',join(out,'evidence')]);const acceptance=JSON.parse(await readFile(join(out,'evidence/COMPOSITION_ACCEPTANCE.json'),'utf8'));assert.equal(acceptance.passed,fullModules?(proxy?44:activeLoad?42:41):(proxy?13:10));assert.equal(acceptance.fullModules,fullModules);assert.equal(acceptance.productionWebImage,true);assert.equal(acceptance.runtimeReleaseId,blueRuntime.releaseId);assert.equal(acceptance.webGitRevision,blueWeb.gitRevision);
 if(resourceSampler){resourceReport=await resourceSampler.finish();resourceSampler=undefined;assert(resourceReport.containers.every(c=>c.oomKillsSinceContainerStart===0));resourceReport.headerLatency=acceptance.headerLatency;resourceReport.workload=activeLoad?'full42 checks including eight native users and active workers':'full41 sequential acceptance; workers paused/standby';resourceReport.concurrentWorkers=acceptance.concurrentWorkers??null;resourceReport.missingCoverage=[...(!activeLoad?['active-worker ticks']:[]),'paid provider work','long peak-hour load','dual-slot overlap','target47 combined workload'];await writeFile(join(out,'RESOURCE_MEASUREMENT.json'),JSON.stringify(resourceReport,null,2));}
 if(measuring){
  const workerStop=`const c=JSON.parse(require('fs').readFileSync('${metadata.configPath}'));(async()=>{const base='http://127.0.0.1:'+c.workerPort,headers={authorization:'Bearer '+c.controlToken,'content-type':'application/json'},s=await(await fetch(base+'/internal/lifecycle/status',{headers})).json(),body=JSON.stringify({installationId:c.installationId,releaseId:c.releaseId,slot:c.slot,bootId:s.bootId,role:'worker',operationId:require('crypto').randomUUID(),reason:'resource fixture completion'});for(const action of ['drain','stop'])if((await fetch(base+'/internal/lifecycle/'+action,{method:'POST',headers,body})).status!==202)process.exit(1)})().catch(()=>process.exit(1))`;
  docker(['exec',measuredWorkers[0],'node','-e',workerStop]);assert.equal(docker(['wait',measuredWorkers[0]]),'0');docker(['kill','--signal=TERM',measuredWorkers[1]]);assert.equal(docker(['wait',measuredWorkers[1]]),'0');
 }

 assert.equal(docker(['exec','-e','NODE_OPTIONS=',site,'node','-p','process.getuid()']),'1001');assert.equal(docker(['exec',api,'node','-p','process.getuid()']),'1000');
 const proxyReport=proxy?await proxy.finish():null;
 const observed=[site,api].map(name=>{const c=inspect(name);assert(c.HostConfig.ReadonlyRootfs);assert(Object.keys(c.HostConfig.PortBindings||{}).length===0);assert(Object.values(c.NetworkSettings.Ports||{}).every(v=>v===null));assert(c.HostConfig.SecurityOpt.includes('no-new-privileges:true'));assert.deepEqual(c.HostConfig.CapDrop,['ALL']);assert(!c.Mounts.some(m=>m.Source?.includes('docker.sock')));return {name:name===site?'web':'workflow',imageId:c.Image,user:c.Config.User,memoryLimit:c.HostConfig.Memory,readOnly:c.HostConfig.ReadonlyRootfs,publicPorts:c.NetworkSettings.Ports};});assert.equal(observed[0].imageId,blueWeb.imageId);assert.equal(observed[1].imageId,blueRuntime.imageId);
 // No force stop on the successful path: use the workflow protocol and normal Web SIGTERM.
 const stopScript=`const c=JSON.parse(require('fs').readFileSync('${metadata.configPath}'));(async()=>{const base='http://127.0.0.1:'+c.apiPort,h={authorization:'Bearer '+c.controlToken,'content-type':'application/json'},s=await(await fetch(base+'/internal/lifecycle/status',{headers:h})).json(),body=JSON.stringify({installationId:c.installationId,releaseId:c.releaseId,slot:c.slot,bootId:s.bootId,role:'api',operationId:require('crypto').randomUUID(),reason:'isolated composition completion'});for(const action of ['drain','stop']){const r=await fetch(base+'/internal/lifecycle/'+action,{method:'POST',headers:h,body});if(r.status!==202)process.exit(1)}})().catch(()=>process.exit(1))`;
 docker(['exec',api,'node','-e',stopScript]);assert.equal(docker(['wait',api],{timeout:30000}),'0');docker(['kill','--signal=TERM',site]);const webExit=docker(['wait',site],{timeout:30000});assert(['0','143'].includes(webExit),'WEB_EXIT_'+webExit);assert(!inspect(site).State.OOMKilled);assert(!inspect(api).State.OOMKilled);
 for(const [name,file] of [[site,'WEB_PROCESS.log'],[api,'RUNTIME_PROCESS.log']])await writeFile(join(out,file),clean(logs(name)));
 const internalNetwork=JSON.parse(docker(['network','inspect',network]))[0].Internal;assert.equal(internalNetwork,true);
 const report={resourceMeasurement:resourceReport??null,fullModules,web,runtime,baseline:baseline?{web:blueWeb,runtime:blueRuntime}:null,acceptance,proxy:proxyReport,containers:observed,webExit:Number(webExit),runtimeExit:0,internalNetwork,sourceAndWorkflowDatabasesSeparate:true,providerCalls:0,productionReleased:false,realCompanyBinding:false,capacityBoundary:'bounded Docker fixture, not target4core8GiB combined load or public blue-green'};await writeFile(join(out,'PRODUCTION_COMPOSITION.json'),JSON.stringify(report,null,2));success=true;
 console.log('PRODUCTION_COMPOSITION_PASS: standalone_web=1 linux_runtime=1 actual_images='+new Set([web.imageId,runtime.imageId,blueWeb.imageId,blueRuntime.imageId]).size+' native_login=1 checks='+acceptance.passed+' original_html=1 source_logs=1 persisted_delivery=1 nonroot=1 readonly=1 internal_network=1 provider_calls0=1');
}catch(e){
 console.error(clean(e.message));process.exitCode=1;
 for(const name of owned)try{const log=clean(logs(name));await writeFile(join(out,'FAILED_'+name.slice(prefix.length)+'.log'),log);if(name.endsWith('-web'))console.error(log.split('\n').slice(-22).join('\n'));}catch{}
}
finally{
 if(resourceSampler)try{await resourceSampler.cancel();}catch{process.exitCode=1;}
 for(const name of owned.reverse())try{const c=inspect(name);assert(c.Config.Labels['naumi.fixture']==='enterprise-production-composition'&&name.startsWith(prefix));docker(['rm','-f','-v',name]);}catch(e){console.error('PRODUCTION_FIXTURE_CLEANUP_FAILED '+clean(e.message));process.exitCode=1;}
 if(proxy)try{proxy.cleanup();}catch{process.exitCode=1;}
 if(volumeCreated)try{docker(['volume','rm',volume]);}catch{process.exitCode=1;}if(netCreated)try{docker(['network','rm',network]);}catch{process.exitCode=1;}
 console.log('PRODUCTION_FIXTURE_CLEANUP: owned_only=1 accepted='+Number(success)+' exit='+Number(process.exitCode||0));
}
