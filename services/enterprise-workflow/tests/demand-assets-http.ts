import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
export const demandPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==','base64');
export async function checkDemandAssetsHttp(json:(path:string,body?:unknown,status?:number)=>Promise<any>,binary:(path:string,body?:Buffer)=>Promise<Response>){
 const orderId=randomUUID(),assetId=randomUUID();let version=0;
 const action=async(action:unknown,status=200)=>{const r=await json('/v1/commands',{commandId:randomUUID(),orderId,expectedVersion:version,action},status);if(r.order)version=r.order.version;return r;};
 await action({type:'create',title:'需求附件HTTP验收',brief:'reference only',acceptance:'private exact bytes'});
 const query=new URLSearchParams({assetId,orderId,expectedVersion:String(version),name:'参考图.png'}),r=await binary('/v1/demand-files/upload?'+query,demandPng);assert.equal(r.status,200,await r.clone().text());const uploaded=await r.json() as any;assert.equal(uploaded.asset.sha256,createHash('sha256').update(demandPng).digest('hex'));assert.equal((await (await binary('/v1/demand-files/upload?'+query,demandPng)).json() as any).replayed,true);
 assert.equal((await json('/v1/demand-files/assets?orderId='+orderId)).assets.length,1);assert.equal((await json('/v1/orders/'+orderId)).order.version,1);
 await action({type:'set-demand-assets',assetIds:[assetId],reason:'explicit reference selection'});const selected=(await json('/v1/orders/'+orderId)).order.demandAssets;assert.equal(selected[0].id,assetId);await action({type:'submit-requirement'});await action({type:'set-demand-assets',assetIds:[],reason:'forged post-submit'},409);
 const file=await binary('/v1/demand-files/download?id='+assetId);assert.equal(file.status,200,await file.clone().text());assert(file.headers.get('content-disposition')?.includes('attachment'));assert.deepEqual(Buffer.from(await file.arrayBuffer()),demandPng);const image=await binary('/v1/demand-files/preview?id='+assetId);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),demandPng);
 assert.equal((await json('/v1/demand-files/scan-history?id='+assetId)).total,1);assert.deepEqual((await json('/v1/orders/'+orderId)).order.demandAssets,selected);return {orderId,assetId};
}
