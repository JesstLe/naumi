/** A failed HTTP response or a zero customer debit is not a supplier receipt.
 * Every original paid unit needs its own definite execution-stage evidence. */
export type ImageRejectionStage={operationId:string;state:string;imageOperationId?:string|null};
export function confirmsImageRejection(root:string,units:readonly string[],stages:readonly ImageRejectionStage[]):boolean{
 if(!root||!units.length||new Set(units).size!==units.length||units.some(id=>id!==root&&!id.startsWith(root+':'))||!stages.length)return false;
 const expected=new Set(units),confirmed=new Set<string>();
 for(const stage of stages){
  if(stage.state!=='rejected-not-charged'||stage.operationId!==root&&!expected.has(stage.operationId))return false;
  const unit=stage.imageOperationId||(expected.has(stage.operationId)?stage.operationId:undefined);
  if(!unit||!expected.has(unit)||stage.operationId!==root&&stage.operationId!==unit)return false;
  confirmed.add(unit);
 }
 return units.every(unit=>confirmed.has(unit));
}
