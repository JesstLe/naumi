import {videoDiagnostic,type VideoDraftPreparation,type ResolvedVideoInput,type VideoResult} from './execution-contract';

/** Resolve only an explicit Profile-owned fact dependency, never arbitrary
 * snapshot differences. Other parameters/binding/asset identities stay frozen. */
export function resolvePreparedVideoFacts(preparation:VideoDraftPreparation,inputs:ResolvedVideoInput[],requireAll:boolean):VideoResult<VideoDraftPreparation>{
 const id=preparation.durationFromInputId;if(!id)return {ok:true,value:preparation};
 const source=inputs.find(i=>i.id===id);
 if(!source&&!requireAll)return {ok:true,value:preparation};
 if(!source||source.kind!=='video'||!source.asset.durationSeconds)return {ok:false,diagnostics:[videoDiagnostic('dependency','SOURCE_DURATION_UNAVAILABLE','inputs','来源视频真实时长尚未解析','等待所属来源视频完成',id)]};
 const {durationFromInputId:_dependency,...known}=preparation,duration=source.asset.durationSeconds;
 return {ok:true,value:{...known,effectiveParameters:{...known.effectiveParameters,durationSeconds:duration},billingFacts:{...known.billingFacts,durationSeconds:duration}}};
}
