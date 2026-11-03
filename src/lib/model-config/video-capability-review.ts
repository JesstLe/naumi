import {createHash} from "node:crypto";
import {DOCUMENTED_VIDEO_FAMILIES} from "./video-family-capabilities";
import {makeVideoFamilyCapabilityUpgradePlan} from "./video-family-capability-upgrade";
import {ModelConfigError,type ModelConfig} from "./types";

export type VideoCapabilityReviewRow = {
  publicId:string; label:string; status:"ready"|"current"|"conflict";
  beforeModes:string[]; afterModes:string[]; beforeMultiShot?:boolean; afterMultiShot?:boolean; fields:string[]; reason?:string;
};
export type VideoCapabilityReview = {version:number; rows:VideoCapabilityReviewRow[]; publicIds:string[]; reviewDigest:string};

/** Operator preview only. Never rewrite the published catalog while reading it. */
export function reviewVideoCapabilityUpgrade(config:ModelConfig,version:number):VideoCapabilityReview {
  const rows:VideoCapabilityReviewRow[]=[];
  for(const entry of DOCUMENTED_VIDEO_FAMILIES){
    const model=config.publicModels.find(model=>model.id===entry.publicId);
    if(!model)continue;
    const upstream=config.upstreamModels.find(upstream=>upstream.id===model.target.id);
    const row={publicId:entry.publicId,label:model.label,beforeModes:upstream?.capabilities.video?.modes||[],afterModes:entry.definition.modes||[],beforeMultiShot:upstream?.capabilities.video?.supportsMultiShot===true,afterMultiShot:entry.definition.supportsMultiShot===true};
    try{
      const plan=makeVideoFamilyCapabilityUpgradePlan(config,[entry]);
      if(plan.missing.length||plan.skipped.length){rows.push({...row,status:"conflict",fields:[],reason:"现有通道与已核对定义不一致"});continue;}
      rows.push({...row,status:plan.patches.length?"ready":"current",fields:plan.patches.map(patch=>patch.field)});
    }catch(error){
      if(!(error instanceof ModelConfigError))throw error;
      rows.push({...row,status:"conflict",fields:[],reason:error.message});
    }
  }
  const publicIds=rows.filter(row=>row.status==="ready").map(row=>row.publicId);
  const plan=makeVideoFamilyCapabilityUpgradePlan(config,DOCUMENTED_VIDEO_FAMILIES.filter(entry=>publicIds.includes(entry.publicId)));
  const reviewDigest=createHash("sha256").update(JSON.stringify({version,publicIds,patches:plan.patches})).digest("hex");
  return {version,rows,publicIds,reviewDigest};
}

/** The exact reviewed write set must still match. Publication owns version CAS. */
export function applyReviewedVideoCapabilityUpgrade(config:ModelConfig,version:number,reviewDigest:string,publicIds:string[]) {
  const review=reviewVideoCapabilityUpgrade(config,version);
  if(review.reviewDigest!==reviewDigest || JSON.stringify(review.publicIds)!==JSON.stringify(publicIds))
    throw new ModelConfigError("CONFIG_CONFLICT","视频能力或升级范围已改变，请重新预览",409);
  if(!publicIds.length)throw new ModelConfigError("VIDEO_CAPABILITIES_CURRENT","没有待更新的视频能力",409);
  return makeVideoFamilyCapabilityUpgradePlan(config,DOCUMENTED_VIDEO_FAMILIES.filter(entry=>publicIds.includes(entry.publicId)));
}
