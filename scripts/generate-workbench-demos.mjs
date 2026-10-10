import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
// Native Naumi jobs, not a direct provider SDK. Credentials stay in process memory.
const base=process.env.NAUMI_DEMO_BASE||'http://120.27.162.85';
const out=path.resolve(process.env.WORKBENCH_DEMO_EVIDENCE||'output/workbench-demo-refresh');
const plan=JSON.parse(await fs.readFile('scripts/fixtures/workbench-demo-prompts.json','utf8'));
const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
await fs.mkdir(out,{recursive:true});await fs.mkdir(path.join(out,'generated'),{recursive:true});
const stateFile=path.join(out,'generation-state.json');
let state=JSON.parse(await fs.readFile(stateFile,'utf8').catch(()=>'{}'));
const save=()=>fs.writeFile(stateFile,JSON.stringify(state,null,2));
// Serialize evidence writes while multiple independent jobs run.
let saving=Promise.resolve();const persist=()=>saving=saving.then(save);
async function request(endpoint,init={}){return fetch(new URL(endpoint,base),{...init,signal:AbortSignal.timeout(120000),headers:{Cookie:cookie,Origin:base,...init.headers}});}
if(!process.env.NAUMI_DEMO_EMAIL||!process.env.NAUMI_DEMO_PASSWORD)throw Error('Set native account credentials in environment');
const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({email:process.env.NAUMI_DEMO_EMAIL,password:process.env.NAUMI_DEMO_PASSWORD})});
if(!login.ok)throw Error('Login HTTP '+login.status);
const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
const catalog=await (await request('/api/models?feature=image.generate')).json();
const modelId=process.env.NAUMI_DEMO_MODEL||'gpt-image-2';
if(!catalog.models?.some(m=>m.id===modelId))throw Error('Configured model not in actual catalog');
const tasks=[...plan.pairs.map(p=>({...p,key:p.sourceKey||p.key,prompt:plan.shared+'\n'+p.prompt,ratio:'16:9'})),{...plan.gallery,ratio:'16:9'},...plan.suiteSets.map(p=>({...p,key:'suite-'+p.key,ratio:'3:2'}))].filter(p=>!only||only.includes(p.key));
async function generate(task){
 const signature=createHash('sha256').update(task.prompt).digest('hex');
 let record=state[task.key];
 if(record&&record.promptHash!==signature)throw Error('Prompt changed for existing operation '+task.key+'; use a distinct revision key');
 if(record?.complete){console.log('REUSED '+task.key);return;}
 record ||= state[task.key]={operationId:'demo-v2-'+task.key+'-'+randomUUID(),promptHash:signature,prompt:task.prompt,ratio:task.ratio,modelId,quality:'high',resolution:'2K',createdAt:new Date().toISOString()};
 await persist();
 if(!record.jobId){
  const quoteResponse=await request('/api/billing/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({feature:'image.generate',modelId,quality:record.quality,resolution:record.resolution,ratio:task.ratio,quantity:1})});
  const quote=await quoteResponse.json();if(!quoteResponse.ok)throw Error('Quote '+task.key+' '+JSON.stringify(quote));
  record.quote=quote;await persist();
  const form=new FormData();for(const[k,v]of Object.entries({prompt:task.prompt,userPrompt:task.prompt,category:'generate',ratio:task.ratio,resolution:record.resolution,quality:record.quality,style:'',count:'1',model:modelId,email:process.env.NAUMI_DEMO_EMAIL,entry:'generate'}))form.append(k,v);
  const response=await request('/api/generate-image',{method:'POST',headers:{'x-naumi-billing-operation-id':record.operationId,'x-naumi-billing-version':String(quote.version),'x-naumi-billing-credits':String(quote.authorization?quote.authorizedCredits:quote.credits)},body:form});
  const started=await response.json();if(!response.ok||!started.jobId){record.error=started;await persist();throw Error('Submit '+task.key+' '+JSON.stringify(started));}
  record.jobId=started.jobId;await persist();console.log('STARTED '+task.key+' '+record.jobId);
 }
 const deadline=Date.now()+25*60*1000;let data;
 while(Date.now()<deadline){
  const response=await request('/api/generate-image?job='+encodeURIComponent(record.jobId));data=await response.json();if(!response.ok)throw Error('Poll HTTP '+response.status+' '+task.key);
  if(data.status==='error'){record.error=data.error;await persist();throw Error('Generation '+task.key+' '+data.error);}
  if(data.status==='done')break;
  await new Promise(r=>setTimeout(r,5000));
 }
 if(data?.status!=='done'||data.mock||!data.persisted||data.images?.length!==1)throw Error('Expected one real persisted image '+task.key);
 const result=data.images[0],url=new URL(result.url,base);if(url.origin!==new URL(base).origin)throw Error('Expected native stored image');
 const imageResponse=await request(url.href);if(!imageResponse.ok)throw Error('Media HTTP '+imageResponse.status);
 const bytes=Buffer.from(await imageResponse.arrayBuffer()),metadata=await sharp(bytes).metadata();if(!metadata.width||!metadata.height||metadata.width<1000)throw Error('Insufficient source pixels '+task.key);
 const file=path.join(out,'generated',task.key+'.png');await sharp(bytes).rotate().png().toFile(file);
 await sharp(bytes).resize({width:1100,withoutEnlargement:true}).jpeg({quality:85}).toFile(path.join(out,'generated',task.key+'-preview.jpg'));
 Object.assign(record,{complete:true,result:{id:result.id,url:result.url,width:metadata.width,height:metadata.height},qualityAudit:data.quality,creditsUsed:data.creditsUsed,completedAt:new Date().toISOString(),sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')});delete record.error;await persist();
 console.log('GENERATED '+task.key+' PIXELS='+metadata.width+'x'+metadata.height+' CREDITS='+data.creditsUsed);
}
let cursor=0;const errors=[];
await Promise.all(Array.from({length:Math.min(4,tasks.length)},async()=>{while(cursor<tasks.length){const task=tasks[cursor++];try{await generate(task);}catch(e){errors.push({key:task.key,error:String(e)});console.error('FAILED '+task.key+' '+e.message);}}}));
await persist();await fs.writeFile(path.join(out,'generation-errors.json'),JSON.stringify(errors,null,2));
console.log('NATIVE_GENERATION='+(!errors.length?'PASS':'PARTIAL')+' REQUESTED='+tasks.length+' COMPLETED='+tasks.filter(t=>state[t.key]?.complete).length+' ERRORS='+errors.length);
if(errors.length)process.exitCode=1;
