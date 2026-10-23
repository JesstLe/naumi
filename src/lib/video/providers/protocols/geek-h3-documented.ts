import {buildMiniMaxCreate,minimaxCodec} from "./minimax";
import {normalizeVideoInput,VideoContractError} from "../../contract";
import definitions from "../../../model-config/video-family-capabilities.json";
import type {VideoModelDefinition} from "../../capability-schema";
import type {VideoWireContext,VideoWireCodec} from "../wire";

function create(context:VideoWireContext){
  const spec=definitions.items.find(item=>item.providerId==="geeknow-video-h3"&&item.model===context.request.modelId);
  if(!spec)throw new VideoContractError("VIDEO_PROFILE_INPUT_UNSUPPORTED","视频型号没有对应的公开参数契约");
  const normalized=normalizeVideoInput(context.request as unknown as Record<string,unknown>,spec.definition as VideoModelDefinition);
  const wire=buildMiniMaxCreate({...context,request:{...context.request,...normalized}});
  // Geek accepts only the six concrete ratios. The older MiniMax profile's
  // frame=>adaptive rewrite is not part of this new supplier-specific contract.
  return {...wire,body:{...wire.body as Record<string,unknown>,ratio:normalized.aspectRatio}};
}
export const geekH3DocumentedCodec:VideoWireCodec={...minimaxCodec,create};
