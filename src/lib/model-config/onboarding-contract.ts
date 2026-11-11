import type {FeatureId} from '../billing/rules/registry';
import type {Pricing} from '../billing/types';
import type {UpstreamModel} from './types';

export type OnboardingPrice = {mode:'copy';sourceModelId:string}|Extract<Pricing,{mode:'fixed'|'matrix'}>|{mode:'per-feature';prices:Partial<Record<FeatureId,Extract<Pricing,{mode:'fixed'|'matrix'}>>>};
export type OnboardingEntry = {
  publicId:string; label:string;
  source:{upstreamId:string}|{upstream:UpstreamModel};
  features:FeatureId[];
  price:OnboardingPrice;
};
export type OnboardingInput = {entries:OnboardingEntry[]; enabled:boolean; capabilityConfirmed:boolean};
export type OnboardingDraft = {id:string;revision:number;basedOnVersion:number;entries:OnboardingEntry[];billingVersion:number;recoveredFromVersion?:number};
export type OnboardingView = {
  upstreams:UpstreamModel[];
  incomplete:{id:string;label:string;reason:string}[];
};
