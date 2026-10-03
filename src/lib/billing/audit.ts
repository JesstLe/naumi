import type {BillingQuote} from "./types";
import {estimateCost,costRateFor} from "./costs";
export type CostAuditFields={billingConfigVersion:number|null;costCurrency:string|null;costAmountMicros:string|null;costSource:string|null;costActual:boolean|null;costCredits:number|null;marginCredits:number|null};
export function frozenCostAudit(q:BillingQuote,image:{id:string;quality:string;platformFunded?:boolean;providerId?:string;modelId?:string},billedCredits:number,taskShares=1):CostAuditFields{
 const effective={...q,facts:{...q.facts,...(image.providerId?{providerId:image.providerId}:{}),...(image.modelId?{modelId:image.modelId}:{})}};
 const estimated=estimateCost(effective,{state:"succeeded",items:[{id:image.id,state:"succeeded",executedQuality:image.quality,platformFunded:image.platformFunded}]}),rate=costRateFor(effective,image.quality);
 const amount=estimated?(rate?.unit==="task"?BigInt(estimated.amountMicros)/BigInt(taskShares):BigInt(estimated.amountMicros)).toString():null;
 const credit=estimated?.currency==="credits"&&amount!==null?Number(amount)/1000000:null;
 return {billingConfigVersion:q.configVersion,costCurrency:estimated?.currency??null,costAmountMicros:amount,costSource:estimated?.source??null,costActual:estimated?.actual??null,costCredits:credit,marginCredits:credit===null?null:billedCredits-credit};
}
