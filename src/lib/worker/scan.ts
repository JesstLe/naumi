import "server-only";
import {scanVideoWorkerOnce} from "../video/worker";
import {recoverCanvasImageTasks} from "../canvas-image-tasks";
import {recoverDurableImageJobs} from "./image-recovery";
import {exposeAbandonedBillingOperations} from "../billing/synchronous-operation";
import {scanSupplierCostsOnce} from "../supplier-cost/worker";
import {scheduleMediaRecovery} from "./media-recovery";

/** Application recovery sequence shared by HTTP and the independent Worker.
 * Domain functions retain claims, frozen plans, billing and release activity.
 * This function owns no timer, HTTP identity, database schema or second queue. */
export async function scanApplicationWorkerOnce() {
  const startedAt=Date.now(),phases:Record<string,number>={};
  async function phase<T>(name:string,action:()=>Promise<T>){const start=Date.now();try{return await action();}finally{phases[name]=Date.now()-start;}}
  const videoProcessed = await phase('video',()=>scanVideoWorkerOnce());
  const imageProcessed = await phase('canvasImage',()=>recoverCanvasImageTasks(2));
  const generationProcessed = await phase('generation',()=>recoverDurableImageJobs());
  await phase('reference',()=>import("../reference-workbench/service").then(m=>m.recoverReferenceWorkbench()));
  // Stale reservations become reviewable on the tick cadence; waiting for an
  // admin page visit left paid tasks invisible to operations until someone
  // opened the reconciliation console.
  const billingExposed = await phase('billingExposure',()=>exposeAbandonedBillingOperations());
  const supplierCostsProcessed = await phase('supplierCosts',()=>scanSupplierCostsOnce());
  const mediaRecovery=await phase('mediaAdmission',()=>scheduleMediaRecovery());
  return {
    ok: true,
    processed: videoProcessed + imageProcessed + generationProcessed,
    // This receipt confirms dispatch, not completion of detached media work.
    mediaProcessed:0,
    generationProcessed,
    billingExposed,
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
