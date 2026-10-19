require('tsx/cjs');
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const {submitCanvasImagegen}=require('../src/lib/imagegen/canvas-client.ts'),{ImagegenHttpError}=require('../src/lib/imagegen/http.ts');
class MemoryStorage{constructor(){this.values=new Map()}get length(){return this.values.size}key(i){return [...this.values.keys()][i]??null}getItem(k){return this.values.get(k)||null}setItem(k,v){this.values.set(k,v)}removeItem(k){this.values.delete(k)}}
(async()=>{let checks=0;const original=global.fetch;for(const scenario of ['input-rejected','plan-rejected','cancelled','storage-fails','submit-rejected','submit-unknown']){
 const storage=new MemoryStorage();global.sessionStorage=storage;global.window={localStorage:new MemoryStorage(),sessionStorage:storage,crypto:webcrypto,confirm:()=>scenario!=='cancelled'};let posts=0;
 if(scenario==='storage-fails')storage.setItem=()=>{throw Error('storage quota')};
 global.fetch=async(input,init={})=>{const url=String(input);
 if(url==='/api/imagegen/inputs')return Response.json(scenario==='input-rejected'?{error:'素材准备失败'}:{artworkId:'asset-12345678-1234-4234-8234-123456789abc',url:'/media/ref.png',width:640,height:640},{status:scenario==='input-rejected'?400:200});
 if(url==='/api/imagegen/plan'){if(scenario==='plan-rejected')return Response.json({error:'参数不可用'},{status:400});return Response.json({request:JSON.parse(init.body),steps:[{operation:'generate'}],intent:{background:'opaque'},totalCredits:1,billingVersion:1,modelVersion:1,confirmationRequired:scenario==='cancelled',warnings:[]})}
 if(url==='/api/imagegen'&&init.method==='POST'){posts++;if(scenario==='submit-rejected')return Response.json({error:'明确未受理',accepted:false},{status:400});throw Error('fetch failed')}
 if(url.startsWith('/api/imagegen?'))return Response.json({error:'temporarily missing'},{status:404});throw Error('unexpected URL '+url);
 };
 const form=new FormData();form.set('prompt','测试商品主体');form.set('imagegenNodeId','node-A');form.set('ratio','3:4');if(scenario==='input-rejected')form.set('image',new File(['fixture'],'ref.png',{type:'image/png'}));
 if(scenario==='submit-unknown'){const result=await(await submitCanvasImagegen(form,undefined,undefined,{owner:'fixture@example.test',project:'P'})).json();assert.match(result.jobId,/^imagegen-/);assert.equal(storage.length,1);await submitCanvasImagegen(form,undefined,undefined,{owner:'fixture@example.test',project:'P'});assert.equal(posts,1);checks+=3;}
 else{await assert.rejects(()=>submitCanvasImagegen(form,undefined,undefined,{owner:'fixture@example.test',project:'P'}),e=>e instanceof ImagegenHttpError&&e.accepted===false);assert.equal(posts,scenario==='submit-rejected'?1:0);assert.equal(storage.length,0);checks+=3;}
 }global.fetch=original;console.log('SUBMISSION=PASS CHECKS='+checks+' PREFLIGHT_NOT_ACCEPTED=YES UNKNOWN_RECEIPT_REUSED=YES SUPPLIER_CALLS=0');
})().catch(e=>{console.error(e);process.exitCode=1});
