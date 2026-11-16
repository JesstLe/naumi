import type {VideoNodeConfig} from './client-settings';
import type {OrderedInput} from './references';
import type {VideoUiContract} from './ui-contract';
import {videoUiParameters,videoUiValue} from './ui-draft';
import type {PublicQuote} from '../billing/client';

// Display-only preset: 20 credits / 5 seconds. Never a reservation or tariff.
export const VIDEO_ESTIMATED_CREDITS_PER_SECOND=4;
export function videoKnownPrice(quote:PublicQuote|undefined,count:number){
  if(!quote)return undefined;
  const credits=quote.mode==='api-cost-plus'?quote.authorizedCredits??quote.reserveCredits:quote.credits;
  return Number.isFinite(credits)&&credits>=0?credits*count:undefined;
}
export function videoPriceSelectionKey(config:VideoNodeConfig,contract?:VideoUiContract){
  return JSON.stringify([config.modelId,config.providerId,config.parameters,config.durationSeconds,config.resolution,config.aspectRatio,config.generateAudio,config.width,config.height,contract?.modelVersion,contract?.modelDigest]);
}
export function videoPriceEstimate(config:VideoNodeConfig,inputs:readonly OrderedInput[],contract:VideoUiContract|undefined,count=1,facts?:{durationSeconds?:number}){
  if(config.comfyWorkflowId)return 0;
  const duration=facts?.durationSeconds??videoUiValue(config,'durationSeconds')??(contract?videoUiParameters(config,inputs,contract).durationSeconds?.default:undefined);
  return typeof duration==='number'&&Number.isFinite(duration)&&duration>0&&Number.isInteger(count)&&count>0
    ?Math.ceil(duration*VIDEO_ESTIMATED_CREDITS_PER_SECOND*count):undefined;
}
export function videoQuoteSelection(config:VideoNodeConfig,facts?:{resolution?:string;aspectRatio?:string},canvas=false){
  return {feature:'video.generate' as const,quantity:1,...(canvas?{canvas:true}:{}),modelId:config.modelId,providerId:config.providerId,
    resolution:facts?.resolution??(typeof videoUiValue(config,'resolution')==='string'?videoUiValue(config,'resolution') as string:undefined),
    ratio:facts?.aspectRatio??(typeof videoUiValue(config,'aspectRatio')==='string'?videoUiValue(config,'aspectRatio') as string:undefined)};
}
