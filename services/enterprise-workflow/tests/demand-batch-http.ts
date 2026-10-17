import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export const newDemand=(title='批量需求')=>({orderId:randomUUID(),title,brief:'商品图制作需求',acceptance:'文案与尺寸复核通过'});
export async function checkDemandBatchHttp(call:(path:string,body?:unknown,expected?:number)=>Promise<any>){
 const input={batchId:randomUUID(),entries:[newDemand('新品主图'),newDemand('新品详情页')],reason:'明确创建两条草稿'},preview=await call('/v1/demand-batches/preview',input);assert(preview.valid);assert.equal(preview.count,2);await call('/v1/orders/'+input.entries[0].orderId,undefined,404);
 const command={...input,previewHash:preview.previewHash,confirmed:true},r=await call('/v1/demand-batches/apply',command);assert.equal(r.items.length,2);assert.equal((await call('/v1/demand-batches/apply',command)).replayed,true);await call('/v1/demand-batches/apply',{...command,reason:'changed'},409);
 const source=(await call('/v1/orders/'+input.entries[0].orderId)).order;assert.equal(source.status,'draft');assert.equal(source.version,1);assert.deepEqual(source.tasks,[]);assert.equal(source.creationOrigin.batchId,input.batchId);
 const copy={batchId:randomUUID(),entries:[{...newDemand('复制后重新提报'),copy:{orderId:source.id,version:source.version,includeForm:false,includeCatalog:false,includeRouting:false}}],reason:'explicit copy'};const cp=await call('/v1/demand-batches/preview',copy);await call('/v1/demand-batches/apply',{...copy,confirmed:true,previewHash:cp.previewHash});
 const copied=(await call('/v1/orders/'+copy.entries[0].orderId)).order;assert.equal(copied.creationOrigin.orderId,source.id);assert.equal(copied.creationOrigin.version,1);assert.deepEqual((await call('/v1/orders/'+source.id)).order,source);
 const receipt=await call('/v1/demand-batches?action=detail&id='+input.batchId);assert.equal(receipt.items.length,2);assert((await call('/v1/demand-batches?action=list')).total>=2);return {batchId:input.batchId,orderId:source.id,copiedId:copied.id};
}
