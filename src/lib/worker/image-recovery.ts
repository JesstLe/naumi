import "server-only";
import {randomUUID} from "node:crypto";
import {dbEnabled} from "@/platform/db/pool";
import {dueImageJobs,type ImageJobRow} from "../image-job-repository";
import {dispatchImageQueue} from "../image-job-queue";
import {withBackgroundActivity} from "../release-runtime/background-activity";
import {deferApplicationTask} from "../application/task-execution";

/** Only persisted job identities reach this dispatcher. The original use case
 * claims the same DB lease and restores its frozen scope, quote and checkpoints.
 * No synthetic Request, Web POST or second submission identity is introduced. */
async function resumeImageJob(job:Pick<ImageJobRow,"id"|"kind">){
 switch(job.kind){
  case "generate":await(await import("../imagegen/generation-runtime")).kickGeneration(job.id,(await import("../imagegen/dispatch")).notifyImagegenJobReleased);break;
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

let recoveryScan:Promise<number>|undefined;
export async function recoverDurableImageJobs():Promise<number>{
 if(await deferApplicationTask())return 0;
 if(!recoveryScan)recoveryScan=withBackgroundActivity("durable-image",`recovery-dispatch-scan:${randomUUID()}`,"claim",()=>recoverDurableImageJobsLocal(),()=>0).finally(()=>{recoveryScan=undefined;});
 return recoveryScan;
}
