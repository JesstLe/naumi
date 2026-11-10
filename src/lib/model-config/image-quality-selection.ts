import {canonicalPublicModelId} from "./public-identity";
import {IMAGE_QUALITY_IDS} from "../image-quality";
import {selectedBusinessOption} from "./business";
import {publicUpstreamIds} from "./channel-policy";
import {cutoutImageQuality} from "./cutout-quality";
import {DISPLAY_QUALITIES,selectedImagePreset} from "./image-preset";
import {qualityPresentation} from "./quality-policy";
import type {ModelConfig} from "./types";

/** One quality decision for new quotes, planners and HTTP preparation. Saved quotes bypass it. */
export function selectImageQuality(config:ModelConfig,feature:string|undefined,modelId:string|undefined,value:unknown,binding?:string,environmentQuality=process.env.OPENAI_IMAGE_QUALITY||"medium"){
  modelId=canonicalPublicModelId(config.publicModels,modelId);
 const preset=selectedImagePreset(config,feature,modelId,binding),option=selectedBusinessOption(config,feature,modelId);
  const model=config.publicModels.find(m=>m.id===modelId),ids=model?publicUpstreamIds(config,model):[];
  const upstreams=config.upstreamModels.filter(u=>ids.includes(u.id)&&u.enabled&&config.providers.some(p=>p.id===u.providerId&&p.enabled));
  const qualities:readonly string[]=preset?[...DISPLAY_QUALITIES]:qualityPresentation(upstreams)?.qualities||option?.parameters?.qualities||Array.from(new Set(upstreams.flatMap(u=>u.capabilities.qualities)));
  const raw=String(value||"").trim().toLowerCase(),requested=feature==="tool.cutout"||binding==="image.cutout"?cutoutImageQuality(raw)||"":raw;
  const malformed=!!requested&&![...IMAGE_QUALITY_IDS,"auto"].includes(requested as any);
  const environment=String(environmentQuality).trim().toLowerCase();
  const defaultQuality=qualities.includes(environment)?environment:qualities[0]||"medium";
  const unsupported=!!requested&&!malformed&&!!qualities.length&&!qualities.includes(requested);
  const quality=!requested||malformed||unsupported?defaultQuality:requested;
  const reason=!requested?null:malformed?"malformed-quality-value":unsupported?"channel-unsupported":null;
  return {quality,requested,raw,reason};
}
