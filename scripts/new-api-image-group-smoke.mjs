// Isolated acceptance for New API image-group model discovery and generation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import pg from 'pg';
import { chromium, request, expect } from '@playwright/test';

const output=path.resolve('output/new-api-image-group-smoke');
await mkdir(output,{recursive:true});
const container=`naumi-new-api-image-${Date.now()}`;
const password=randomUUID();
const email='new-api-image-group@local.test';
const source=await sharp({create:{width:420,height:420,channels:4,background:'#d7a76d'}}).png().toBuffer();
const generated=await sharp({create:{width:1024,height:1024,channels:4,background:'#70a7d8'}}).png().toBuffer();
const flowRequests=[];
const report=[];
const appLog=[];
const pass=message=>{report.push(`PASS ${message}`);console.log(report.at(-1));};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let app,fixture,pool,api,browser,page;
async function freePort(){const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
try{
 execFileSync('docker',['run','-d','--name',container,'-e','POSTGRES_USER=fixture','-e',`POSTGRES_PASSWORD=${password}`,'-e','POSTGRES_DB=fixture','-p','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data','postgres:16-alpine'],{stdio:'pipe'});
 const mapping=execFileSync('docker',['port',container,'5432'],{encoding:'utf8'}).trim();
 const database=`postgres://fixture:${password}@127.0.0.1:${mapping.split(':').pop()}/fixture?sslmode=disable`;
 pool=new pg.Pool({connectionString:database});for(let i=0;i<60;i++){try{await pool.query('select 1');break}catch{await sleep(300)}}
 fixture=createServer(async(req,res)=>{
   const base=`http://127.0.0.1:${fixture.address().port}`;
   if(req.url==='/v1/models'){
     res.setHeader('content-type','application/json');
     res.end(JSON.stringify({data:[{id:'gemini-3.1-flash-image-square'},{id:'gemini-3.1-flash-image-landscape'},{id:'imagen-4.0-generate-preview-landscape'},{id:'text-only-model'}]}));return;
   }
   if(req.url==='/generated.png'){
     res.setHeader('content-type','image/png');res.end(generated);return;
   }
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks).toString('utf8');
   if(req.url==='/v1/chat/completions'){
     const body=JSON.parse(raw);
     if(body.model==='gpt-5.6-luna'){
       res.setHeader('content-type','application/json');
       res.end(JSON.stringify({choices:[{message:{content:JSON.stringify([{role:'hero',label:'首屏主视觉',prompt:'在完整保留上传商品不变的前提下，生成高级白底首屏主视觉。'}])}}]}));return;
     }
     flowRequests.push(body);
     res.writeHead(200,{'content-type':'text/event-stream'});
     res.write(`data: ${JSON.stringify({choices:[{delta:{reasoning_content:'正在生成\n'},finish_reason:null}]})}\n\n`);
     res.write(`data: ${JSON.stringify({choices:[{delta:{content:`![Generated Image](${base}/generated.png)`},finish_reason:'stop'}]})}\n\n`);
     res.end('data: [DONE]\n\n');return;
   }
   if(req.url==='/v1/images/generations'||req.url==='/v1/images/edits'){
     res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{b64_json:generated.toString('base64')}]}));return;
   }
   res.statusCode=404;res.end('{}');
 });
 await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
 const provider=`http://127.0.0.1:${fixture.address().port}/v1`;
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port)],{env:{...process.env,DATABASE_URL:database,SETTINGS_SECRET:randomUUID(),ADMIN_EMAIL:email,NAUMI_EDITION:'cloud',NAUMI_MULTI_USER:'1',NAUMI_PUBLIC_COMMERCE:'0',MEDIA_DIR:path.join(output,'media'),STORAGE_DRIVER:'local',NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',SMTP_HOST:'',OPENAI_API_KEY:'fixture',OPENAI_BASE_URL:provider,OPENAI_IMAGE_MODEL:'gpt-image-2',OPENAI_IMAGE_MODELS:'',NEW_API_IMAGE_BASE_URL:provider,NEW_API_IMAGE_API_KEY:'fixture-image-group',NEW_API_IMAGE_MODELS:'',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
 app.stdout.on('data',chunk=>appLog.push(chunk.toString()));app.stderr.on('data',chunk=>appLog.push(chunk.toString()));
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(`${base}/api/health`)).ok){ready=true;break}}catch{}await sleep(500)}assert(ready);
 api=await request.newContext({baseURL:base,timeout:120000});
 let response=await api.post('/api/auth/register',{data:{email,password,name:'New API 生图分组验收'}});assert.equal(response.status(),200,await response.text());
 const config=await(await api.get('/api/config')).json();
 assert.deepEqual(config.imageModels.map(item=>item.id),['gpt-image-2','gemini-3.1-flash-image-square','gemini-3.1-flash-image-landscape','imagen-4.0-generate-preview-landscape']);
 assert.equal(config.imageModels[1].label,'Nano Banana 2 · 方图');assert.equal(config.imageModels[1].supportsEdit,true);assert.equal(config.imageModels[1].provider,'new-api-flow');
 pass('runtime config discovers and labels the New API image-group catalog');

 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-gpu']});
 const context=await browser.newContext({storageState:await api.storageState(),viewport:{width:1440,height:1000}});page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${base}/generate`);const row=page.getByText('生图模型',{exact:true}).locator('..');await row.getByRole('button',{name:/gpt-image-2/}).click();await page.getByRole('button',{name:'Nano Banana 2 · 方图',exact:true}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('naumi:generate-image-model')),'gemini-3.1-flash-image-square');pass('generation UI switches to a discovered image-group model with the Nano Banana name');

 response=await api.post('/api/generate-image',{multipart:{prompt:'保持产品结构，生成白底商品图',userPrompt:'白底商品图',category:'main',ratio:'1:1',resolution:'1K',quality:'medium',count:'1',model:'gemini-3.1-flash-image-square',image:{name:'source.png',mimeType:'image/png',buffer:source},email}});assert.equal(response.status(),200,await response.text());const accepted=await response.json();
 let job;for(let i=0;i<60;i++){job=await(await api.get(`/api/generate-image?job=${accepted.jobId}`)).json();if(job.status==='done'||job.status==='error')break;await sleep(500)}assert.equal(job?.status,'done',JSON.stringify(job));assert.equal(job.images.length,1);assert.equal(flowRequests.length,1);assert.equal(flowRequests[0].model,'gemini-3.1-flash-image-square');const content=flowRequests[0].messages[0].content;assert(Array.isArray(content)&&content.some(item=>item.type==='image_url'&&item.image_url.url.startsWith('data:image/png;base64,')));
 const imageResponse=await api.get(job.images[0].url);assert.equal(imageResponse.status(),200);assert((await imageResponse.body()).length>1000);pass('selected New API model receives the reference image and persists its generated result');

 response=await api.post('/api/generate-image',{multipart:{prompt:'横版商品图',userPrompt:'横版商品图',category:'main',ratio:'16:9',resolution:'2K',quality:'medium',count:'1',model:'gemini-3.1-flash-image-square',image:{name:'source.png',mimeType:'image/png',buffer:source},email}});assert.equal(response.status(),200,await response.text());const routedAccepted=await response.json();
 let routedJob;for(let i=0;i<60;i++){routedJob=await(await api.get(`/api/generate-image?job=${routedAccepted.jobId}`)).json();if(routedJob.status==='done'||routedJob.status==='error')break;await sleep(500)}assert.equal(routedJob?.status,'done',JSON.stringify(routedJob));assert.equal(flowRequests.at(-1)?.model,'gemini-3.1-flash-image-landscape');pass('node ratio selection routes Nano Banana 2 to the landscape upstream variant while resolution remains 2K');

 const account=await(await api.get(`/api/account?email=${encodeURIComponent(email)}`)).json();const parent=account.artworks.find(item=>item.id===job.images[0].id);assert(parent);
 response=await api.post('/api/aplus',{multipart:{prepared:'1',text:'突出产品主体',platform:'taobao',lang:'zh',format:'1:1',module:'hero',model:'gemini-3.1-flash-image-square',parentId:parent.id,parentIds:JSON.stringify([parent.id]),image:{name:'source.png',mimeType:'image/png',buffer:source},email}});assert.equal(response.status(),200,await response.text());const aplusAccepted=await response.json();
 let aplusJob;for(let i=0;i<80;i++){aplusJob=await(await api.get(`/api/aplus?job=${aplusAccepted.jobId}`)).json();if(aplusJob.status==='done'||aplusJob.status==='error')break;await sleep(500)}assert.equal(aplusJob?.status,'done',JSON.stringify(aplusJob));assert.equal(aplusJob.shots.filter(item=>item.status==='done').length,1);assert.equal(flowRequests.filter(item=>item.model==='gemini-3.1-flash-image-square').length,2);pass('A+ detail generation reuses the selected New API image-group model');

 const rejected=await api.post('/api/generate-image',{multipart:{prompt:'test',category:'main',ratio:'1:1',resolution:'1K',count:'1',model:'gemini-unknown-image-square'}});assert.equal(rejected.status(),400);pass('server rejects models outside both configured catalogs');
 assert.deepEqual(errors,[]);console.log(`MODIFIED_RESULT=PASS NEW_API_MODELS=3 FLOW_REQUESTS=${flowRequests.length} checks=${report.length}`);
}catch(error){report.push(`FAIL ${error.stack||error}`);if(page)await page.screenshot({path:path.join(output,'FAILURE.png'),fullPage:true}).catch(()=>{});throw error}finally{await writeFile(path.join(output,'test.log'),report.join('\n')+'\n');await writeFile(path.join(output,'next.log'),appLog.join(''));await browser?.close();await api?.dispose();await pool?.end();if(app?.pid){if(process.platform==='win32'){try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'})}catch{}}else app.kill('SIGTERM')}if(fixture)await new Promise(resolve=>fixture.close(resolve));try{execFileSync('docker',['rm','-f',container],{stdio:'pipe'})}catch{}}
