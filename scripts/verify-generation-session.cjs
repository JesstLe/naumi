/* Actual GenerateClient + its production session/hook, React19, Chromium,
 * real timers and loopback HTTP. Auth/billing backend and unrelated UI are
 * explicit fixtures; this is not a real customer-wallet/provider acceptance. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{createServer}=require('node:http'),{createRequire}=require('node:module');
const root=process.cwd(),args=process.argv.slice(2);let sourceRoot=root,out=process.env.GENERATION_SESSION_EVIDENCE||'output/generation-session-regression';
for(let i=0;i<args.length;i++){if(args[i]==='--source-root')sourceRoot=path.resolve(args[++i]);else if(args[i]==='--out')out=args[++i];else throw Error('Unknown argument: '+args[i]);}
out=path.resolve(out);fs.mkdirSync(out,{recursive:true});
const req=createRequire(path.resolve(process.env.REVIEW_DEPS||'node_modules','package.json'));
const {build}=req('esbuild'),{chromium}=req('playwright');
const ts=req('typescript');
const source=path.join(sourceRoot,'src/components/generate/generate-client.tsx'),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const bound=['src/components/generate/generate-client.tsx','src/components/generate/use-generation-session.ts','src/lib/imagegen/generation-session.ts','src/components/use-image-job-resume.ts'].filter(n=>fs.existsSync(path.join(sourceRoot,n)));
const report={tier:'Actual React19 GenerateClient + Chromium/loopback/real timers; authentication, billing service and supplier are fixtures',sourceRoot,sourceHashes:Object.fromEntries(bound.map(n=>[n,sha(path.join(sourceRoot,n))])),checks:[],failures:[],observations:[],requests:[]};
let server,browserServer,browser,context,page,origin,currentCase='',requests=[],plan={},holds=new Map(),postCount=0,readCount=0,activeCount=0;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZl8AAAAASUVORK5CYII=';
const image=id=>({id,url:png,gradient:'',prompt:'fixture',ratio:'1:1',createdAt:'2026-11-01T00:00:00.000Z'});
function json(s,status,data){if(!s.destroyed){s.writeHead(status,{'content-type':'application/json'});s.end(JSON.stringify(data));}}
async function held(key){await new Promise(resolve=>holds.set(key,resolve));}
function release(key){holds.get(key)?.();holds.delete(key);}
async function waitFor(fn,label){const deadline=Date.now()+5000;while(!fn()){if(Date.now()>deadline)throw Error('Fixture not reached: '+label);await pause(10);}}
async function state(){return page.evaluate(()=>window.g.state());}
async function reset(options={}){
  for(const key of [...holds.keys()])release(key);
  if(context){report.requests.push({case:currentCase,requests});await context.close();}
  requests=[];plan=options.plan||{};postCount=readCount=activeCount=0;holds=new Map();
  context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',error=>{errors.push(error.stack);console.log('BROWSER_ERROR '+error.stack);});
  await page.goto(origin);if(errors.length)throw Error('FIXTURE_BOOTSTRAP: '+errors.join('\n'));
  await page.waitForFunction(()=>typeof window.mount==='function');await page.evaluate(options=>window.mount(options),options);
  await page.waitForFunction(()=>window.g);await waitFor(()=>!options.actor||activeCount>0,'active discovery');
}
async function configure(values){await page.evaluate(values=>{for(const [key,value]of Object.entries(values))window.g[key](value);},values);}
async function start(times=1){await page.evaluate(times=>{for(let i=0;i<times;i++)void window.g.generate();},times);}
async function terminal(){await page.waitForFunction(()=>!window.g.state().loading&&(window.g.state().images.length||window.g.state().error));return state();}
async function check(name,run){currentCase=name;try{await run();report.checks.push(name);console.log('PASS '+name);}catch(error){if(error.message.startsWith('FIXTURE_BOOTSTRAP:'))throw error;report.failures.push({name,error:error.message,state:page?await state().catch(()=>null):null,requests:[...requests]});console.log('FAIL '+name+': '+error.message);}}
const stubs=`import React from 'react';
const people=new Map(),identity=()=>{if(!window.actor)return null;if(!people.has(window.actor))people.set(window.actor,{email:window.actor,name:window.actor,creditsTotal:100,creditsUsed:0});return people.get(window.actor)};
export const useAuth=()=>{const[,render]=React.useState(0);React.useEffect(()=>{window.authRender=()=>render(x=>x+1);return()=>{window.authRender=null}},[]);return {user:identity(),ready:window.authReady,remaining:window.balance,consumeCredits:n=>{window.metrics.consumes.push({actor:window.actor,n});return true},applyServerUser:u=>window.metrics.users.push({actor:window.actor,email:u.email,credits:u.creditsTotal})}};
export const authHeader=async()=>({'x-fixture-actor':window.actor||'guest'});
export const useAuthModal=()=>({openAuth:()=>window.metrics.signIns++});export const useI18n=()=>({t:k=>k,te:(_k,s)=>s,locale:'zh'});export const usePaymentConfig=()=>({commerceVisible:true});
const config={imageModels:[{id:'fixture-image',label:'Fixture',supportsEdit:true}],defaultImageModel:'fixture-image'},qualities=['low','medium','high','xhigh','max'];
export const useImageQuality=()=>{const[quality,setQuality]=React.useState('medium');return{quality,setQuality,qualityLabels:{},capable:true,experimental:false,imageCost:()=>6,modelConfig:config,allowedQualities:qualities}};
export const useImageResolutions=()=>['1K','2K','4K'];
export const useFeatureBilling=(_feature,input)=>({cost:6*(input.quantity||1),submit:async(url,init,beforeSend)=>{window.inSubmit=true;if(window.billingGate)await window.billingGate;beforeSend?.();const headers=new Headers(init.headers);headers.set('x-fixture-quote','original-6');headers.set('x-naumi-billing-operation-id','fixture-intent');return fetch(url,{...init,headers})}});
export const useSearchParams=()=>React.useMemo(()=>new URLSearchParams(window.location.search),[]);export const useWorkspaceRouter=()=>({push:()=>{}});
export const readBrowserImage=async()=>new Blob(['fixture'],{type:'image/png'}),browserImageArchive=async()=>new Blob([]),isHostedImageUrl=()=>true,toolSourceUrl=x=>x,toolImageError=()=>null,cdnUrl=x=>x,takePendingRefs=()=>[],useClipboardImagePaste=()=>()=>{},downloadImage=()=>{},cn=(...v)=>v.filter(x=>typeof x==='string').join(' ');
export const Button=({children,...p})=><button {...p}>{children}</button>,Textarea=p=><textarea {...p}/>;
export const CachedImage=()=>null,RatioTileGroup=()=>null,Segmented=()=>null,PromptAssistPopup=()=>null,SelectMenu=()=>null,Media=()=>null,GenLoader=()=>null,ImageLightbox=()=>null,RecordPager=()=>null,ToolDemo=()=>null,ModelIcon=()=>null;
export const RECORDS_PER_PAGE=10,getDemo=()=>({});
export const Loader2=()=>null,Sparkles=()=>null,Download=()=>null,RefreshCw=()=>null,Upload=()=>null,X=()=>null,Wand2=()=>null,ChevronRight=()=>null,ChevronLeft=()=>null,Clock=()=>null,Trash2=()=>null,Check=()=>null;
export default function Link({children,...p}){return <a {...p}>{children}</a>}`;
async function main(){
  const instrument=`window.g={generate,setPrompt,setCount,setModel,setRatio,setResolution,setStyle,setParentId,setTpl,setImages,setSourceLoading,setFiles,state:()=>({loading,error,images,shownRec,model,prompt})};\n`;
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GenerateClient} from ${JSON.stringify(source.replaceAll('\\','/'))};
const root=createRoot(document.getElementById('root'));window.metrics={users:[],consumes:[],signIns:0,errors:[]};window.actor='a@example.test';window.balance=100;window.authReady=true;
window.mount=options=>{window.actor=options.actor===undefined?'a@example.test':options.actor;window.authReady=options.ready??true;window.balance=options.balance??100;if(options.saved)sessionStorage.setItem('naumi:job:generate-image:'+window.actor,options.saved);flushSync(()=>root.render(options.strict?<React.StrictMode><GenerateClient/></React.StrictMode>:<GenerateClient/>));};
window.account=actor=>{window.actor=actor;flushSync(()=>window.authRender?.())};window.detach=()=>flushSync(()=>root.render(null));
window.holdBilling=()=>{window.billingGate=new Promise(resolve=>window.releaseBilling=()=>{window.billingGate=null;resolve()})};window.flushImages=()=>{const queue=window.imageQueue||[];window.imageQueue=[];for(const update of queue)update()};
  window.addEventListener('unhandledrejection',e=>{window.metrics.errors.push(String(e.reason));e.preventDefault()});`,resolveDir:root,loader:'tsx'},bundle:true,write:false,platform:'browser',jsx:'automatic',nodePaths:[path.resolve('node_modules')],define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'generation-fixture',setup(b){
    b.onLoad({filter:/generate-client\.tsx$/},args=>{
      let text=fs.readFileSync(args.path,'utf8');
      const file=ts.createSourceFile(args.path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
      const component=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='GenerateClient');
      const returns=component?.body?.statements.filter(ts.isReturnStatement)||[];
      assert.equal(returns.length,1,'GenerateClient must expose the real render scope');
      const start=returns[0].getStart(file);text=text.slice(0,start)+instrument+text.slice(start);
      const imageState='const [images, setImages] = useState<GeneratedImage[]>([]);';
      assert.ok(text.includes(imageState),'actual image-state queue instrumentation anchor');
      text=text.replace(imageState,'const [images, nativeSetImages] = useState<GeneratedImage[]>([]); const setImages:typeof nativeSetImages=change=>{if(window.deferImages&&typeof change==="function")(window.imageQueue ||= []).push(()=>nativeSetImages(change));else nativeSetImages(change)};');
      return {contents:text,loader:'tsx',resolveDir:path.dirname(args.path)};
    });
    b.onResolve({filter:/^(@\/|next\/|lucide-react$)/},args=>{
      if(['@/lib/imagegen/generation-session','@/lib/mock-data','@/lib/images','@/lib/image-quality','@/lib/image-model-routing','@/components/use-image-job-resume'].includes(args.path))return{path:path.join(sourceRoot,'src',args.path.slice(2)+'.ts')};
      return {path:args.path,namespace:'fixture'};
    });b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:stubs,loader:'tsx',resolveDir:root}));
  }}]});
  server=createServer(async(r,s)=>{try{
    if(r.url==='/'){s.setHeader('content-type','text/html; charset=utf-8');s.end('<meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>');return;}
    if(r.url==='/bundle.js'){s.setHeader('content-type','text/javascript');s.end(bundle.outputFiles[0].contents);return;}
    const url=new URL(r.url,origin),actor=String(r.headers['x-fixture-actor']||'guest');
    if(url.pathname==='/api/account'){json(s,200,{artworks:[]});return;}
    if(url.pathname!=='/api/generate-image'){json(s,404,{});return;}
    const entry={method:r.method,actor,job:url.searchParams.get('job'),active:url.searchParams.has('active')};requests.push(entry);
    if(r.method==='POST'){
      postCount++;const chunks=[];for await(const chunk of r)chunks.push(chunk);
      const form=await new Request(origin+r.url,{method:'POST',headers:r.headers,body:Buffer.concat(chunks)}).formData();
      entry.fields=Object.fromEntries([...form].filter(([,v])=>typeof v==='string'));entry.files=[];
      for(const value of form.getAll('image'))entry.files.push({name:value.name,size:value.size,sha256:createHash('sha256').update(Buffer.from(await value.arrayBuffer())).digest('hex')});
      entry.quote=r.headers['x-fixture-quote'];entry.operation=r.headers['x-naumi-billing-operation-id'];
      if(plan.holdAck)await held('ack');
      json(s,plan.reject?400:200,plan.reject?{error:'fixture refused'}:plan.noJob?{}:{jobId:'job-1'});return;
    }
    if(url.searchParams.has('active')){activeCount++;if(plan.holdActive)await held('active');json(s,200,{jobs:plan.active||[]});return;}
    readCount++;if(plan.holdReceipt)await held('receipt');
    if(plan.dropFirst&&readCount===1){r.socket.destroy();return;}
    if(plan.transient&&readCount===1){json(s,503,{error:'temporarily unavailable'});return;}
    if(plan.pendingFirst&&readCount===1){json(s,200,{status:'pending'});return;}
    if(plan.forbidden){json(s,403,{error:'fixture forbidden'});return;}
    if(plan.jobError){json(s,200,{status:'error',error:'supplier rejected fixture'});return;}
    const images=plan.images||[image('art-'+url.searchParams.get('job'))];
    json(s,200,{status:'done',images,...(!plan.noUser?{user:{email:actor,creditsTotal:94,creditsUsed:0}}:{})});
  }catch(error){json(s,500,{error:error.message});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browserServer=await chromium.launchServer({headless:true});browser=await chromium.connect(browserServer.wsEndpoint());
  report.resources={nodePid:process.pid,browserPid:browserServer.process().pid,port:server.address().port};

  await check('ready/sign-in and prompt/real displayed-balance validation retain zero POST',async()=>{
    await reset({actor:null,ready:false});await start();assert.equal(await page.evaluate(()=>window.metrics.signIns),0);
    await page.evaluate(()=>{window.authReady=true;window.authRender()});await start();assert.equal(await page.evaluate(()=>window.metrics.signIns),1);assert.equal(postCount,0);
    await reset({balance:5});await start();assert.equal((await state()).error,'gen.errPrompt');await configure({setPrompt:'fixture'});await start();assert.equal((await state()).error,'gen.errInsufficient');assert.equal(postCount,0);
  });
  await check('exact original multipart, quote and input files reach one explicit submit',async()=>{
    await reset();await configure({setPrompt:'original 用户提示',setCount:2,setResolution:'4K',setRatio:'3:4',setStyle:'fixture-style',setParentId:'parent-original',setTpl:{id:'ignored-template',image:png,prompt:'template'}});
    await page.evaluate(()=>window.g.setFiles([new File(['reference'],'reference.png',{type:'image/png'})]));await start();await terminal();
    const post=requests.find(x=>x.method==='POST');assert.deepEqual(post.fields,{prompt:'original 用户提示',userPrompt:'original 用户提示',category:'main',ratio:'3:4',resolution:'4K',quality:'medium',style:'fixture-style',count:'2',email:'a@example.test',model:'fixture-image',parentId:'parent-original'});assert.equal(post.files[0].size,9);assert.equal(post.quote,'original-6');assert.equal(postCount,1);report.observations.push({name:'normal-wire',fields:post.fields,files:post.files,quote:post.quote,operation:post.operation});
  });
  await check('template lineage retained only without explicit parent',async()=>{
    await reset();await configure({setPrompt:'template',setTpl:{id:'tpl-original',image:png,prompt:'template prompt'}});await start();await terminal();const post=requests.find(x=>x.method==='POST');assert.equal(post.fields.templateId,'tpl-original');assert.equal(post.fields.templatePrompt,'template prompt');assert.equal('parentId'in post.fields,false);
  });
  await check('identity comparison normalization never changes the original submission actor',async()=>{
    await reset({actor:'A@Example.test'});await configure({setPrompt:'original actor'});await start();await terminal();
    assert.equal(requests.find(x=>x.method==='POST').fields.email,'A@Example.test');assert.equal(postCount,1);
  });
  await check('result merge retains old image and deduplicates the original artwork IDs',async()=>{
    await reset({plan:{images:[image('old'),image('new')]}});await configure({setImages:[image('old')],setPrompt:'merge'});await start();assert.deepEqual((await terminal()).images.map(x=>x.id),['old','new']);assert.equal(await page.evaluate(()=>sessionStorage.getItem('naumi:job:generate-image:a@example.test')),null);
  });
  await check('server wallet wins; local fallback charged once only without server user',async()=>{
    await reset({plan:{noUser:true}});await configure({setPrompt:'local'});await start();await terminal();assert.deepEqual(await page.evaluate(()=>window.metrics.consumes),[{actor:'a@example.test',n:6}]);
    await reset();await configure({setPrompt:'server'});await start();await terminal();assert.equal(await page.evaluate(()=>window.metrics.consumes.length),0);assert.ok((await page.evaluate(()=>window.metrics.users)).every(x=>x.credits===94));
  });
  await check('known submit refusal and missing job never become polling or automatic retry',async()=>{
    for(const option of [{reject:true},{noJob:true}]){await reset({plan:option});await configure({setPrompt:'refusal'});await start();await terminal();assert.equal(postCount,1);assert.equal(readCount,0);assert.equal((await state()).loading,false);}
  });
  await check('terminal job failure and forbidden lookup clear only the cached original receipt',async()=>{
    for(const option of [{jobError:true},{forbidden:true}]){await reset({plan:option});await configure({setPrompt:'failed'});await start();await terminal();assert.equal(await page.evaluate(()=>sessionStorage.getItem('naumi:job:generate-image:a@example.test')),null);assert.equal(postCount,1);assert.equal((await state()).images.length,0);}
  });
  await check('reload/StrictMode restores the original job with GET only and no local debit',async()=>{
    await reset({strict:true,saved:'saved-original',plan:{active:[{id:'saved-original'}]}});const result=await terminal();assert.equal(result.images[0].id,'art-saved-original');assert.equal(postCount,0);assert.equal(await page.evaluate(()=>window.metrics.consumes.length),0);
  });
  await check('double click while React state is pending admits one submit',async()=>{
    await reset({plan:{holdAck:true}});await configure({setPrompt:'double'});await start(2);await waitFor(()=>postCount>0,'submit');await pause(100);assert.equal(postCount,1);release('ack');await terminal();
  });
  await check('account switch rejects a late original job result and wallet projection',async()=>{
    await reset({plan:{holdReceipt:true}});await configure({setPrompt:'switch'});await start();await waitFor(()=>readCount===1,'receipt');await page.evaluate(()=>window.account('b@example.test'));release('receipt');await pause(200);assert.equal((await state()).images.length,0);assert.equal(await page.evaluate(()=>window.metrics.users.length),0);assert.equal((await state()).loading,false);
  });
  await check('deferred result updater cannot append old account images after switch',async()=>{
    await reset();await configure({setPrompt:'deferred'});await page.evaluate(()=>{window.deferImages=true});await start();await page.waitForFunction(()=>window.imageQueue?.length);await page.evaluate(()=>{window.account('b@example.test');window.deferImages=false;window.flushImages()});await pause(100);assert.equal((await state()).images.length,0);
  });
  await check('account switch during billing preparation stops the not-yet-sent paid request',async()=>{
    await reset();await configure({setPrompt:'late authorization'});await page.evaluate(()=>window.holdBilling());await start();await page.waitForFunction(()=>window.inSubmit);await page.evaluate(()=>{window.account('b@example.test');window.releaseBilling()});await pause(200);assert.equal(postCount,0);
  });
  await check('unmount detaches receipt observation, not the paid backend job',async()=>{
    await reset({plan:{holdReceipt:true}});await configure({setPrompt:'detach'});await start();await waitFor(()=>readCount===1,'receipt');await page.evaluate(()=>window.detach());release('receipt');await pause(100);assert.equal(postCount,1);assert.equal(await page.evaluate(()=>window.metrics.users.length),0);assert.equal(await page.evaluate(()=>window.metrics.consumes.length),0);
  });
  await check('late active-list discovery cannot supersede an explicit completed purchase',async()=>{
    await reset({plan:{holdActive:true,active:[{id:'older-job'}]}});await configure({setPrompt:'new task'});await start();await terminal();release('active');await pause(200);assert.deepEqual((await state()).images.map(x=>x.id),['art-job-1']);assert.equal(readCount,1);
  });
  await check('transient 503 resumes the same job with GET and never re-POSTs',async()=>{
    await reset({plan:{transient:true}});await configure({setPrompt:'503'});await start();await page.waitForFunction(()=>window.g.state().images.length===1,null,{timeout:5000});assert.equal(postCount,1);assert.equal(readCount,2);assert.ok(requests.filter(x=>x.job).every(x=>x.job==='job-1'));
  });
  await check('connection loss resumes the original receipt without another purchase',async()=>{
    await reset({plan:{dropFirst:true}});await configure({setPrompt:'disconnect'});await start();await page.waitForFunction(()=>window.g.state().images.length===1,null,{timeout:5000});assert.equal(postCount,1);assert.ok(readCount>=2);assert.ok(requests.filter(x=>x.job).every(x=>x.job==='job-1'));
  });
  await check('loading source blocks submission; displayed history is preserved on explicit refusal',async()=>{
    await reset({plan:{reject:true}});await configure({setPrompt:'source',setImages:[image('kept')],setSourceLoading:true});await start();assert.equal(postCount,0);await configure({setSourceLoading:false});await start();await terminal();assert.deepEqual((await state()).images.map(x=>x.id),['kept']);assert.equal(postCount,1);
  });
}
main().catch(error=>{report.failures.push({name:'runner',error:error.stack});console.error(error.stack);}).finally(async()=>{
  for(const key of [...holds.keys()])release(key);
  if(context){report.requests.push({case:currentCase,requests});await context.close();}
  if(browser)await browser.close();if(browserServer)await browserServer.close();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  report.sourceStable=bound.every(n=>sha(path.join(sourceRoot,n))===report.sourceHashes[n]);if(!report.sourceStable)report.failures.push({name:'source-stable',error:'Source changed during run'});
  report.status=report.failures.length?'FAIL':'PASS';report.cleanup={contextsClosed:true,browserClosed:true,loopbackClosed:true};
  fs.writeFileSync(path.join(out,'REPORT.json'),JSON.stringify(report,null,2)+'\n');assert.equal(JSON.parse(fs.readFileSync(path.join(out,'REPORT.json'))).status,report.status);
  console.log('GENERATION_SESSION='+report.status+' CASES='+(report.checks.length+report.failures.length)+' PASS='+report.checks.length+' FAIL='+report.failures.length+' SOURCE_STABLE='+report.sourceStable+' SUPPLIER=0');process.exitCode=report.failures.length?1:0;
});
