import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function checkProjectsHttp(call:(path:string,body?:unknown,status?:number,who?:string)=>Promise<any>){
 const id=randomUUID(),milestoneId=randomUUID(),orderId=randomUUID(),base='/v1/projects';let version=0;
 const command=(action:any)=>({commandId:randomUUID(),id,expectedVersion:version,reason:'explicit native project action',action});
 const apply=async(action:any,who='manager')=>{const c=command(action),pr=await call(base,{operation:'preview',...c},200,who),made={operation:'apply',...c,previewHash:pr.previewHash,confirmed:true},r=await call(base,made,200,who);version=r.version;assert.equal((await call(base,made,200,who)).replayed,true);return {c,pr,made};};
 await apply({type:'create',code:'NATIVE-'+id.slice(0,8).toUpperCase(),title:'新品上市活动',brief:'真实HTTP项目验证，合成数据'});
 await apply({type:'milestones',milestones:[{id:milestoneId,title:'主视觉交付',targetAt:'2099-01-01T00:00:00Z',critical:true,dependsOn:[]}]});
 await call(base,{operation:'preview',...command({type:'transition',status:'approved'})},403,'manager');
 await apply({type:'transition',status:'approved'},'reviewer');await apply({type:'transition',status:'active'});
 const cd=await apply({type:'create-demand',orderId,title:'项目内的新需求',brief:'explicit draft',acceptance:'normal workflow after explicit submit',milestoneId});
 const detail=await call(base+'?action=detail&id='+id);assert.equal(detail.links.length,1);assert.equal(detail.links[0].order.status,'draft');assert.equal(detail.summary.ratio,null);assert.equal(detail.summary.ready,false);
 await call(base,{operation:'preview',...command({type:'link',orderId,milestoneId})},409);await call(base,{operation:'preview',...command({type:'transition',status:'retrospective'})},409);
 const observer=await call(base+'?action=detail&id='+id,undefined,200,'worker');assert.equal(observer.hiddenLinks,1);assert.equal(observer.links.length,0);assert(!JSON.stringify(observer).includes(orderId));
 await apply({type:'unlink',orderId});const o=await call('/v1/orders/'+orderId);assert.equal(o.status,'draft');assert.equal(o.version,1);const history=await call(base+'?action=history&id='+id);assert.equal(history.total,6);assert(!JSON.stringify(history).includes(orderId));
 console.log('PROJECT_HTTP_PASS: native_create=1 preview_apply_replay=1 milestones=1 independent_approve=1 active=1 draft_event=1 zero_ratio_null=1 not_ready=1 duplicate_denied=1 observer_hidden=1 unlink_keeps_order=1 history6=1');return {id,orderId,milestoneId};
}
