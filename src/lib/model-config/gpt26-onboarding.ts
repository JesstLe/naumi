import manifest from '../../../docs/providers/apib-image26-preparation-20261110.json';
import type {UpstreamModel} from './types';

/** Explicit related-document templates, not a name-based capability detector. */
export const GPT26_PROFILES = [
  {id:'gpt26-flare',publicId:'image2.6-flare',label:'Image 2.6 Flare',wire:'gpt-image-2.6-flare'},
  {id:'gpt26-sunburst',publicId:'image2.6-sunburst',label:'Image 2.6 Sunburst',wire:'gpt-image-2.6-sunburst'},
  {id:'gpt26-ext-flare',publicId:'image2.6-ext-flare',label:'Image 2.6 Ext Flare',wire:'gpt-image-2.6-ext',version:'flare'},
  {id:'gpt26-ext-sunburst',publicId:'image2.6-ext-sunburst',label:'Image 2.6 Ext Sunburst',wire:'gpt-image-2.6-ext',version:'sunburst'},
] as const;
export function gpt26Upstream(profileId:string,providerId:string):UpstreamModel{
  const profile=GPT26_PROFILES.find(p=>p.id===profileId);
  if(!profile)throw new Error('未知的GPT Image 2.6契约');
  const source=manifest.models.find(m=>m.id===profile.wire)!;
  const u=structuredClone(source.upstream) as unknown as UpstreamModel;
  u.id=`${providerId}:${profile.wire}${'version'in profile?':'+profile.version:''}`;
  u.providerId=providerId;u.label=profile.label;
  // Native tiers and ordinary reference edits use the existing protocol contract.
  // Do not invent intrinsic identity/text scores merely to admit an edit.
  u.parameterMap.parameterContract='conventional';
  if('version'in profile)u.parameterMap.version=profile.version;
  // Only the explicit create/accept use case can enable or confirm a template.
  u.enabled=false;u.capabilities.verified=false;
  return u;
}
