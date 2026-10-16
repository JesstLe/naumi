import "server-only";
import { getModelAdministration } from "../model-config/server";
import { configuredHealthTargets } from "./targets";
import { createHealthRepository } from "./repository";
import { executeHealthProbe } from "./executor";

export async function scanModelHealthOnce(source:"worker"|"manual"="worker") {
  const admin=await getModelAdministration(),snapshot=await admin.repo.current(),repo=createHealthRepository(admin.pool);
  const claim=await repo.claim(configuredHealthTargets(snapshot.config),snapshot.version,source==="worker");
  if (!claim) return {processed:0};
  const current=await admin.repo.current();
  if(!(await repo.policy()).enabled||!configuredHealthTargets(current.config).some(t=>t.key===claim.target.key&&t.supported)){
    await repo.finish(claim.id,{success:false,reason:"configuration",status:null,latencyMs:null,skipped:true});
    return {processed:0,state:"configuration-changed"};
  }
  const result=await executeHealthProbe({pool:admin.pool,snapshot,target:claim.target,id:claim.id,billingVersion:(await admin.billing.current()).version,readCredential:admin.credentials.read,trustedOrigins:admin.trustedOrigins});
  await repo.finish(claim.id,result);
  return {processed:result.skipped?0:1,id:claim.id,state:result.skipped?"skipped":result.uncertain?"unknown":result.success?"success":"failed"};
}
