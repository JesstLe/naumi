import {WorkflowError} from './contracts';
import {MultipartStore} from './multipart-store';
import {ReferenceStore} from './reference-store';
import {FormalImportStore} from './formal-import-store';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPublicKey} from 'node:crypto';
import {SourceIdentityStore,createSourceVerifier,createMappedAuthenticator,createWorkflowServer,WorkflowStore,resolveDatabaseActor,DeliveryStore,NotificationStore,RoutingStore,SchedulingStore,PeopleStore,PerformanceStore,createSourceEvidenceVerifier} from './server';
import {checkRuntimeDatabase,runtimePool} from './runtime-database';
import {runtimeConnectors,runtimeScanPolicy,storageCheck,RuntimeError,type RuntimeConfig,type RuntimeBundle} from './runtime-config';
import {installRuntimeLifecycle} from './runtime-lifecycle';
export async function startRuntime(c:RuntimeConfig,b:RuntimeBundle,role:'api'|'worker'){
 const pool=runtimePool(c.databaseUrl);try{
  await checkRuntimeDatabase(pool,c,b,{operational:false,deep:true});await storageCheck(c);
  const keys=Object.fromEntries(Object.entries(c.publicKeys).map(([kid,pem])=>[kid,createPublicKey(pem)]));
  const identities=new SourceIdentityStore(pool,(source,id)=>c.tenants.some(t=>t.enterpriseId===id&&t.sourceInstance===source.sourceInstance&&t.sourceEnterprise===source.sourceEnterprise));
  const signed=createSourceVerifier({issuer:'naumi-workflow-bff',audience:'enterprise-workflow-source',publicKeys:keys});
  const authenticate:typeof signed=async req=>{const identity=await signed(req);return identity&&c.tenants.some(t=>t.sourceInstance===identity.sourceInstance&&t.sourceEnterprise===identity.sourceEnterprise)?identity:null;};
  const delivery=new DeliveryStore(pool,resolveDatabaseActor,c.deliveryRoot,32*1024*1024,2*1024*1024*1024,runtimeScanPolicy(c)),notifications=new NotificationStore(pool,resolveDatabaseActor,runtimeConnectors(c)),routing=new RoutingStore(pool,resolveDatabaseActor,notifications);
  const orders=new WorkflowStore(pool,resolveDatabaseActor,delivery.validate,undefined,createSourceEvidenceVerifier(keys),undefined,routing,notifications,c.availabilityEnabled,c.catalogEnabled??false,c.formsEnabled??false);
  const mapped=createMappedAuthenticator(identities,authenticate),guarded:typeof mapped=async req=>{const principal=await mapped(req);if(!principal)return null;const f=(await pool.query('SELECT minimum_reader,minimum_writer,availability_enabled,catalog_enabled FROM enterprise_workflow.runtime_installation WHERE singleton')).rows[0];if(!f||f.minimum_reader>b.schemaVersion||f.minimum_writer>b.schemaVersion)throw new WorkflowError(503,'RUNTIME_SCHEMA_INCOMPATIBLE');if(c.availabilityEnabled?!(f?.minimum_reader>=17&&f?.minimum_writer>=17&&f?.availability_enabled):f?.availability_enabled)throw new WorkflowError(503,'AVAILABILITY_CONFIG_REQUIRED');if(c.catalogEnabled?!(f.minimum_reader>=19&&f.minimum_writer>=19&&f.catalog_enabled):f.catalog_enabled)throw new WorkflowError(503,'CATALOG_CONFIG_REQUIRED');if(c.formsEnabled?!(f.minimum_reader>=20&&f.minimum_writer>=20):f.minimum_reader>=20)throw new WorkflowError(503,'FORMS_CONFIG_REQUIRED');return principal;};
  const server=role==='api'?createWorkflowServer(orders,guarded,new SchedulingStore(pool,resolveDatabaseActor),{store:identities,authenticate},new PeopleStore(pool,resolveDatabaseActor),delivery,new PerformanceStore(pool,resolveDatabaseActor),routing,notifications,new FormalImportStore(pool,resolveDatabaseActor,c.importRoots),new ReferenceStore(pool,resolveDatabaseActor,c.importRoots),c.multipartEnabled?new MultipartStore(delivery,resolveDatabaseActor):undefined):createServer();
  const modules=['identity','people','requirements','tasks','delivery','scheduling','performance','routing','notifications','source-evidence','imports','references','calendar','delivery-scan','personal-availability','catalog','demand-forms'];
  const readiness=async()=>({database:await checkRuntimeDatabase(pool,c,b),storage:await storageCheck(c),deploymentMode:c.deploymentMode,deliveryInspection:{mode:c.deliveryScan.mode,acceptance:'external-scan-probe-required',maxBytes:c.deliveryScan.mode==='disabled'?null:c.deliveryScan.maxBytes},personalAvailability:{enabled:c.availabilityEnabled},catalog:{enabled:c.catalogEnabled??false},forms:{enabled:c.formsEnabled??false},multipart:{enabled:c.multipartEnabled,maxBytes:512*1024*1024,partBytes:4*1024*1024},modules,sourceSessionVerification:'external-login-probe-required'});
  const lifecycle=installRuntimeLifecycle(server,c,b,role,readiness,()=>pool.end());server.listen(role==='api'?c.apiPort:c.workerPort,'127.0.0.1');await once(server,'listening');console.log('RUNTIME_LISTENING: '+JSON.stringify({port:role==='api'?c.apiPort:c.workerPort,...lifecycle.state()}));
  if(role==='worker')void(async()=>{while(!lifecycle.draining){if(!lifecycle.acceptingWork){await new Promise(r=>setTimeout(r,250));continue;}try{await checkRuntimeDatabase(pool,c,b);if(lifecycle.draining)break;const r=await lifecycle.work(()=>notifications.tick());if(!r.processed)await new Promise(r=>setTimeout(r,1000));}catch(e){if(lifecycle.draining)break;console.error(e instanceof RuntimeError?'RUNTIME_WORKER_WAIT: '+e.code:'RUNTIME_WORKER_WAIT: RETRY_LATER');await new Promise(r=>setTimeout(r,5000));}}})();
  return {server,pool,lifecycle};
 }catch(e){await pool.end();throw e;}
}
