import "server-only";
import {dbEnabled} from "@/platform/db/pool";
import {dueImageJobs,type ImageJobRow} from "../image-job-repository";
import {dispatchImageQueue} from "../image-job-queue";
import {withBackgroundActivity} from "../release-runtime/background-activity";

/** Only persisted job identities reach this dispatcher. The original use case
 * claims the same DB lease and restores its frozen scope, quote and checkpoints.
 * No synthetic Request, Web POST or second submission identity is introduced. */
async function resumeImageJob(job:Pick<ImageJobRow,"id"|"kind">){
 switch(job.kind){
  case "generate":await(await import("../imagegen/generation-runtime")).kickGeneration(job.id);break;
  case "suite":await(await import("../suite/runtime")).kickSuite(job.id);break;
  case "aplus":await(await import("../aplus/runtime")).kickAplus(job.id);break;
  case "imagegen":await(await import("../imagegen/dispatch")).resumeImagegen(job.id);break;
 }
 return true;
}

async function recoverDurableImageJobsLocal():Promise<number>{
 if(!dbEnabled)return 0;
 const jobs=await dueImageJobs();
 const count=await dispatchImageQueue(jobs,resumeImageJob,()=>console.error("[image-queue] worker dispatch failed; retained for next scan"));
 const {recoverImagegenBatches}=await import("../imagegen/batch");
 const {recoverStoredDeliveries}=await import("../imagegen/stored-delivery");
 return count+await recoverImagegenBatches()+await recoverStoredDeliveries();
}

export async function recoverDurableImageJobs():Promise<number>{
 return withBackgroundActivity("durable-image","recovery-dispatch-scan","claim",()=>recoverDurableImageJobsLocal(),()=>0);
}
