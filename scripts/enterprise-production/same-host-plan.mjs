import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {posix,resolve} from 'node:path';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export const LOCKS=['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const label=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{2,62}$/.test(v);
const networkName=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{1,127}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const image=v=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const absolute=v=>typeof v==='string'&&/^\/[A-Za-z0-9_./-]+$/.test(v)&&posix.normalize(v)===v&&!v.includes('/../')&&v!=='/';
const overlaps=(a,b)=>a===b||a.startsWith(b+'/')||b.startsWith(a+'/');
const fields=(v,keys)=>assert(v&&Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).every(k=>keys.includes(k)),'UNKNOWN_PLAN_FIELD');

/** Pure renderer: no Docker/SSH/process calls, credentials or implicit migration. */
export function renderSameHostPlan(p){
 fields(p,['version','target','installation','slot','gitRevision','productSha256','releaseId','images','web','database','ports','paths','resources']);
 assert(p.version===1&&p.target==='47.105.59.142','TARGET47_REQUIRED');
 assert(label(p.installation)&&label(p.slot)&&/^[a-f0-9]{40}$/.test(p.gitRevision)&&/^[a-f0-9]{64}$/.test(p.productSha256)&&/^[a-f0-9]{64}$/.test(p.releaseId),'FIXED_RELEASE_REQUIRED');
 fields(p.images,['web','runtime','postgres']);assert(Object.values(p.images).length===3&&Object.values(p.images).every(image),'IMMUTABLE_IMAGES_REQUIRED');
 fields(p.web,['containerName','sourceNetworks']);assert(label(p.web.containerName)&&Array.isArray(p.web.sourceNetworks)&&p.web.sourceNetworks.length>=1&&p.web.sourceNetworks.every(networkName),'WEB_NETWORK_REQUIRED');
 fields(p.database,['containerName','networkName','volumeName','name','bootstrapRole','applicationRole']);
 assert(['containerName','networkName','volumeName','name','bootstrapRole','applicationRole'].every(k=>label(p.database[k])),'DATABASE_IDENTITY_REQUIRED');
 assert(p.database.bootstrapRole!==p.database.applicationRole&&p.database.containerName!==p.web.containerName&&!p.web.sourceNetworks.includes(p.database.networkName),'INDEPENDENT_DATABASE_REQUIRED');
 fields(p.ports,['api','worker','web']);assert(Object.values(p.ports).length===3&&Object.values(p.ports).every(x=>integer(x)&&x>=1024&&x<=65535)&&new Set(Object.values(p.ports)).size===3,'DISTINCT_PORTS_REQUIRED');
 fields(p.paths,['runtimeConfig','deliveryRoot','bootstrapPasswordFile','sourceProtectedRoots','importRoot']);
 for(const k of ['runtimeConfig','deliveryRoot','bootstrapPasswordFile'])assert(absolute(p.paths[k]),'ABSOLUTE_LINUX_PATH_REQUIRED');
 assert(Array.isArray(p.paths.sourceProtectedRoots)&&p.paths.sourceProtectedRoots.length>0&&p.paths.sourceProtectedRoots.every(absolute),'SOURCE_ROOTS_REQUIRED');
 const privatePaths=[p.paths.runtimeConfig,p.paths.deliveryRoot,p.paths.bootstrapPasswordFile,...(p.paths.importRoot?[p.paths.importRoot]:[])];
 if(p.paths.importRoot)assert(absolute(p.paths.importRoot),'IMPORT_ROOT_INVALID');
 for(let i=0;i<privatePaths.length;i++){
  assert(!p.paths.sourceProtectedRoots.some(r=>overlaps(r,privatePaths[i])),'SOURCE_STORAGE_OVERLAP');
  assert(!privatePaths.slice(i+1).some(r=>overlaps(r,privatePaths[i])),'PRIVATE_PATH_OVERLAP');
 }
 fields(p.resources,['webMiB','naumiWorkerMiB','apiMiB','workerMiB','databaseMiB','reserveMiB','diskReserveMiB','additionalDiskMiB','measuredCandidatePeakMiB','existingGrowthMiB']);
 for(const k of ['webMiB','naumiWorkerMiB','apiMiB','workerMiB','databaseMiB','reserveMiB','diskReserveMiB','additionalDiskMiB'])assert(integer(p.resources[k])&&p.resources[k]>0,'RESOURCE_BUDGET_REQUIRED');
 assert(p.resources.reserveMiB>=1024&&p.resources.diskReserveMiB>=10240,'HOST_RESERVE_REQUIRED');
 for(const k of ['measuredCandidatePeakMiB','existingGrowthMiB'])assert(p.resources[k]===null||integer(p.resources[k]),'MEASURED_PEAK_OR_NULL_REQUIRED');
 const planSha256=hash(JSON.stringify(p));
 const labels={'org.naumi.workflow.installation':p.installation,'org.naumi.workflow.slot':p.slot,'org.naumi.workflow.plan':planSha256};
 const bind=(source,target,readOnly)=>({type:'bind',source,target,read_only:readOnly,bind:{create_host_path:false}});
 const common={image:p.images.runtime,network_mode:'container:'+p.web.containerName,user:'1000:1000',read_only:true,init:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],pids_limit:128,cpus:1,restart:'no',stop_grace_period:'10m',tmpfs:['/tmp:rw,noexec,nosuid,size=64m,mode=1777'],labels,
  volumes:[bind(p.paths.runtimeConfig,'/run/enterprise/runtime.json',true),bind(p.paths.deliveryRoot,'/var/lib/naumi-enterprise/delivery',false),...(p.paths.importRoot?[bind(p.paths.importRoot,'/var/lib/naumi-enterprise/imports',true)]:[])]};
 const slotCompose={name:p.installation+'-'+p.slot,services:{
  api:{...common,mem_limit:p.resources.apiMiB+'m',command:['serve','--config','/run/enterprise/runtime.json'],environment:{RUNTIME_CONFIG:'/run/enterprise/runtime.json',RUNTIME_ROLE:'api'}},
  worker:{...common,mem_limit:p.resources.workerMiB+'m',command:['worker','--config','/run/enterprise/runtime.json'],environment:{RUNTIME_CONFIG:'/run/enterprise/runtime.json',RUNTIME_ROLE:'worker'}}}};
 const databaseCompose={name:p.installation+'-database',services:{database:{image:p.images.postgres,container_name:p.database.containerName,restart:'no',mem_limit:p.resources.databaseMiB+'m',cpus:1,pids_limit:128,security_opt:['no-new-privileges:true'],environment:{POSTGRES_DB:p.database.name,POSTGRES_USER:p.database.bootstrapRole,POSTGRES_PASSWORD_FILE:'/run/secrets/database-bootstrap'},
  volumes:[{type:'volume',source:'database',target:'/var/lib/postgresql/data',volume:{nocopy:true}},bind(p.paths.bootstrapPasswordFile,'/run/secrets/database-bootstrap',true)],
  networks:{workflow:{aliases:[p.database.containerName]}},healthcheck:{test:['CMD','pg_isready','-h','127.0.0.1','-U',p.database.bootstrapRole,'-d',p.database.name],interval:'10s',timeout:'5s',retries:6},labels:{'org.naumi.workflow.installation':p.installation}}},
  networks:{workflow:{name:p.database.networkName,internal:true}},volumes:{database:{name:p.database.volumeName}}};
 return {planSha256,slotCompose,databaseCompose,contract:{webContainer:p.web.containerName,webImage:p.images.web,webNetworks:[...p.web.sourceNetworks,p.database.networkName],webServiceUrl:'http://127.0.0.1:'+p.ports.api,workerControlUrl:'http://127.0.0.1:'+p.ports.worker,workflowDatabaseHost:p.database.containerName,workflowDatabaseName:p.database.name,workflowApplicationRole:p.database.applicationRole,requiredLocks:LOCKS,
  candidateWebCreatedBy:'existing-full-site-blue-green-controller',candidateIdBindingRequired:true,slotRetirementOrder:['drain-web-and-workflow','verify-all-inflight-zero','stop-workflow-api-and-worker','retire-web-network-owner'],automaticMigrations:false,automaticPilotApply:false,sourceWrites:false,startAuthorized:false}};
}

/** Bind after the outer controller creates and inspects its candidate, never by a reusable name. */
export function bindCandidateSlot(p,c){
 const r=renderSameHostPlan(p);
 assert(c?.Name==='/'+p.web.containerName&&/^[a-f0-9]{64}$/.test(c.Id||'')&&c.Image===p.images.web&&c.State?.Running===true,'CANDIDATE_IDENTITY_MISMATCH');
 assert(c.Config?.Labels?.['org.naumi.web.git-revision']===p.gitRevision&&c.Config?.Labels?.['org.naumi.web.product-sha256']===p.productSha256,'CANDIDATE_LABEL_MISMATCH');
 assert(r.contract.webNetworks.every(n=>Object.hasOwn(c.NetworkSettings?.Networks||{},n)),'CANDIDATE_NETWORK_MISSING');
 assert(c.HostConfig?.ReadonlyRootfs===true&&c.Config?.User==='nextjs','CANDIDATE_HARDENING_MISMATCH');
 assert(c.HostConfig.Memory===p.resources.webMiB*1048576,'CANDIDATE_MEMORY_LIMIT_MISMATCH');
 assert(c.HostConfig.NetworkMode!=='host'&&c.HostConfig.NetworkMode!=='none','CANDIDATE_NETWORK_MODE_INVALID');
 for(const [port,bindings]of Object.entries(c.HostConfig.PortBindings||{}))assert(port===p.ports.web+'/tcp'&&Array.isArray(bindings)&&bindings.every(b=>b.HostIp==='127.0.0.1'),'CANDIDATE_PUBLIC_OR_WORKFLOW_PORT');
 for(const service of Object.values(r.slotCompose.services)){service.network_mode='container:'+c.Id;service.labels={...service.labels,'org.naumi.workflow.network-owner':c.Id};}
 return r.slotCompose;
}

/** Separate historical debt from the observed completed successor. No new authorization. */
export function assessReleaseHistory(s){
 const closed=s?.lifecycle?.status==='COMPLETE'&&s.lifecycle.phase==='COMPLETE'&&integer(s.lifecycle.revision);
 const zeroDrain=s?.closureFacts?.legacyDrainProven===true&&['acceptedTasks','agentSessions','legacyActiveTicks'].every(k=>s.closureFacts[k]===0);
 const e=s?.successorEvidence;
 if(closed&&zeroDrain&&!e?.present)return {currentReleaseStatus:'COMPLETE',historicalDebt:false,nextReleaseAuthorized:false,blockers:[]};
 const verified=e?.present===true&&e.verified===true&&Array.isArray(e.errors)&&e.errors.length===0&&e.phase==='COMPLETE'&&e.releaseId==='release47-alldev-20261018'&&e.retiredCount===2&&e.historicalDrainProven===false&&e.historicalIncidents===2&&e.nextReleaseAuthorized===false&&e.artifacts?.length>=5&&['web','worker'].every(role=>s.containers?.some(c=>c.id===e.identities?.[role]?.id&&c.imageId===e.imageId&&c.running===true));
 if(verified)return {currentReleaseStatus:'COMPLETE_WITH_PRESERVED_INCIDENTS',releaseId:e.releaseId,historicalDebt:true,historicalDrainProven:false,nextReleaseAuthorized:false,blockers:['NEXT_RELEASE_INCIDENT_DISPOSITION_REQUIRED']};
 return {currentReleaseStatus:e?.present?'SUCCESSOR_UNVERIFIED':'UNRESOLVED',historicalDebt:true,nextReleaseAuthorized:false,blockers:[...(e?.present?['SUCCESSOR_EVIDENCE_NOT_VERIFIED']:[]),...(!closed?['EXISTING_RELEASE_NOT_CLOSED']:[]),...(!zeroDrain?['LEGACY_DRAIN_UNKNOWN_OR_NONZERO']:[])]};
}

/** Advisory preflight. Freshness and immutable IDs bind a report, never authorize launch. */
export function assessSameHostPlan(p,s,now=Date.now()){
 const rendered=renderSameHostPlan(p),blockers=[];
 const check=(ok,code)=>{if(!ok&&!blockers.includes(code))blockers.push(code);};
 check(s?.version===1&&s.target===p.target&&s.evidenceMode==='live'&&/^[a-f0-9]{64}$/.test(s.machineIdSha256||''),'LIVE_HOST_IDENTITY_REQUIRED');
 const age=now-Date.parse(s?.observedAt);check(Number.isFinite(age)&&age>=-5000&&age<=120000,'OBSERVATION_STALE');
 const releaseAssessment=assessReleaseHistory(s);blockers.push(...releaseAssessment.blockers);
 check(Array.isArray(s?.deploymentLocks)&&s.deploymentLocks.length===3&&LOCKS.every(path=>s.deploymentLocks.some(x=>x.path===path&&x.held===false)),'DEPLOYMENT_LOCKS_HELD_OR_UNKNOWN');
 const samples=s?.samples;check(Array.isArray(samples)&&samples.length>=2,'RESOURCE_SAMPLES_MISSING');
 const valid=Array.isArray(samples)&&samples.length>=2&&samples.every(x=>integer(x.availableMiB)&&integer(x.rootFreeMiB)&&integer(x.dockerFreeMiB)&&Number.isFinite(x.load1)&&integer(x.cpus)&&x.cpus>0&&Number.isFinite(Date.parse(x.at)))&&Date.parse(samples.at(-1).at)-Date.parse(samples[0].at)>=5000&&samples.every(x=>now-Date.parse(x.at)>=-5000&&now-Date.parse(x.at)<=120000);
 check(valid,'RESOURCE_SAMPLE_WINDOW_INVALID');
 const r=p.resources,limits=r.webMiB+r.naumiWorkerMiB+r.apiMiB+r.workerMiB+r.databaseMiB;
 check(integer(r.measuredCandidatePeakMiB)&&r.measuredCandidatePeakMiB>0,'CANDIDATE_COMBINED_PEAK_UNMEASURED');
 check(integer(r.existingGrowthMiB),'EXISTING_LOAD_GROWTH_UNMEASURED');
 const candidateBudget=Math.max(limits,r.measuredCandidatePeakMiB||0),requiredMiB=candidateBudget+r.reserveMiB+(r.existingGrowthMiB||0);
 if(valid){check(Math.min(...samples.map(x=>x.availableMiB))>=requiredMiB,'INSUFFICIENT_DUAL_SLOT_RAM');check(Math.min(...samples.map(x=>Math.min(x.rootFreeMiB,x.dockerFreeMiB)))>=r.diskReserveMiB+r.additionalDiskMiB,'INSUFFICIENT_DISK_HEADROOM');check(samples.every(x=>x.load1<=x.cpus),'HOST_CPU_BUSY');}
 check(Array.isArray(s?.containers),'CONTAINER_INVENTORY_MISSING');
 const containers=Array.isArray(s?.containers)?s.containers:[];
 check(!containers.some(x=>[p.web.containerName,p.database.containerName].includes(x.name)),'PLANNED_CONTAINER_NAME_EXISTS');
 check(Array.isArray(s?.volumes)&&!s.volumes.includes(p.database.volumeName),'PLANNED_DATABASE_VOLUME_EXISTS');
 check(Array.isArray(s?.networks)&&!s.networks.includes(p.database.networkName),'PLANNED_DATABASE_NETWORK_EXISTS');
 check(Array.isArray(s?.images),'IMAGE_INVENTORY_MISSING');
 for(const kind of ['web','runtime','postgres'])check(s?.images?.some(x=>x.id===p.images[kind]),'FIXED_'+kind.toUpperCase()+'_IMAGE_NOT_LOADED');
 for(const kind of ['web','runtime']){const im=s?.images?.find(x=>x.id===p.images[kind]);if(!im)continue;check(im.gitRevision===p.gitRevision,'FIXED_'+kind.toUpperCase()+'_REVISION_MISMATCH');if(kind==='runtime')check(im.releaseId===p.releaseId,'FIXED_RUNTIME_RELEASE_MISMATCH');else check(im.productSha256===p.productSha256,'FIXED_WEB_PRODUCT_MISMATCH');}
 // Prevent this standalone plan from being treated as clearance to overwrite a newer unified Web.
 check(s?.candidateComparison?.candidateRevision===p.gitRevision&&s.candidateComparison?.onlineImageIdsSha256===hash(JSON.stringify(containers.filter(x=>x.role==='web'||x.role==='worker').map(x=>x.imageId).sort()))&&s.candidateComparison?.latestSourcesReviewed===true,'ONLINE_SOURCE_RECONCILIATION_REQUIRED');
 return {version:1,planSha256:rendered.planSha256,snapshotSha256:hash(JSON.stringify(s)),observedAt:new Date(now).toISOString(),target:p.target,releaseAssessment,blockers,preflightEligible:blockers.length===0,startAuthorized:false,requiredMiB,candidateBudgetMiB:candidateBudget,resourceMethod:'max(sum-new-container-limits,measured-combined-peak)+existing-growth+host-reserve; no credit for future retirement; swap excluded',nextGate:'recollect under all three locks; existing lifecycle and live readiness remain mandatory'};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const parse=async path=>JSON.parse((await readFile(path,'utf8')).replace(/^\uFEFF/,''));
  const a=process.argv.slice(2);assert(a.length===6&&a[0]==='--plan'&&['--snapshot','--candidate-inspect'].includes(a[2])&&a[4]==='--output','ARGUMENTS_INVALID');
  const p=await parse(a[1]),data=await parse(a[3]);
  if(a[2]==='--candidate-inspect'){
   const candidate=Array.isArray(data)&&data.length===1?data[0]:data,bound=bindCandidateSlot(p,candidate);
   await mkdir(a[5],{recursive:true});await writeFile(resolve(a[5],'slot.compose.bound.json'),JSON.stringify(bound,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log('SAME_HOST_BIND: immutable_container_id=1 fixed_image=1 start_authorized=0');
  }else{
   const rendered=renderSameHostPlan(p),report=assessSameHostPlan(p,data);await mkdir(a[5],{recursive:true});
   for(const [name,value] of [['slot.compose.proposed.json',rendered.slotCompose],['database.compose.json',rendered.databaseCompose],['TOPOLOGY.json',rendered.contract],['PREFLIGHT.json',report]])await writeFile(resolve(a[5],name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
   console.log('SAME_HOST_PREFLIGHT: eligible='+Number(report.preflightEligible)+' start_authorized=0 blockers='+report.blockers.join(','));process.exitCode=report.preflightEligible?0:2;
  }
 }catch(e){const code=/^[A-Z][A-Z0-9_]+$/.test(e.message||'')?e.message:/^[A-Z][A-Z0-9_]+$/.test(e.code||'')?e.code:'INVALID_INPUT';console.error('SAME_HOST_PLAN_ERROR: '+code);process.exitCode=1;}
}
