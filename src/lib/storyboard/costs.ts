import {z} from "zod";
import {productionSelectionSchema} from "./production-schema";
import type {StoryboardDocument} from "./plan";
import type {TaskCostEvidence} from "../billing/task-cost-evidence";

export const storyboardCostRequestSchema=productionSelectionSchema.safeExtend({compareRevision:z.number().int().positive().optional()});
export type CostAttribution="plan"|"shared-node"|"inherited"|"referenced-media";
export type StoryboardCostItem={id:string;kind:"video"|"audio-processing"|"media";status:string;attribution:CostAttribution;nodeIds:string[];runIds:string[];timelineIds:string[];billing:TaskCostEvidence;externalCostUnknown:boolean;remake:boolean};
export type CostTotals={taskCount:number;chargedCredits:number;reservedCredits:number;refundedCredits:number;releasedCredits:number;pendingCount:number;unknownCount:number;externalUnknownCount:number;failedTaskCount:number};
export const emptyCostTotals=():CostTotals=>({taskCount:0,chargedCredits:0,reservedCredits:0,refundedCredits:0,releasedCredits:0,pendingCount:0,unknownCount:0,externalUnknownCount:0,failedTaskCount:0});
export function summarizeCosts(items:readonly StoryboardCostItem[]):CostTotals{
 const total=emptyCostTotals(),seen=new Set<string>();for(const item of items){const key=`${item.kind==="video"?"video":"media"}:${item.id}`;if(seen.has(key))continue;seen.add(key);const b=item.billing;total.taskCount++;total.chargedCredits+=b.chargedCredits??0;total.reservedCredits+=b.reservedCredits;total.refundedCredits+=b.refundedCredits;total.releasedCredits+=b.releasedCredits;
  if(!b.consistent||(b.chargedCredits===null&&["settled","released","legacy"].includes(b.state||""))||["hold","manual"].includes(b.state||"")||item.status==="needs_attention")total.unknownCount++;
  if(["prepared","reserved","hold","manual"].includes(b.state||"")||["queued","processing","needs_attention"].includes(item.status)||b.reservedCredits>0)total.pendingCount++;
  if(item.externalCostUnknown)total.externalUnknownCount++;if(["failed","cancelled"].includes(item.status))total.failedTaskCount++;
 }
 return total;
}
export type CostImpact={nodeId:string;number:string;execution:"generate"|"reuse"|"unselected";reasons:Array<"selected-generation"|"node-inputs-changed"|"continuity-changed"|"depends-on-changed"|"adoption-changed"|"cut-changed"|"source-changed">;generationAffected:boolean;editorialAffected:boolean};
export function storyboardCostImpact(current:StoryboardDocument,selection:readonly {id:string;reuseCompleted:boolean}[],nodes:readonly {id:string;contentDigest:string;dependencies:string[]}[],baseline?:{document?:StoryboardDocument;digests?:Record<string,string>}){
 const same=(a:unknown,b:unknown)=>stable(a)===stable(b),affected=new Set<string>(),result:CostImpact[]=current.shots.map(shot=>{
  const chosen=selection.find(item=>item.id===shot.nodeId),old=baseline?.document?.shots.find(item=>item.nodeId===shot.nodeId),node=nodes.find(node=>node.id===shot.nodeId),reasons:CostImpact["reasons"]=[];
  if(chosen&&!chosen.reuseCompleted)reasons.push("selected-generation");
  if(node&&baseline?.digests?.[node.id]&&node.contentDigest!==baseline.digests[node.id])reasons.push("node-inputs-changed");
  if(old&&!same(old.continuity,shot.continuity))reasons.push("continuity-changed");
  if(old&&old.adoptedArtworkId!==shot.adoptedArtworkId)reasons.push("adoption-changed");if(old&&!same(old.cut,shot.cut))reasons.push("cut-changed");if(old&&!same([old.source,old.additionalSources],[shot.source,shot.additionalSources]))reasons.push("source-changed");
  const generationAffected=reasons.some(reason=>["selected-generation","node-inputs-changed","continuity-changed"].includes(reason));if(generationAffected||reasons.includes("adoption-changed"))affected.add(shot.nodeId);
  return {nodeId:shot.nodeId,number:shot.number,execution:!chosen?"unselected":chosen.reuseCompleted?"reuse":"generate",reasons,generationAffected,editorialAffected:reasons.some(reason=>["adoption-changed","cut-changed"].includes(reason))};
 });
 let changed=true;while(changed){changed=false;for(const item of result){const node=nodes.find(node=>node.id===item.nodeId);if(!affected.has(item.nodeId)&&node?.dependencies.some(id=>affected.has(id))){affected.add(item.nodeId);item.reasons.push("depends-on-changed");item.generationAffected=true;changed=true;}}}
 return {shots:result,structureChanged:!!baseline?.document&&!same(current.shots.map(shot=>shot.nodeId),baseline.document.shots.map(shot=>shot.nodeId)),audioChanged:!!baseline?.document&&!same(current.audio,baseline.document.audio),adoptionMutation:"none" as const};
}
function stable(value:unknown):string{if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;if(value&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${JSON.stringify(key)}:${stable(value)}`).join(",")}}`;return JSON.stringify(value)??"undefined";}
export type StoryboardCostReport={planId:string;revision:number;observedAt:string;totals:{plan:CostTotals;sharedHistory:CostTotals;reusedReferences:CostTotals};stages:Array<{kind:StoryboardCostItem["kind"];totals:CostTotals}>;items:StoryboardCostItem[];detailCount:number;detailsTruncated:boolean;quote:{generationCredits:number|null;assemblyCredits:number|null;upperBound:boolean;assemblyUpperBound:boolean;newShots:number;reusedShots:number;byocShots:number;error?:string};executionCeiling:{generationUpperCredits:number|null;assemblyUpperCredits:number|null;implicitBudgetAdded:false};impact:ReturnType<typeof storyboardCostImpact>;baselineRevision:number|null;coverage:{allRelatedTasksCounted:boolean;legacyHistoryMayBeIncomplete:boolean;baselineNodeDigestsAvailable:string[];missingReferencedTaskIds:string[];referencedMaterialCostsUnknown:string[];unattributedHistory:boolean;unacceptedOperations:Array<{id:string;status:string;quotedCredits:number|null;upperBound:boolean}>;speechGeneration:"unverified"}};
