import { scanVideoWorkerOnce } from "@/lib/video/worker";
import { recoverCanvasImageTasks } from "@/lib/canvas-image-tasks";
import { recoverDurableImageJobs } from "@/lib/durable-image-jobs";
import { scanSupplierCostsOnce } from "@/lib/supplier-cost/worker";
import {scheduleMediaRecovery} from "@/lib/worker/media-recovery";

export async function scanWorkerTick() {
  const startedAt=Date.now(),phases:Record<string,number>={};
  async function phase<T>(name:string,action:()=>Promise<T>){const start=Date.now();try{return await action();}finally{phases[name]=Date.now()-start;}}
  const videoProcessed = await phase('video',()=>scanVideoWorkerOnce());
  const imageProcessed = await phase('canvasImage',()=>recoverCanvasImageTasks(2));
  const generationProcessed = await phase('generation',()=>recoverDurableImageJobs());
  await phase('reference',()=>import("@/lib/reference-workbench/service").then(m=>m.recoverReferenceWorkbench()));
  const supplierCostsProcessed = await phase('supplierCosts',()=>scanSupplierCostsOnce());
  const mediaRecovery=await phase('mediaAdmission',()=>scheduleMediaRecovery());
  return {
    ok: true,
    processed: videoProcessed + imageProcessed + generationProcessed,
    // This receipt confirms dispatch, not completion of detached media work.
    mediaProcessed:0,
    generationProcessed,
    supplierCostsProcessed,
    mediaSaved:0,
    mediaRecovery,
    phasesMs:phases,
    durationMs:Date.now()-startedAt,
    videoProcessed,
    imageProcessed,
    at: new Date().toISOString(),
  };
}
