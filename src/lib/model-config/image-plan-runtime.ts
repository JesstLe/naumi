import 'server-only';
import {compileImageParameterPlan,imagePlanSelection,type ImageParameterPlan} from './image-parameter-plan';
import type {ModelExecutionScope} from './context';
import {currentImagegenStep} from '../imagegen/context';
import {currentImageOperationParameters} from '../image-gateway';

/** All inputs come from a server-owned frozen execution and its per-image
 * operation. No current catalogue or supplier discovery is read on execution. */
export function executionImageParameterPlan(scope:ModelExecutionScope,body:Record<string,any>={},selected?:{quality:string;resolution:string;ratio:string}):ImageParameterPlan|undefined{
 if(scope.frozen.imageParameterPlanVersion!==1)return;
 const operation=currentImageOperationParameters(),facts=scope.frozen.facts;
 // Legacy route operations may already carry a wire quality. New plan audits
 // and transports share the frozen stage's semantic quality; explicit selected
 // input is reserved for the adapter's already resolved semantic selection.
 const selection=imagePlanSelection(selected||{quality:facts?.quality||scope.frozen.requestedParameters?.quality||String(body.quality||'medium'),resolution:operation?.resolution||facts?.requestedResolution||facts?.resolution||'1K',ratio:operation?.ratio||facts?.ratio||'1:1'},currentImagegenStep()?.request);
 const saved=Object.values(scope.frozen.imageParameterPlans||{}).find(p=>p.wireModel===scope.connection.wireModel&&p.protocol===scope.connection.protocol&&(!scope.channelGuard?.upstreamId||p.upstreamId===scope.channelGuard.upstreamId));
 if(saved&&saved.requested.quality===selection.quality&&saved.requested.resolution===selection.resolution&&saved.requested.ratio===selection.ratio&&(!selection.advanced||JSON.stringify(saved.requested.advanced)===JSON.stringify(selection.advanced)))return structuredClone(saved);
 return compileImageParameterPlan({id:scope.channelGuard?.upstreamId||saved?.upstreamId||scope.frozen.target.id,model:scope.connection.wireModel,parameterMap:scope.parameterMap},selection,{publicModelId:scope.frozen.publicModelId,protocol:scope.connection.protocol,modelVersion:scope.frozen.modelVersion,adapter:scope.connection.options?.imageAdapter});
}
