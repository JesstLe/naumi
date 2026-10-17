import {availabilityActivationPlan,availabilityActivationApply} from '../src/runtime-availability';
import {uploadActivationPlan,uploadActivationApply} from '../src/runtime-uploads';
import {MultipartStore} from '../src/multipart-store';
import {DeliveryStore} from '../src/delivery-store';
import {resolveDatabaseActor} from '../src/identity';
import {sourceStorageInit,sourcePlan,sourceImport} from '../src/runtime-source-import';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRuntimeConfig,loadRuntimeBundle,protectedFile,storageInit,storageCheck,requireRuntime,RuntimeError} from '../src/runtime-config';
import {runtimePool,adminConnection,checkRuntimeDatabase,migrationPlan,applyMigrations} from '../src/runtime-database';
import {provisionPlan,provisionApply} from '../src/runtime-provision';
import {startRuntime} from '../src/runtime-application';
import {compositionPlan,compositionCheck} from '../src/runtime-composition';
async function main(){
 const [mode,...args]=process.argv.slice(2),options:Record<string,string>={};requireRuntime(['serve','worker','check','storage-init','migrate-plan','migrate','provision-plan','provision','composition-plan','composition-check','source-storage-init','source-plan','source-import','uploads-enable-plan','uploads-enable','uploads-cleanup','availability-enable-plan','availability-enable'].includes(mode),'RUNTIME_COMMAND_REQUIRED');for(let i=0;i<args.length;i+=2){requireRuntime(['--config','--admin','--input','--preview-hash','--adopt-existing','--backup','--reason','--web-config','--enterprise','--limit'].includes(args[i])&&args[i+1]&&!options[args[i]],'RUNTIME_ARGUMENT_INVALID');options[args[i]]=args[i+1];}
 requireRuntime(!!options['--config'],'RUNTIME_CONFIG_REQUIRED');const c=await loadRuntimeConfig(options['--config']),b=await loadRuntimeBundle(dirname(fileURLToPath(import.meta.url)),c);
 if(mode.startsWith('composition-')){requireRuntime(!!options['--web-config'],'WEB_COMPOSITION_CONFIG_REQUIRED');return {command:mode,...mode==='composition-plan'?(await compositionPlan(options['--web-config'],c,b)).summary:await compositionCheck(options['--web-config'],c,b)};}
 if(mode==='source-storage-init'){requireRuntime(!!options['--enterprise'],'SOURCE_ENTERPRISE_REQUIRED');return {command:mode,...await sourceStorageInit(c,options['--enterprise'])};}
 if(mode==='storage-init')return {command:mode,...await storageInit(c)};
 if(mode==='serve'||mode==='worker'){await startRuntime(c,b,mode==='serve'?'api':'worker');return null;}
 if(mode==='check'){const p=runtimePool(c.databaseUrl);try{return {command:mode,ready:true,releaseId:b.releaseId,productSha256:b.productSha256,database:await checkRuntimeDatabase(p,c,b,{deep:true}),storage:await storageCheck(c)};}finally{await p.end();}}
 if(mode==='uploads-cleanup'){requireRuntime(c.tenants.some(t=>t.enterpriseId===options['--enterprise']),'UPLOAD_ENTERPRISE_REQUIRED');const limit=Number(options['--limit']);requireRuntime(Number.isInteger(limit)&&limit>=1&&limit<=20,'UPLOAD_CLEANUP_LIMIT_REQUIRED');requireRuntime(!!options['--reason']&&options['--reason'].trim().length>=3&&options['--reason'].length<=200,'UPLOAD_CLEANUP_REASON_REQUIRED');const db=runtimePool(c.databaseUrl);try{await checkRuntimeDatabase(db,c,b,{operational:false,deep:true});await storageCheck(c);return {command:mode,...await new MultipartStore(new DeliveryStore(db,resolveDatabaseActor,c.deliveryRoot),resolveDatabaseActor).expireAndClean(options['--enterprise'],limit,options['--reason'])};}finally{await db.end();}}
 requireRuntime(!!options['--admin'],'ADMIN_CONNECTION_FILE_REQUIRED');const p=await adminConnection(options['--admin'],c);try{
  if(mode==='availability-enable-plan'||mode==='availability-enable'){requireRuntime(!!options['--input'],'AVAILABILITY_ACTIVATION_INPUT_REQUIRED');const input=JSON.parse((await protectedFile(options['--input'])).toString('utf8'));return {command:mode,...mode==='availability-enable-plan'?await availabilityActivationPlan(p,c,b,input):await availabilityActivationApply(p,c,b,input,options['--preview-hash']||'')};}
  if(mode==='uploads-enable-plan'||mode==='uploads-enable'){requireRuntime(!!options['--input'],'UPLOAD_ACTIVATION_INPUT_REQUIRED');const input=JSON.parse((await protectedFile(options['--input'])).toString('utf8'));return {command:mode,...mode==='uploads-enable-plan'?await uploadActivationPlan(p,c,b,input):await uploadActivationApply(p,c,b,input,options['--preview-hash']||'')};}
  if(mode==='source-plan'||mode==='source-import'){requireRuntime(!!options['--input'],'SOURCE_INPUT_REQUIRED');const input=JSON.parse((await protectedFile(options['--input'])).toString('utf8'));return {command:mode,...mode==='source-plan'?await sourcePlan(p,c,b,input):await sourceImport(p,c,b,input,options['--preview-hash']||'')};}
  if(mode.startsWith('migrate')){requireRuntime(!!options['--reason']&&options['--reason'].length<=500,'MIGRATION_REASON_REQUIRED');requireRuntime(!options['--adopt-existing']||options['--adopt-existing']==='true','ADOPTION_FLAG_INVALID');const opt={adoptExisting:options['--adopt-existing']==='true',backupFile:options['--backup'],reason:options['--reason']};if(mode==='migrate-plan'){const {payload,...plan}=await migrationPlan(p,c,b,opt);return {command:mode,...plan};}requireRuntime(/^[a-f0-9]{64}$/.test(options['--preview-hash']||''),'PREVIEW_HASH_REQUIRED');return {command:mode,...await applyMigrations(p,c,b,opt,options['--preview-hash'])};}
  requireRuntime(!!options['--input'],'PROVISION_INPUT_REQUIRED');const input=JSON.parse((await protectedFile(options['--input'])).toString('utf8'));if(mode==='provision-plan')return {command:mode,...await provisionPlan(p,c,b,input)};requireRuntime(/^[a-f0-9]{64}$/.test(options['--preview-hash']||''),'PREVIEW_HASH_REQUIRED');return {command:mode,...await provisionApply(p,c,b,input,options['--preview-hash'])};
 }finally{await p.end();}
}
main().then(result=>{if(result)console.log('RUNTIME_RESULT: '+JSON.stringify(result));}).catch(e=>{console.error('RUNTIME_ERROR: '+JSON.stringify({code:e instanceof RuntimeError?e.code:'RUNTIME_OPERATION_FAILED'}));process.exitCode=1;});
