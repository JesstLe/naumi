import "server-only";
import {scanVideoWorkerOnce} from "../video/worker";
import {recoverCanvasImageTasks} from "../canvas-image-tasks";
import {recoverDurableImageJobs} from "./image-recovery";
import {scanSupplierCostsOnce} from "../supplier-cost/worker";
import {recoverMediaMirrors} from "../media-assets";
import {recoverMediaJobs} from "../video/media-jobs";

/** Application recovery sequence shared by HTTP and the independent Worker.
 * Domain functions retain claims, frozen plans, billing and release activity.
 * This function owns no timer, HTTP identity, database schema or second queue. */
export async function scanApplicationWorkerOnce(){
 const videoProcessed=await scanVideoWorkerOnce();
 const imageProcessed=await recoverCanvasImageTasks(2);
 const generationProcessed=await recoverDurableImageJobs();
 await import("../reference-workbench/service").then(m=>m.recoverReferenceWorkbench());
 const supplierCostsProcessed=await scanSupplierCostsOnce();
 const mediaSaved=await recoverMediaMirrors().catch(()=>0);
 const mediaProcessed=await recoverMediaJobs();
 return {
  ok:true,
  processed:videoProcessed+imageProcessed+generationProcessed+mediaProcessed,
  mediaProcessed,generationProcessed,supplierCostsProcessed,mediaSaved,videoProcessed,imageProcessed,
  at:new Date().toISOString(),
 };
}
