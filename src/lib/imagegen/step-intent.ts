import type {ImagegenPlan,Intent} from "./types";

export function imagegenStepIntent(plan:ImagegenPlan,key:string):Intent{
 const step=plan.steps.find(s=>s.key===key)!;
 return {...plan.intent,operation:step.operation,background:plan.steps.length>1&&key==="generate"?null:plan.intent.background,requirements:(plan.steps.length>1&&key==="generate"?plan.intent.requirements.filter(r=>r.name!=="background"):plan.intent.requirements).map(r=>r.name==="resolution"&&step.parameters.resolution?{...r,value:String(step.parameters.resolution)}:r)};
}
