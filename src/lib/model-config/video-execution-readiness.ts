import {bindPublishedVideoExecution,publishedVideoExecutionSchema} from '../video/published-execution';
import {nativeVideoQueryMatches} from '../video/profiles/native-profile';
import {videoProfileProtocol} from '../video/capability-schema';
import {ModelConfigError,type ModelSnapshot} from './types';
import {modelAllowedForFeature} from './feature-model-policy';
import {publicUpstreamIds} from './channel-policy';

export type VideoExecutionReadiness={schemaVersion:1;modelVersion:number;modelDigest:string;ready:boolean;featureDisabled:boolean;models:number;channels:number;issues:Array<{publicModelId:string;upstreamId:string;code:string}>};
/** Release/configuration preparation only. No modes/limits/evidence reads,
 * model-name inference, config writes, credential access or supplier calls. */
export function videoExecutionReadiness(snapshot:ModelSnapshot):VideoExecutionReadiness{
 const result:VideoExecutionReadiness={schemaVersion:1,modelVersion:snapshot.version,modelDigest:snapshot.digest,ready:true,featureDisabled:snapshot.config.business?.['video.generate']?.enabled===false,models:0,channels:0,issues:[]};
 if(result.featureDisabled)return result;
 for(const model of snapshot.config.publicModels.filter(model=>model.modality==='video'&&model.enabled)){
  const feature=snapshot.config.business?.['video.generate'],option=feature?.options.find(option=>option.modelId===model.id);
  if(!modelAllowedForFeature(model,'video.generate')||option?.enabled===false||feature&&!option&&!feature.inheritExisting)continue;
  result.models++;const route=snapshot.config.business?.['video.generate']?.options.find(option=>option.modelId===model.id&&option.enabled)?.routing;const ids=[...new Set([...publicUpstreamIds(snapshot.config,model),...(route?.enabled?[route.defaultUpstreamId,...route.rules.map(rule=>rule.targetUpstreamId)]:[])])];
  if(!ids.length)result.issues.push({publicModelId:model.id,upstreamId:'',code:'VIDEO_ROUTE_UNAVAILABLE'});
  for(const id of ids){const upstream=snapshot.config.upstreamModels.find(u=>u.id===id),provider=snapshot.config.providers.find(p=>p.id===upstream?.providerId);
   if(upstream&&provider&&(!upstream.enabled||!provider.enabled))continue;
   result.channels++;
   let code:string|undefined;
   if(!upstream||!provider||!upstream.enabled||!provider.enabled||upstream.modality!=='video')code='VIDEO_ROUTE_UNAVAILABLE';
   else{
    const parsed=publishedVideoExecutionSchema.safeParse(upstream.parameterMap.videoExecution);
    if(!parsed.success)code='VIDEO_EXECUTION_NOT_CONFIGURED';
    else{
     const execution=parsed.data,profile=upstream.parameterMap.videoProfile??provider.options?.videoProfile;
     const query=execution.profileId==='native-video'?nativeVideoQueryMatches(execution.recipe.layout,profile,provider.protocol,execution.recipe.queryTransport):!!profile&&videoProfileProtocol(profile)===provider.protocol;
     if(!query)code='VIDEO_PROFILE_MISMATCH';
     else{const value=bindPublishedVideoExecution({...execution,modelVersion:snapshot.version,modelDigest:snapshot.digest},{publicModelId:model.id,wireModel:upstream.model,connectionId:provider.id});const described=value.profile.describe(value.binding);if(!described.ok)code=described.diagnostics[0].code;}
    }
   }
   if(code)result.issues.push({publicModelId:model.id,upstreamId:id,code});
  }
 }
 result.ready=!result.issues.length;return result;
}
export function assertVideoExecutionReady(value:VideoExecutionReadiness){if(!value.ready)throw new ModelConfigError('VIDEO_EXECUTION_MIGRATION_REQUIRED','视频执行绑定迁移尚未完成，保持旧版本服务',503,['videoExecution']);}
