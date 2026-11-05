import "server-only";
import type {GenerationResult} from "./generation-types";
import {submitGenerationCore} from "./generation-core";
import {submitCutoutOperation} from "./cutout-operation";
import type {ImagegenPlan} from "./types";
/** Every image step calls a typed use case; public HTTP endpoints are adapters only. */
export async function executeImagegenStep(plan:ImagegenPlan,key:string,owner:string):Promise<GenerationResult>{
  const step=plan.steps.find(s=>s.key===key);
  if(!step)throw new Error("执行步骤不存在");
  return step.operation==="cutout"?submitCutoutOperation(plan,key,owner):submitGenerationCore(plan,key,owner);
}
