import {ReferenceStore} from './reference-store';
import {FormalImportStore} from './formal-import-store';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPublicKey} from 'node:crypto';
import {SourceIdentityStore,createSourceVerifier,createMappedAuthenticator,createWorkflowServer,WorkflowStore,resolveDatabaseActor,DeliveryStore,NotificationStore,RoutingStore,SchedulingStore,PeopleStore,PerformanceStore,createSourceEvidenceVerifier} from './server';
import {checkRuntimeDatabase,runtimePool} from './runtime-database';
import {runtimeConnectors,storageCheck,RuntimeError,type RuntimeConfig,type RuntimeBundle} from './runtime-config';
import {installRuntimeLifecycle} from './runtime-lifecycle';
export async function startRuntime(c:RuntimeConfig,b:RuntimeBundle,role:'api'|'worker'){
 const pool=runtimePool(c.databaseUrl);try{
  await checkRuntimeDatabase(pool,c,b,{operational:false,deep:true});await storageCheck(c);
  const keys=Object.fromEntries(Object.entries(c.publicKeys).map(([kid,pem])=>[kid,createPublicKey(pem)]));
  const identities=new SourceIdentityStore(pool,(source,id)=>c.tenants.some(t=>t.enterpriseId===id&&t.sourceInstance===source.sourceInstance&&t.sourceEnterprise===source.sourceEnterprise));
  const signed=createSourceVerifier({issuer:'naumi-workflow-bff',audience:'enterprise-workflow-source',publicKeys:keys});
  const authenticate:typeof signed=async req=>{const identity=await signed(req);return identity&&c.tenants.some(t=>t.sourceInstance===identity.sourceInstance&&t.sourceEnterprise===identity.sourceEnterprise)?identity:null;};
  const delivery=new DeliveryStore(pool,resolveDatabaseActor,c.deliveryRoot),notifications=new NotificationStore(pool,resolveDatabaseActor,runtimeConnectors(c)),routing=new RoutingStore(pool,resolveDatabaseActor,notifications);
  const orders=new WorkflowStore(pool,resolveDatabaseActor,delivery.validate,undefined,createSourceEvidenceVerifier(keys),undefined,routing,notifications);
  const server=role==='api'?createWorkflowServer(orders,createMappedAuthenticator(identities,authenticate),new SchedulingStore(pool,resolveDatabaseActor),{store:identities,authenticate},new PeopleStore(pool,resolveDatabaseActor),delivery,new PerformanceStore(pool,resolveDatabaseActor),routing,notifications,new FormalImportStore(pool,resolveDatabaseActor,c.importRoots),new ReferenceStore(pool,resolveDatabaseActor,c.importRoots)):createServer();
  const modules=['identity','people','requirements','tasks','delivery','scheduling','performance','routing','notifications','source-evidence','imports','references'];
  const readiness=async()=>({database:await checkRuntimeDatabase(pool,c,b),storage:await storageCheck(c),deploymentMode:c.deploymentMode,modules,sourceSessionVerification:'external-login-probe-required'});
  const lifecycle=installRuntimeLifecycle(server,c,b,role,readiness,()=>pool.end());server.listen(role==='api'?c.apiPort:c.workerPort,'127.0.0.1');await once(server,'listening');console.log('RUNTIME_LISTENING: '+JSON.stringify({port:role==='api'?c.apiPort:c.workerPort,...lifecycle.state()}));
  if(role==='worker')void(async()=>{while(!lifecycle.draining){if(!lifecycle.acceptingWork){await new Promise(r=>setTimeout(r,250));continue;}try{await checkRuntimeDatabase(pool,c,b);if(lifecycle.draining)break;const r=await lifecycle.work(()=>notifications.tick());if(!r.processed)await new Promise(r=>setTimeout(r,1000));}catch(e){if(lifecycle.draining)break;console.error(e instanceof RuntimeError?'RUNTIME_WORKER_WAIT: '+e.code:'RUNTIME_WORKER_WAIT: RETRY_LATER');await new Promise(r=>setTimeout(r,5000));}}})();
  return {server,pool,lifecycle};
 }catch(e){await pool.end();throw e;}
}
