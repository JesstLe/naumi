import 'server-only';
import {compileImageParameterPlan,imagePlanSelection,type ImageParameterPlan} from './image-parameter-plan';
import type {ModelExecutionScope} from './context';
import {currentImagegenStep} from '../imagegen/context';
import {currentImageOperationParameters} from '../image-gateway';
import {ModelConfigError} from './types';

/** A cutout's whole purpose is a transparent result. The async APIMart/APIB
 * adapter does not forward the SDK body's background under parameter plans, so
 * there transparency must be an explicit mapped plan parameter. Unmapped, the
 * channel would receive an opaque request, be paid, and then fail the
 * transparency check after delivery. OpenAI-images channels forward the body. */
export const CUTOUT_TRANSPARENCY_UNMAPPED='抠图通道尚未配置透明背景参数，请管理员在模型映射中设置；本次未提交，未扣积分';
function cutoutScope(scope:ModelExecutionScope){return scope.frozen.binding==='image.cutout'||scope.frozen.feature==='tool.cutout';}
export function assertCutoutTransparencyMapped(scope:ModelExecutionScope){
 if(scope.frozen.imageParameterPlanVersion!==1||!cutoutScope(scope)||scope.connection.protocol!=='apimart-images')return;
 if(scope.parameterMap.imagegen?.transparent===undefined)throw new ModelConfigError('MODEL_INCOMPATIBLE',CUTOUT_TRANSPARENCY_UNMAPPED,422);
}

/** All inputs come from a server-owned frozen execution and its per-image
 * operation. No current catalogue or supplier discovery is read on execution. */
export function executionImageParameterPlan(scope:ModelExecutionScope,body:Record<string,any>={},selected?:{quality:string;resolution:string;ratio:string}):ImageParameterPlan|undefined{
 if(scope.frozen.imageParameterPlanVersion!==1)return;
 const operation=currentImageOperationParameters(),facts=scope.frozen.facts;
 const step=currentImagegenStep()?.request;
 const request=cutoutScope(scope)?{...(step||{}),output:{...(step?.output||{}),background:'transparent'}}:step;
 // Route operations may already contain a wire alias. Only the frozen stage
 // owns semantic quality; selected is the adapter's resolved semantic input.
 const selection=imagePlanSelection(selected||{quality:facts?.quality||scope.frozen.requestedParameters?.quality||String(body.quality||'medium'),resolution:operation?.resolution||facts?.requestedResolution||facts?.resolution||'1K',ratio:operation?.ratio||facts?.ratio||'1:1'},request);
 const saved=Object.values(scope.frozen.imageParameterPlans||{}).find(p=>p.wireModel===scope.connection.wireModel&&p.protocol===scope.connection.protocol&&(!scope.channelGuard?.upstreamId||p.upstreamId===scope.channelGuard.upstreamId));
 if(saved&&saved.requested.quality===selection.quality&&saved.requested.resolution===selection.resolution&&saved.requested.ratio===selection.ratio&&(!selection.advanced||JSON.stringify(saved.requested.advanced)===JSON.stringify(selection.advanced)))return structuredClone(saved);
 return compileImageParameterPlan({id:scope.channelGuard?.upstreamId||saved?.upstreamId||scope.frozen.target.id,model:scope.connection.wireModel,parameterMap:scope.parameterMap},selection,{publicModelId:scope.frozen.publicModelId,protocol:scope.connection.protocol,modelVersion:scope.frozen.modelVersion,adapter:scope.connection.options?.imageAdapter});
}
