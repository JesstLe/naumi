import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export const sampleForm=()=>({title:'电商设计需求',description:'动态字段验收',catalogRequired:false,fields:[
 {id:'f_urgent',label:'是否加急',help:'',type:'boolean' as const,required:true,maxLength:100,min:null,max:null,options:[],visibleWhen:null},
 {id:'f_count',label:'图片数量',help:'允许零',type:'number' as const,required:true,maxLength:100,min:0,max:100,options:[],visibleWhen:null},
 {id:'f_reason',label:'加急原因',help:'',type:'textarea' as const,required:true,maxLength:100,min:null,max:null,options:[],visibleWhen:{fieldId:'f_urgent',equals:true}},
]});
export async function checkFormsHttp(call:(path:string,body?:unknown,expected?:number,who?:string)=>Promise<any>){
 const templateId=randomUUID(),orderId=randomUUID(),definition=sampleForm();
 const c={commandId:randomUUID(),templateId,expectedVersion:0,reason:'fixture template draft',action:{type:'save-draft',definition}};
 await call('/v1/demand-forms',c);assert.equal((await call('/v1/demand-forms',c)).replayed,true);
 const publish={commandId:randomUUID(),templateId,expectedVersion:1,reason:'independent review',action:{type:'publish'}};
 assert.equal((await call('/v1/demand-forms',publish,403)).error.code,'FORM_SELF_PUBLISH_FORBIDDEN');await call('/v1/demand-forms',publish,200,'reviewer');
 const pub=await call('/v1/demand-forms?action=version&id='+templateId+'&revision=1');assert.equal(pub.definition.fields.length,3);
 let version=0;const command=async(action:unknown,status=200)=>{const r=await call('/v1/commands',{commandId:randomUUID(),orderId,expectedVersion:version,action},status);if(r.order)version=r.order.version;return r;};
 await command({type:'create',title:'动态表单HTTP验收',brief:'isolated',acceptance:'version frozen'});
 await command({type:'set-demand-form',selection:{templateId,revision:1,values:{f_urgent:true,f_count:0}},reason:'incomplete draft'});
 const missing=await command({type:'submit-requirement'},400);assert.deepEqual(missing.error.fields,[{fieldId:'f_reason',code:'REQUIRED'}]);
 const filled=await command({type:'set-demand-form',selection:{templateId,revision:1,values:{f_urgent:false,f_count:0,f_reason:'保留隐藏原值'}},reason:'preserve zero false hidden'});assert.equal(filled.order.form.values.f_count,0);await command({type:'submit-requirement'});
 await call('/v1/demand-forms',{...c,commandId:randomUUID(),expectedVersion:2,action:{type:'save-draft',definition:{...definition,title:'新版需求'}}});await call('/v1/demand-forms',{...publish,commandId:randomUUID(),expectedVersion:3},200,'reviewer');
 const frozen=(await call('/v1/orders/'+orderId)).order.form;assert.equal(frozen.revision,1);assert.equal(frozen.definition.title,definition.title);assert.equal(frozen.values.f_reason,'保留隐藏原值');
 assert.equal((await call('/v1/demand-forms?action=history&id='+templateId)).total,4);
 return {templateId,orderId};
}
