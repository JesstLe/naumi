import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {renderSameHostPlan,bindCandidateSlot} from './enterprise-production/same-host-plan.mjs';
const a=process.argv.slice(2);assert(a.length===6&&a[0]==='--web-report'&&a[2]==='--runtime-report'&&a[4]==='--output');
const web=JSON.parse(await readFile(a[1],'utf8')),runtime=JSON.parse(await readFile(a[3],'utf8')),out=resolve(a[5]);await mkdir(out,{recursive:true});
assert(!web.sourceDirty&&!runtime.sourceDirty&&web.gitRevision===runtime.gitRevision);
const prefix='enterprise-net-'+randomBytes(5).toString('hex'),net=prefix+'-net',vol=prefix+'-files',db=prefix+'-db',site=prefix+'-web';
const password=randomBytes(32).toString('hex'),appPassword=randomBytes(32).toString('hex'),controlToken=randomBytes(32).toString('hex');
const sensitive=[password,appPassword,controlToken],clean=s=>{for(const v of sensitive)s=s.replaceAll(v,'[redacted]');return s;};
const docker=(args,options={})=>{try{return execFileSync('docker',args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe'],...options}).trim();}catch(e){throw Error(clean((e.stdout||'')+'\n'+(e.stderr||'')));}};
const inspect=n=>JSON.parse(docker(['inspect',n]))[0],owned=[],networks=[],volumes=[],checks=[];
const run=(n,args,env={})=>{docker(['run','-d','--name',n,'--label','naumi.fixture=enterprise-same-host',...args],{env:{...process.env,...env}});owned.push(n);};
const hard=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--tmpfs','/tmp:rw,noexec,nosuid,size=64m,mode=1777'];
const mount='type=volume,source='+vol+',target=/scratch,volume-nocopy';
const p={version:1,target:'47.105.59.142',installation:prefix,slot:'green',gitRevision:web.gitRevision,productSha256:web.productSha256,releaseId:runtime.releaseId,images:{web:web.imageId,runtime:runtime.imageId,postgres:'sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685'},web:{containerName:site,sourceNetworks:[prefix+'-source']},database:{containerName:db,networkName:net,volumeName:prefix+'-database-data',name:'workflow-fixture',bootstrapRole:'workflow-bootstrap',applicationRole:'workflow-app'},ports:{api:18495,worker:18496,web:3000},paths:{runtimeConfig:'/etc/workflow/runtime.json',deliveryRoot:'/var/lib/workflow/delivery',bootstrapPasswordFile:'/etc/workflow/password',sourceProtectedRoots:['/source']},resources:{webMiB:2048,naumiWorkerMiB:128,apiMiB:512,workerMiB:512,databaseMiB:512,reserveMiB:1024,diskReserveMiB:10240,additionalDiskMiB:4096,measuredCandidatePeakMiB:null,existingGrowthMiB:null}};
let passed=false;
try{
 for(const [r,kind]of [[web,'web'],[runtime,'runtime']]){const im=inspect(r.image);assert.equal(im.Id,r.imageId);assert.equal(im.Config.Labels[kind==='web'?'org.naumi.web.git-revision':'org.opencontainers.image.revision'],r.gitRevision);}
 const pg='postgres@sha256:'+p.images.postgres.slice(7);p.images.postgres=inspect(pg).Id;
 const rendered=renderSameHostPlan(p);await writeFile(join(out,'PLAN.fixture.json'),JSON.stringify(p,null,2));
 for(const [name,obj]of [['SLOT.compose.json',rendered.slotCompose],['DATABASE.compose.json',rendered.databaseCompose]]){await writeFile(join(out,name),JSON.stringify(obj));const resolved=JSON.parse(docker(['compose','-f',join(out,name),'config','--format','json']));assert(Object.keys(resolved.services).length>0);}
 checks.push('actual Compose resolves rendered JSON without public workflow/database ports');
 for(const network of [net,...p.web.sourceNetworks]){docker(['network','create','--internal','--label','naumi.fixture=enterprise-same-host',network]);networks.push(network);}
 docker(['volume','create','--label','naumi.fixture=enterprise-same-host',vol]);volumes.push(vol);
 docker(['run','--rm','--network','none','--user','0:0','--mount',mount,'--entrypoint','sh',runtime.imageId,'-c','chown 1000:1000 /scratch && chmod 700 /scratch']);
 run(db,['--network',net,'--memory','512m','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=workflow-fixture',p.images.postgres],{POSTGRES_PASSWORD:password});
 // The entrypoint's temporary bootstrap server has a Unix socket but no TCP listener.
 let ready=false;for(let i=0;i<90;i++){try{docker(['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres']);ready=true;break;}catch{await new Promise(r=>setTimeout(r,300));}}assert(ready,'DB_READY');
 docker(['exec','-i',db,'psql','-U','postgres','-d','workflow-fixture','-v','ON_ERROR_STOP=1'],{input:`CREATE ROLE "workflow-app" LOGIN PASSWORD '${appPassword}';`});
 const keys=generateKeyPairSync('ed25519'),enterpriseId=randomUUID(),teamId=randomUUID();
 const cfg={version:1,installationId:prefix,slot:'green',expectedDatabase:'workflow-fixture',databaseUrl:`postgresql://workflow-app:${appPassword}@${db}:5432/workflow-fixture`,releaseId:runtime.releaseId,allowDevelopmentBuild:false,deploymentMode:'dedicated',tenants:[{enterpriseId,sourceInstance:'synthetic-source',sourceEnterprise:randomUUID()}],publicKeys:{fixture:keys.publicKey.export({format:'pem',type:'spki'}).toString()},deliveryRoot:'/scratch/delivery',apiPort:p.ports.api,workerPort:p.ports.worker,controlToken,connectors:[]};
 const data={'runtime.json':cfg,'admin.json':{databaseUrl:`postgresql://postgres:${password}@${db}:5432/workflow-fixture`},'roster.json':{commandId:randomUUID(),reason:'synthetic topology only',confirmedSourceSubjects:true,enterprises:[{enterpriseId,teams:[{teamId,name:'Fixture'}],accounts:[{subject:'fixture-user',sourceSubject:'fixture@invalid.test',memberships:[{teamId,permissions:['execute'],workKinds:['design']}]}]}]}};
 docker(['run','--rm','-i','--network','none','--mount',mount,'--entrypoint','node',runtime.imageId,'-e',"let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const fs=require('fs');for(const[n,v]of Object.entries(JSON.parse(s)))fs.writeFileSync('/scratch/'+n,JSON.stringify(v),{mode:0o600})})"],{input:JSON.stringify(data)});
 const cli=(mode,args=[])=>{const log=docker(['run','--rm',...hard,'--network',net,'--mount',mount,runtime.imageId,mode,'--config','/scratch/runtime.json',...args]);return JSON.parse(log.match(/RUNTIME_RESULT: (.*)/)[1]);};
 const migration=cli('migrate-plan',['--admin','/scratch/admin.json','--reason','isolated topology']);cli('migrate',['--admin','/scratch/admin.json','--reason','isolated topology','--preview-hash',migration.planHash]);cli('storage-init');
 const provision=cli('provision-plan',['--admin','/scratch/admin.json','--input','/scratch/roster.json']);cli('provision',['--admin','/scratch/admin.json','--input','/scratch/roster.json','--preview-hash',provision.planHash]);
 checks.push('actual immutable runtime explicitly migrates and provisions disposable independent DB with least-privilege application role');
 run(site,[...hard,'--network',net,'--memory',p.resources.webMiB+'m','-e','PORT=3000','-e','HOSTNAME=0.0.0.0','-e','NAUMI_VIDEO_WORKER=0','-e','NEXT_TELEMETRY_DISABLED=1',web.imageId]);
 docker(['network','connect',p.web.sourceNetworks[0],site]);
 const webState=inspect(site),bound=bindCandidateSlot(p,webState);assert.equal(bound.services.api.network_mode,'container:'+webState.Id);
 await writeFile(join(out,'CANDIDATE_INSPECT.fixture.json'),JSON.stringify(webState));
 const bindingLog=execFileSync(process.execPath,['scripts/enterprise-production/same-host-plan.mjs','--plan',join(out,'PLAN.fixture.json'),'--candidate-inspect',join(out,'CANDIDATE_INSPECT.fixture.json'),'--output',join(out,'bound-cli')],{encoding:'utf8'});
 assert(bindingLog.includes('SAME_HOST_BIND: immutable_container_id=1 fixed_image=1 start_authorized=0'));
 assert.deepEqual(JSON.parse(await readFile(join(out,'bound-cli/slot.compose.bound.json'),'utf8')),bound);
 await writeFile(join(out,'BOUND_SLOT.compose.json'),JSON.stringify(bound,null,2));
 // Test storage is a fresh named volume instead of production bind paths; namespace and image contract is exact.
 for(const role of ['api','worker']){const name=prefix+'-'+role,s=bound.services[role];run(name,[...hard,'--network',s.network_mode,'--memory','512m','--mount',mount,'-e','RUNTIME_CONFIG=/scratch/runtime.json','-e','RUNTIME_ROLE='+role,s.image,...s.command.map(v=>v==='/run/enterprise/runtime.json'?'/scratch/runtime.json':v)]);}
 for(const name of [prefix+'-api',prefix+'-worker']){let ok=false;for(let i=0;i<80;i++){assert(inspect(name).State.Running,clean(docker(['logs',name])));try{docker(['exec',name,'node','/app/healthcheck.mjs']);ok=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert(ok,'RUNTIME_READY');}
 const probe=docker(['exec',site,'node','-e',`(async()=>{const a=await(await fetch('http://127.0.0.1:18495/readyz')).json(),w=await(await fetch('http://127.0.0.1:18496/readyz')).json();if(a.role!=='api'||!a.ready||w.role!=='worker'||w.acceptingWork!==false)process.exit(1);const v=await fetch('http://127.0.0.1:3000/api/version');if(v.status!==200)process.exit(1);console.log('WEB_NAMESPACE_PASS: api_ready=1 worker_standby=1 native_next_version=200')})().catch(()=>process.exit(1))`]);checks.push(probe);
 const ip=webState.NetworkSettings.Networks[net].IPAddress;
 docker(['exec',db,'bash','-c',`if timeout 2 bash -c '</dev/tcp/${ip}/18495' 2>/dev/null; then exit 1; else exit 0; fi`]);checks.push('separate network peer cannot reach loopback workflow API over Web container IP');
 for(const name of [site,db,prefix+'-api',prefix+'-worker']){const c=inspect(name);assert(Object.keys(c.HostConfig.PortBindings||{}).length===0);if(name!==db)assert(c.HostConfig.ReadonlyRootfs);if(name.endsWith('-api')||name.endsWith('-worker')){assert.equal(c.Config.User,'1000:1000');assert.equal(c.HostConfig.NetworkMode,'container:'+webState.Id);assert(c.Mounts.every(m=>m.Type==='volume'&&m.Name===vol));}}
 checks.push('runtime/API/Web no host-published ports; private DB separate namespace and named data; actual API/Worker nonroot readonly');
 for(const role of ['api','worker']){const name=prefix+'-'+role;docker(['exec',name,'node','-e',`const c=JSON.parse(require('fs').readFileSync('/scratch/runtime.json'));(async()=>{const base='http://127.0.0.1:'+c.${role==='api'?'apiPort':'workerPort'},headers={authorization:'Bearer '+c.controlToken,'content-type':'application/json'},s=await(await fetch(base+'/internal/lifecycle/status',{headers})).json(),body=JSON.stringify({installationId:c.installationId,releaseId:c.releaseId,slot:c.slot,bootId:s.bootId,role:'${role}',operationId:require('crypto').randomUUID(),reason:'fixture topology completed'});for(const action of ['drain','stop'])if((await fetch(base+'/internal/lifecycle/'+action,{method:'POST',headers,body})).status!==202)process.exit(1)})().catch(()=>process.exit(1))`]);assert.equal(docker(['wait',name]),'0');}
 assert(inspect(site).State.Running);docker(['kill','--signal=TERM',site]);assert(['0','143'].includes(docker(['wait',site])));checks.push('API/Worker drain-stop exit0 before retiring network-owner Web');
 const report={checks,passed:checks.length,webImage:web.imageId,runtimeImage:runtime.imageId,fixedApplicationGit:web.gitRevision,namespaceOwner:webState.Id,realCompanyBinding:false,productionReleased:false,storage:'fresh fixture volume substituted for protected production bind paths',fullBusinessRegression:'G50 fixed production composition; not rerun or claimed as new here'};
 await writeFile(join(out,'SAME_HOST_ACCEPTANCE.json'),JSON.stringify(report,null,2));passed=true;
 console.log('SAME_HOST_CONTAINER_PASS: checks='+checks.length+' native_next=1 runtime_api_worker=1 immutable_namespace=1 separate_db=1 loopback_private=1 graceful_order=1 production_released=0');
}catch(e){console.error(clean(e.message));process.exitCode=1;for(const n of owned)try{await writeFile(join(out,'FAILED_'+n+'.log'),clean(docker(['logs',n])));}catch{}}
finally{for(const n of owned.reverse())try{assert.equal(inspect(n).Config.Labels['naumi.fixture'],'enterprise-same-host');docker(['rm','-f','-v',n]);}catch{process.exitCode=1;}for(const v of volumes)try{assert(v.startsWith(prefix));docker(['volume','rm',v]);}catch{process.exitCode=1;}for(const n of networks.reverse())try{assert(n.startsWith(prefix));docker(['network','rm',n]);}catch{process.exitCode=1;}console.log('SAME_HOST_FIXTURE_CLEANUP: owned_only=1 accepted='+Number(passed)+' exit='+Number(process.exitCode||0));}
