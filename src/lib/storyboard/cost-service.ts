import "server-only";
import {createHash} from "node:crypto";
import {requireStoryboardPlan} from "./service";
import {readStoryboardRevision,inheritedStoryboardTakeOrigin} from "./repository";
import {roughcutLinks} from "./production-repository";
import {inspectStoryboardProduction} from "./production-service";
import {getVideoNode} from "../canvas/video-node-service";
import {readTimelineCostReceipts,readTimelineCostReferences} from "../canvas/timeline-node-repository";
import {readVideoCostHistory,readMediaCostHistory} from "../video/cost-history";
import {readTaskCostEvidence} from "../billing/task-cost-evidence";
import {canonicalConfig} from "../model-config/snapshot-value";
import {ModelConfigError} from "../model-config/types";
import {storyboardCostRequestSchema,summarizeCosts,storyboardCostImpact,type StoryboardCostReport,type StoryboardCostItem} from "./costs";
import {getAssistedReview} from "./assisted-review-service";
import {readMediaJobEvidence} from "../video/media-jobs";
import {readAssistedReviewRequests,readReviewFrameRequests} from "./assisted-review-repository";

/** Read model only: no reserve, settle, dispatch, adoption, or alternate ledger. */
export async function inspectStoryboardCosts(actorRaw:string,raw:unknown):Promise<StoryboardCostReport>{
 const actor=actorRaw.toLowerCase(),input=storyboardCostRequestSchema.parse(raw),plan=await requireStoryboardPlan(actor,{id:input.planId,revision:input.revision},input.projectKey);
 if(input.nodes.some(node=>!plan.document.shots.some(shot=>shot.nodeId===node.id)))throw new ModelConfigError("STORYBOARD_NODE_UNAVAILABLE","所选镜头不属于此方案",422);
 const baseline=input.compareRevision?await readStoryboardRevision(actor,plan.id,input.compareRevision):undefined;
 if(input.compareRevision&&(!baseline||baseline.projectKey!==plan.projectKey||baseline.revision>plan.revision))throw new ModelConfigError("STORYBOARD_BASELINE_UNAVAILABLE","方案对比版本不存在",404);
 const nodes=await Promise.all(plan.document.shots.map(shot=>getVideoNode(actor,shot.nodeId)));
 const current=nodes.flatMap(node=>node&&node.projectKey===plan.projectKey?[{id:node.id,contentDigest:createHash("sha256").update(canonicalConfig({config:node.config,inputs:node.inputs})).digest("hex"),dependencies:node.inputs.filter(value=>value.kind==="video").map(value=>value.nodeId.replace(/^video:/,""))}]:[]);
 const inherited=new Map<string,string[]>();
 for(const shot of plan.document.shots)for(const take of shot.takes){
  const origin=await inheritedStoryboardTakeOrigin(actor,plan.projectKey,shot.nodeId,take);if(origin)inherited.set(take.taskId,[...new Set([...(inherited.get(take.taskId)||[]),shot.nodeId])]);
 }
 const history=await readVideoCostHistory(actor,plan.projectKey,plan.id,plan.document.shots.map(shot=>shot.nodeId),plan.document.shots.flatMap(shot=>shot.takes.map(take=>take.taskId)));
 const exact=history.workflows.filter(run=>run.storyboard?.id===plan.id||run.reviewPlanId===plan.id),runIds=new Set(exact.map(run=>run.id));
 const timelineIds=(await roughcutLinks(actor,plan.id)).map(link=>link.timelineId),timelines=await readTimelineCostReceipts(actor,plan.projectKey,timelineIds);
 const referencedArtworkIds=[...new Set([...(plan.document.audio||[]).map(track=>track.artworkId),...await readTimelineCostReferences(actor,plan.projectKey,timelineIds)])];
 const operations=new Map<string,{runIds:string[];timelineIds:string[]}>();
 for(const run of exact)for(const id of run.assemblyOperations)operations.set(id,{runIds:[run.id],timelineIds:[]});
 for(const receipt of timelines)operations.set(receipt.operationId,{runIds:[],timelineIds:[receipt.timelineId]});
 const inspections=new Map<string,{attribution:StoryboardCostItem["attribution"];nodeIds:string[];frameOperationId:string}>();
 for(const frame of await readReviewFrameRequests(actor,plan.projectKey,plan.id))operations.set(frame.operationId,{runIds:[],timelineIds:[]});
 for(const request of await readAssistedReviewRequests(actor,plan.projectKey,plan.id)){
   const frame=await readMediaJobEvidence(actor,request.frameJobId,false);
   inspections.set(`tool-${request.operationId}`,{attribution:"plan",nodeIds:[request.source.nodeId],frameOperationId:frame.operationId});operations.set(frame.operationId,{runIds:[],timelineIds:[]});
 }
 for(const shot of plan.document.shots)for(const take of shot.takes)for(const ref of take.assistedReviews||[]){
   const {review}=await getAssistedReview(actor,ref.source,ref.operationId),frame=await readMediaJobEvidence(actor,review.frameJobId);
   const samePlan=review.source.planId===plan.id;
   inspections.set(`tool-${ref.operationId}`,{attribution:samePlan?"plan":"inherited",nodeIds:[shot.nodeId],frameOperationId:frame.operationId});
   if(samePlan)operations.set(frame.operationId,{runIds:[],timelineIds:[]});
 }
 const media=await readMediaCostHistory(actor,plan.projectKey,[...new Set([...operations.keys(),...[...inspections.values()].map(value=>value.frameOperationId)])],referencedArtworkIds);
 const bills=await readTaskCostEvidence(actor,[...history.tasks.map(task=>({id:task.id,ledgerId:`led-video-${task.id}`})),...media.map(job=>({id:job.id,ledgerId:`led-media-${job.id}`})),...[...inspections.keys()].map(id=>({id,ledgerId:`led-${id}`}))]);
 const byId=new Map(bills.map(bill=>[bill.id,bill]));
 const items:StoryboardCostItem[]=history.tasks.map(task=>{
  let billing=byId.get(task.id)!;
  if(task.zeroByocPolicy&&billing.basis==="missing"&&billing.reservedCredits===0)billing={...billing,state:"settled",chargedCredits:0,consistent:true,basis:"byoc-policy"};
  return {id:task.id,kind:"video",status:task.status,attribution:task.runId&&runIds.has(task.runId)?"plan":inherited.has(task.id)?"inherited":"shared-node",nodeIds:inherited.get(task.id)||(task.nodeId?[task.nodeId]:[]),runIds:task.runId?[task.runId]:[],timelineIds:[],billing,externalCostUnknown:task.byoc,remake:task.retry||!!exact.find(run=>run.id===task.runId&&run.reviewPlanId)};
 });
 for(const job of media){const origin=operations.get(job.operationId);items.push({id:job.id,kind:job.audio?"audio-processing":"media",status:job.status,attribution:origin?"plan":"referenced-media",nodeIds:[],runIds:origin?.runIds||[],timelineIds:origin?.timelineIds||[],billing:byId.get(job.id)!,externalCostUnknown:false,remake:false});}
 for(const [id,inspection]of inspections){const billing=byId.get(id)!;items.push({id,kind:"review",status:billing.state==="settled"?"completed":billing.state==="released"?"failed":"needs_attention",attribution:inspection.attribution,nodeIds:inspection.nodeIds,runIds:[],timelineIds:[],billing,externalCostUnknown:false,remake:false});}
 const actual=items.filter(item=>item.attribution==="plan"),unacceptedOperations=exact.flatMap(run=>run.nodes.filter(node=>!node.taskId&&!node.reused).map(node=>({id:`${run.id}:${node.id}`,status:node.status,quotedCredits:node.quotedCredits,upperBound:node.upperBound})));
 for(const id of operations.keys())if(!media.some(job=>job.operationId===id))unacceptedOperations.push({id,status:"not-accepted",quotedCredits:null,upperBound:false});
 const digests:Record<string,string>={};for(const run of exact)if(!baseline||run.storyboard?.revision===baseline.revision)for(const node of run.nodes)if(node.nodeId&&node.contentDigest)digests[node.nodeId]=node.contentDigest;
 let quote:StoryboardCostReport["quote"];
 try{quote=(await inspectStoryboardProduction(actor,input)).quote;}catch(error){quote={generationCredits:null,assemblyCredits:null,upperBound:false,assemblyUpperBound:false,newShots:input.nodes.filter(node=>!node.reuseCompleted).length,reusedShots:input.nodes.filter(node=>node.reuseCompleted).length,byocShots:0,error:error instanceof ModelConfigError?error.message:"本轮报价暂不可用"};}
 const limit=500;
 return {planId:plan.id,revision:plan.revision,observedAt:new Date().toISOString(),totals:{plan:summarizeCosts(actual),sharedHistory:summarizeCosts(items.filter(item=>item.attribution==="shared-node")),reusedReferences:summarizeCosts(items.filter(item=>["inherited","referenced-media"].includes(item.attribution)))},stages:(["video","audio-processing","media",...(inspections.size?["review"]:[])] as StoryboardCostItem["kind"][]).map(kind=>({kind,totals:summarizeCosts(actual.filter(item=>item.kind===kind))})),items:items.slice(0,limit),detailCount:items.length,detailsTruncated:items.length>limit,quote,executionCeiling:{generationUpperCredits:quote.generationCredits,assemblyUpperCredits:quote.assemblyCredits,implicitBudgetAdded:false},impact:storyboardCostImpact(plan.document,input.nodes,current,{document:baseline?.document,digests}),baselineRevision:baseline?.revision||null,coverage:{allRelatedTasksCounted:plan.document.shots.every(shot=>shot.takes.every(take=>history.tasks.some(task=>task.id===take.taskId))),legacyHistoryMayBeIncomplete:true,baselineNodeDigestsAvailable:Object.keys(digests),missingReferencedTaskIds:[...new Set(plan.document.shots.flatMap(shot=>shot.takes.map(take=>take.taskId)))].filter(id=>!history.tasks.some(task=>task.id===id)),referencedMaterialCostsUnknown:(plan.document.audio||[]).map(track=>track.artworkId).filter(id=>!media.some(job=>job.outputArtworkIds.includes(id))),unattributedHistory:items.some(item=>item.attribution==="shared-node"),unacceptedOperations,speechGeneration:"unverified"}};
}
