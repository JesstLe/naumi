import "server-only";
import {totalPaidCents} from "../db";
import {getBillingRuntime,meteringFor} from "../billing/server";
import {quote} from "../billing/quote";
import {BillingError,type BillingQuote} from "../billing/types";
import type {MediaJobRequest} from "./media-job-schema";

export async function mediaBillingQuote(actor:string,action:MediaJobRequest["action"]):Promise<BillingQuote>{
  const current=await (await getBillingRuntime()).config.current();
  const result=quote(current,{feature:"video.process",quantity:1,quality:"medium",resolution:"1K",providerId:"local-media",modelId:action,byok:false,metered:await meteringFor(current),paidFen:await totalPaidCents(actor),userGroup:"default"});
  if(["api-cost-plus","usage"].includes(result.tariff.pricing.mode))throw new BillingError("INVALID_CONFIG","本地媒体处理不能使用供应商接口用量计费",422);
  return result;
}
export class MediaPriceChangedError extends BillingError{
  readonly quote:{version:number;credits:number};
  constructor(value:BillingQuote){super("PRICE_CHANGED","请确认本次媒体处理积分",409);this.quote={version:value.configVersion,credits:value.authorizedCredits};}
}
/** Old clients can still send confirmation fields; pricing always comes from
 * mediaBillingQuote and the transactional reservation, never those echoes. */
export function confirmMediaQuote(value:BillingQuote,_confirmation?:MediaJobRequest["billingConfirmation"]){
  return value;
}
