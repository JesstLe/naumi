import {BillingError,type BillingQuote} from '../billing/types';

/** A public confirmation proposal, not a replacement for the original frozen
 * authorization and never a client-supplied execution/billing snapshot. */
export type WorkflowStageQuote={version:number;credits:number;authorizedCredits:number;authorization:boolean;modelVersion?:number};

export class WorkflowBudgetChanged extends BillingError{
 readonly quote:WorkflowStageQuote;
 constructor(quote:BillingQuote){
  super('PRICE_CHANGED','此阶段报价超出制作链原授权，请确认后继续',409);
  this.quote={version:quote.configVersion,credits:quote.requestedCredits,authorizedCredits:quote.authorizedCredits,authorization:quote.tariff.pricing.mode==='api-cost-plus',...(quote.modelVersion===undefined?{}:{modelVersion:quote.modelVersion})};
 }
}

export function matchesWorkflowStageConfirmation(quote:WorkflowStageQuote,confirmation:{version:number;credits:number}){
 const required=quote.authorization?quote.authorizedCredits:quote.credits;
 return confirmation.version===quote.version&&Number.isSafeInteger(confirmation.credits)&&Number.isSafeInteger(required)&&confirmation.credits>=required;
}
