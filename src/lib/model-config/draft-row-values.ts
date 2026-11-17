import type {PublicModel,UpstreamModel} from './types';

export type DraftUpstreamRow={id:string;provider_id:string;model:string;label:string;modality:UpstreamModel['modality'];enabled:boolean;
 capabilities:UpstreamModel['capabilities'];parameter_map:UpstreamModel['parameterMap'];cost_ref:string|null;procurement:UpstreamModel['procurement']|null};
export type DraftPublicModelRow={id:string;label:string;modality:PublicModel['modality'];enabled:boolean;visible:boolean;
 previous_ids:PublicModel['previousIds']|null;tool_scope:PublicModel['toolScope']|null;display_resolutions:PublicModel['displayResolutions']|null;
 supplier_routing:PublicModel['supplierRouting']|null} & ({upstream_target:string;pool_target:null}|{upstream_target:null;pool_target:string});

export const draftUpstreamFromRow=(u:DraftUpstreamRow):UpstreamModel=>({id:u.id,providerId:u.provider_id,model:u.model,label:u.label,modality:u.modality,enabled:u.enabled,capabilities:u.capabilities,parameterMap:u.parameter_map,...(u.cost_ref?{costRef:u.cost_ref}:{}),...(u.procurement?{procurement:u.procurement}:{})});
export const draftPublicModelFromRow=(m:DraftPublicModelRow):PublicModel=>({id:m.id,...(m.previous_ids?{previousIds:m.previous_ids}:{}),label:m.label,modality:m.modality,enabled:m.enabled,visible:m.visible,...(m.tool_scope?{toolScope:m.tool_scope}:{}),...(m.display_resolutions?{displayResolutions:m.display_resolutions}:{}),...(m.supplier_routing?{supplierRouting:m.supplier_routing}:{}),target:m.upstream_target!==null?{type:'upstream',id:m.upstream_target}:{type:'pool',id:m.pool_target}});
