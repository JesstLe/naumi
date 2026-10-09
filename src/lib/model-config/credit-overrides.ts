import type { BillingFacts, ConfigSnapshot, Pricing } from "../billing/types";
import { matches } from "../billing/rules/evaluate";

export const MVP_CREDIT_PREFIX="mvp-credit-";
export function mvpCreditRule(snapshot:ConfigSnapshot,facts:BillingFacts){
  return facts.byok ? undefined : snapshot.config.features[facts.feature]?.rules.find(r=>r.id.startsWith(MVP_CREDIT_PREFIX) && r.pricing && matches(r.when,facts));
}
export function applyCreditOverride(snapshot:ConfigSnapshot,base:ConfigSnapshot,facts:BillingFacts):ConfigSnapshot{
  const rule=mvpCreditRule(snapshot,facts);if(!rule?.pricing)return base;
  const config=structuredClone(base.config),tariff=config.features[facts.feature];
  tariff.pricing=structuredClone(rule.pricing);tariff.rules=[];
  tariff.settlement={...tariff.settlement,qualityBasis:"requested",successBasis:"successful-units",failureBps:0,reserveBps:10000};
  return {version:snapshot.version,config};
}
export type MvpCreditPricing=Extract<Pricing,{mode:"fixed"|"quality-resolution"}>;
