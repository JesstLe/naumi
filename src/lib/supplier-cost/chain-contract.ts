export const SUPPLIER_CHAIN_PAGE_SIZE=25;
export type SupplierChainCollection="calls"|"reviews"|"adjustments";
export type SupplierChainRead =
  | {view:SupplierChainCollection;after?:string}
  | {view:"call";call:string}
  | {view:"billing"};
export type SupplierChainRow=Record<string,any>&{id:string};
export type SupplierChainPage={view:SupplierChainCollection;rows:SupplierChainRow[];next:string|null};
export type SupplierChainLegacy={rows:SupplierChainRow[];outputs?:Record<string,any>[];billing?:unknown;feeReviews?:SupplierChainRow[];adjustments?:SupplierChainRow[]};
export function supplierChainUrl(operation:string,input:SupplierChainRead){
  const query=new URLSearchParams({view:input.view});
  if('after'in input&&input.after)query.set('after',input.after);
  if('call'in input)query.set('call',input.call);
  return '/api/admin/supplier-cost/operations/'+encodeURIComponent(operation)+'?'+query;
}
