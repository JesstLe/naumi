import assert from 'node:assert/strict';
import { AgentHarness,HarnessError,PublicOutputBuffer } from '../src/lib/agent/harness';
const baseline=process.argv.includes('--baseline');
const schema={type:'object',properties:{color:{type:'string'},confirm:{type:'boolean'}},required:['color']};
const harness=()=>{const h=new AgentHarness('fixture@test.local','cv-stream-fixture');h.configure([{name:'recolor_product',parameters:schema,write:true},{name:'generate_video',parameters:{type:'object'},write:true}]);return h};
const input='瓶子换成蓝色',h=harness();h.begin(input,()=>{});let intent='ALLOWED';try{h.check('recolor_product',{color:'#2E6FE0'})}catch(e){intent=(e as HarnessError).code}h.finish();
let output='';const b=new PublicOutputBuffer(h,x=>output+=x);const message='我会保持瓶型和背景，只把瓶身换成蓝色。';for(const c of message)b.push(c);const before=output.length;b.finish();assert.equal(output,message);
if(baseline){assert.equal(intent,'INTENT_REQUIRED');assert.equal(before,0);console.log('BASELINE=PASS INTENT=INTENT_REQUIRED CHARS_BEFORE_END=0');}
else {assert.equal(intent,'ALLOWED');assert(before>0);console.log('MODIFIED=PASS INTENT=ALLOWED CHARS_BEFORE_END='+before);}

async function extended() {
 if (baseline) return;
 const { reduceAgentProgress } = await import('../src/lib/canvas/agent-progress');
 const { agentActivityLabel } = await import('../src/lib/canvas/agent-activity');
 const { agentRestrictionMessage } = await import('../src/lib/agent/public-status');
 let checks=0;
 const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++};
 for(const input of ['瓶子换成蓝色','把瓶子换为红色','瓶身换成浅蓝色','不要换背景，瓶子换成蓝色','瓶子换成#2E6FE0']){
   const h=harness();h.begin(input,()=>{});assert(h.check('recolor_product',{color:'#2E6FE0'}));checks++;
   assert.throws(()=>h.check('generate_video',{}),(e:any)=>e.code==='INTENT_REQUIRED');checks++;h.finish();
 }
 for(const input of ['确认执行','不要把瓶子换成蓝色','只分析瓶子换成蓝色的效果','怎么把瓶子换成蓝色']){
   const h=harness();h.begin(input,()=>{});assert.throws(()=>h.check('recolor_product',{color:'#2E6FE0'}),(e:any)=>e.code==='INTENT_REQUIRED');checks++;h.finish();
 }
 {const h=harness();h.begin('确认执行',()=>{},['recolor_product:{"color":"#2E6FE0"}']);assert(h.check('recolor_product',{color:'#2E6FE0',confirm:true}));checks++;assert.throws(()=>h.check('recolor_product',{color:'#FF0000',confirm:true}),(e:any)=>e.code==='INTENT_REQUIRED');checks++;assert.throws(()=>h.check('generate_video',{}),(e:any)=>e.code==='INTENT_REQUIRED');checks++;h.finish();}
 const secret='provider-fixture-secret-123456789',policy='这一整行是用于测试的内部执行规则，任何块边界都应保护完整规则而不是逐段泄漏。';
 const h=harness();h.registerSecret(secret);h.protectPrompt(policy);
 const samples=[secret,policy,'sk-proj-abcdefghijklmnopqrstuv12345','Bearer fixtureToken123456789012345','-----BEGIN RSA PRIVATE KEY-----\nprivate-material\n-----END RSA PRIVATE KEY-----','![pixel](https://external.invalid/private.png)','![safe](/media/owned.png)'];
 for(const sample of samples)for(let cut=1;cut<sample.length;cut++){
   let out='';const b=new PublicOutputBuffer(h,x=>{out+=x;assert(!out.includes(secret));assert(!out.includes(policy));assert(!out.includes('private-material'));assert(!out.includes('https://external'));});
   b.push('正文：'+sample.slice(0,cut));b.push(sample.slice(cut)+'。结束');b.finish();
   if(sample===policy){assert(!out.includes(policy));checks++;}else eq(out,h.publicText('正文：'+sample+'。结束'));
 }
 for(const sample of samples){for(const size of [1,2,3,7,29]){let out='';const b=new PublicOutputBuffer(h,x=>out+=x);for(let i=0;i<sample.length;i+=size)b.push(sample.slice(i,i+size));b.push('。');b.finish();if(sample===policy){assert(!out.includes(policy));checks++;}else eq(out,h.publicText(sample+'。'));}}
 for(const text of ['短回复逐字输出，不等换行。','长回复没有换行'.repeat(300),'中文与emoji 🐱🌈👩‍💻 都应完整保留。']){
   let out='';const chunks:string[]=[];const b=new PublicOutputBuffer(h,x=>{chunks.push(x);assert(!/[\uD800-\uDBFF]$/.test(x));out+=x});for(let i=0;i<text.length;i++)b.push(text[i]);assert(out.length>=text.length-1);checks++;b.finish();eq(out,text);assert(chunks.length>1);checks++;
 }
 {let out='';const b=new PublicOutputBuffer(h,x=>out+=x);b.push('正文正常。'+secret.slice(0,9));assert.equal(out,'正文正常。');b.push(secret.slice(9)+'继续。');b.finish();assert(!out.includes(secret));checks++;}
 const events=[{type:'tool_start',id:'recolor1',tool:'recolor_product'},{type:'attention',id:'recolor1',tool:'recolor_product',kind:'restricted',code:'INTENT_REQUIRED',message:'raw generic gate'},{type:'tool_end',id:'recolor1',tool:'recolor_product',isError:true,summary:'工具执行失败，请查看安全错误提示'}];
 let steps:any[]=[];for(const event of events)steps=reduceAgentProgress(steps,event);
 eq(steps.length,1);eq(steps[0].attention,'restricted');eq(steps[0].summary,agentRestrictionMessage('INTENT_REQUIRED'));
 let restored:any[]=[];for(const event of events)restored=reduceAgentProgress(restored,event,false,false);eq(restored,steps);
 const waiting=[{type:'tool_start',id:'quote1',tool:'recolor_product'},{type:'attention',id:'quote1',tool:'recolor_product',kind:'waiting',message:'本次产品换色预计8积分，请确认报价后继续。'},{type:'tool_end',id:'quote1',tool:'recolor_product',isError:true}];
 let quoted:any[]=[];for(const event of waiting)quoted=reduceAgentProgress(quoted,event);eq(quoted[0].attention,'waiting');assert(quoted[0].summary.includes('8积分'));checks++;
 quoted=reduceAgentProgress(quoted,{type:'attention',id:'quote1',tool:'recolor_product',kind:'resolved'});eq(quoted[0].attention,undefined);
 quoted=reduceAgentProgress(quoted,{type:'tool_end',id:'quote1',tool:'recolor_product',isError:false,summary:'已完成换色'});eq(quoted[0].summary,'已完成换色');eq(quoted[0].status,'done');
 const denied=reduceAgentProgress([],{type:'attention',tool:'recolor_product',kind:'restricted',code:'FEATURE_ACCESS_DENIED'});assert(denied[0].summary?.includes('功能'));checks++;
 eq(agentActivityLabel(true,'running',[]),'等待模型响应');eq(agentActivityLabel(true,'running',[],false,true),'正在回复');
 console.log(`STREAM_INTENT_REGRESSION=PASS checks=${checks} cross_chunk_redaction=PASS live_history_parity=PASS exact_quote_scope=PASS provider_calls=0`);
}
extended().catch(error=>{console.error(error);process.exitCode=1});
