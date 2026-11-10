/* Real source functions plus real Chromium DOM. All external boundaries are
 * local fixtures. --mode BASELINE/ROLLBACK asserts the original regressions. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const arg=(name,fallback)=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:fallback;
const source=path.resolve(arg('--source-root',path.join(__dirname,'..'))),mode=arg('--mode','MODIFIED'),fixed=mode==='MODIFIED';
const out=path.resolve(arg('--output-root',path.join(source,'output/workbench-reference-flow')));
const deps=createRequire(path.join(process.env.REVIEW_DEPS||path.join(source,'node_modules'),'package.json'));
const ts=deps('typescript'),{buildSync,transformSync}=deps('esbuild'),{chromium}=deps('@playwright/test');
const read=p=>fs.readFileSync(path.join(source,p),'utf8');
function fn(text,name){const sf=ts.createSourceFile('test.ts',text,ts.ScriptTarget.Latest,true);let result;function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)result=n.getText(sf);ts.forEachChild(n,walk);}walk(sf);assert.ok(result,'real function '+name);return result;}
function load(file,consoleObject=console){const code=buildSync({entryPoints:[path.join(source,file)],bundle:true,write:false,platform:'node',format:'cjs',packages:'external',conditions:['react-server']}).outputFiles[0].text;const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports,require:deps,console:consoleObject,process,Buffer,URL});return mod.exports;}
const heights=[1396,1452,977,1674,1445,1465,1561,1433,1188,1244,1569,1197,1354,1342,1174];
async function main(){
 fs.mkdirSync(out,{recursive:true});let checks=0;const report={mode,source,productionCalls:0,checks:[]};
 const check=(name,run)=>{run();checks++;report.checks.push(name);};
 const contract=load('src/lib/reference-workbench/contract.ts');
 const ratios=heights.map(height=>{try{return {height,ratio:contract.ratio(790,height)};}catch(e){return {height,error:e.message};}});
 check('15 reference geometries',()=>assert.equal(ratios.filter(r=>r.error).length,fixed?0:4));report.ratios=ratios;
 const service=read('src/lib/reference-workbench/service.ts'),locks=[...((fn(service,'synchronizeLocal')+'\n'+fn(service,'executeText')).matchAll(/transaction\(`(reference-text[^`]+)`/g))].map(m=>m[1]);
 check('one operation lock owns claim and result JSON updates',()=>{assert.equal(locks.length,3);assert.equal(new Set(locks).size,fixed?1:2);});
 if(fixed){check('invalid geometry and manual ratio',()=>{for(const size of [[0,1],[-1,2],[1.5,2],[NaN,1],[1,0]])assert.throws(()=>contract.ratio(...size));assert.equal(contract.settings({ratio:'790:1561'}).ratio,'790:1561');assert.throws(()=>contract.settings({ratio:'1000000:1'}));});
  const {workbenchImageRequest:request}=load('src/lib/reference-workbench/generation-request.ts');
  const asset=(artworkId,width,height)=>({artworkId,width,height,url:'/fixture/'+artworkId,relative:artworkId+'.png'}),product=asset('product',800,800),reference=asset('reference',790,1561),edited=asset('edited',1200,900);
  const base={key:'sample',prompt:'fixture',settings:contract.settings({resolution:'1k'}),inputs:[product,reference],geometry:reference};
  check('reference product manual edit and smart-chat frame intent',()=>{
   const smart=request(base,'receipt');assert.equal(smart.parameters.ratio,'790:1561');assert.equal(smart.frameSourceId,'reference');assert.equal(smart.ratioMode,'automatic');
   const prod=request({...base,settings:contract.settings({ratio_mode:'product'})},'receipt');assert.equal(prod.parameters.ratio,'1:1');assert.equal(prod.frameSourceId,'product');
   const manual=request({...base,settings:contract.settings({ratio_mode:'manual',ratio:'16:9'})},'receipt');assert.equal(manual.parameters.ratio,'16:9');assert.equal(manual.ratioMode,undefined);
   const edit=request({...base,source:'edited',inputs:[edited,product,reference]},'receipt');assert.equal(edit.mode,'edit');assert.equal(edit.frameSourceId,'edited');assert.equal(edit.inputs[0].role,'edit-target');assert.equal(edit.parameters.ratio,'4:3');
   const chat=request({...base,geometry:undefined,settings:contract.settings({ratio_mode:'smart',ratio:'4:3'})},'receipt');assert.equal(chat.parameters.ratio,'4:3');assert.equal(chat.frameSourceId,undefined);
   const text=request({...base,geometry:undefined,inputs:[]},'receipt');assert.equal(text.parameters.ratio,'1:1');
   assert.throws(()=>request({...base,geometry:undefined,settings:contract.settings({ratio_mode:'reference'}),inputs:[asset('bad',0,0)]},'receipt'));
  });
  const {workbenchStatus:project}=load('src/lib/reference-workbench/status.ts');
  check('status plans images roots batches and unknown',()=>{
   const op=(id,root,plans,result={})=>({id,body:{workbench_root:root},plans,result});
   const text=(key,state)=>({key,ref:key,kind:'infer',state,settings:{resolution:'1k'},error:state==='failed'?'input rejected':''});
   const ops=[op('other','B',[text('other','done')]),op('latest','A',[text('a','failed'),text('b','done'),text('c','maybe_submitted'),text('d','running')]),op('old','A',[text('old','done')])];
   const p=project(ops,{root:'A'});assert.equal(p.operationId,'latest');assert.equal(p.progress.done,1);assert.equal(p.progress.failed,1);assert.equal(p.progress.unknown,1);assert.equal(p.running,true);assert.equal(p.progress.total,4);
   assert.equal(project(ops,{root:'A',operationId:'old'}).progress.done,1);assert.equal(project(ops,{root:'B',operationId:'old'}).progress.total,0);
   const img=op('img','A',[{key:'img',kind:'generate',settings:{}}],{items:[{key:'img',state:'succeeded'}]});assert.equal(project([img],{root:'A'}).progress.done,1);
  });
  const logs=[],{workbenchTextFailure:failure}=load('src/lib/reference-workbench/text-errors.ts',{error:(...v)=>logs.push(v)});
  check('closed text errors with correlation and unknown',()=>{for(const [status,expected] of [[400,'TEXT_INPUT_REJECTED'],[422,'TEXT_INPUT_REJECTED'],[401,'TEXT_SERVICE_AUTH'],[403,'TEXT_SERVICE_AUTH'],[404,'TEXT_MODEL_UNAVAILABLE'],[429,'TEXT_SERVICE_BUSY'],[500,'OPERATION_PENDING'],[503,'OPERATION_PENDING'],[0,'OPERATION_PENDING']]){
   const r=failure(Object.assign(new Error('sk-fixture-secret https://supplier.test/?token=private'),{status}),true);assert.equal(r.body.code,expected);assert.match(r.body.traceId,/^wb-[0-9a-f]{16}$/);assert.ok(!JSON.stringify(r).includes('supplier.test'));assert.ok(!JSON.stringify(r).includes('sk-fixture'));
  }assert.equal(failure(new Error('before request'),false).body.code,'TEXT_PREPARE_FAILED');assert.ok(!JSON.stringify(logs).includes('sk-fixture'));});
 }
 const facts=fn(read('src/lib/model-config/requests.ts'),'requestFacts');const mod={exports:{}};vm.runInNewContext(transformSync(facts+'\nexport {requestFacts}',{loader:'ts',format:'cjs'}).code,{module:mod,exports:mod.exports,Request,URL});
 const query=body=>mod.exports.requestFacts(new Request('http://fixture/api/canvas/text-generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 const observed=await query({prompt:'fixture',referenceTask:'infer',images:['/product.png','/reference.png']});check('actual two-image request facts',()=>assert.equal(observed.references,fixed?2:0));report.references=observed.references;
 assert.equal((await query({sourceIds:['text-note']})).references,0);assert.equal((await query({sourceIds:['text-note','image-a'],productIds:['image-a','image-b']})).references,2);checks++;
 const html=read('services/reference-workbench/static/workbench.html'),js=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n');
 const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
 try{
  const page=await browser.newPage();const functions=['pollInferResults',...(fixed?['currentRoot','workbenchView','workbenchViewIsCurrent','resetWorkbenchView','beginWorkbenchOperation','runInferTask','submitWorkbenchJobs','workbenchItemsUrl','refreshStatus','refreshLoopOnce','loadRefs','errorHtml','esc','patchCards']:[])].map(name=>fn(js,name)).join('\n');
  await page.setContent('<input id="workbench_root" value="A"><pre id="status"></pre><div class="card" data-ref="a"><div class="body"><div class="errorBox">old error</div><textarea class="prompt">old a</textarea></div></div><div class="card" data-ref="b"><div class="body"><textarea class="prompt">old b</textarea></div></div>');
  await page.addScriptTag({content:`
   let root='A',workbenchOperation={root:'A',id:'batch',kind:'infer'},workbenchViewRevision=0,workbenchSubmitting=false,workbenchRefreshPromise=null;
   let items=[],selectedRefs=null,overrides={},updates=[],alerts=[],timers=[],rows=[],renders=0,fetchMode='ok',fetchResolve=null;
   const status=document.getElementById('status'),currentRoot=()=>document.getElementById('workbench_root').value;
   const task=()=>({root:currentRoot(),revision:workbenchViewRevision,operationId:workbenchOperation.id,config:{},selected:[{ref_path:'a'},{ref_path:'b'}]});
   const setPromptOverride=(id,text)=>{overrides[id]=text;updates.push(id);},mergePromptOverrides=list=>list.map(it=>({...it,prompt:overrides[it.ref_path]||it.prompt}));
   const canPatchCards=()=>false,render=()=>{renders++;},alert=text=>alerts.push(text),setTimeout=cb=>{timers.push(cb);},saveSettings=async()=>{};
   const crypto={randomUUID:()=> 'fixture-request-123456'},WorkbenchEnvironment={api:s=>'/api/'+s},workbenchRequestConfig=()=>({quality:'high'}),currentProjectSnapshot=()=>null,upsertProject=()=>{};
   const WorkbenchHistory={remember:async(root,data)=>data,restore:async()=>null};
   const renderProduct=()=>{},versionsKey=()=>'',activeVersion=()=>null,setCardSelected=()=>{},cardMetaHtml=()=>'',cardActionsHtml=()=>'',resultHtml=()=>'';
   window.NaumiWorkbenchError=async()=> 'fixture read failure';
   async function fetchJsonChecked(){if(fetchMode==='error')throw Error('fixture read failure');if(fetchMode==='defer')return new Promise(resolve=>fetchResolve=resolve);return {items:rows,progress:{done:9},queue:{}};}
   window.fetch=async()=>{if(fetchMode==='defer')return new Promise(resolve=>fetchResolve=resolve);return {ok:true,json:async()=>({items:rows,id:'receipt',accepted:2})};};
   ${fixed?'':'function workbenchItemsUrl(){return "fixture";}'}
   ${functions.replace(fixed?fn(js,'currentRoot'):'__never__','')}
  `});
  const mixed=await page.evaluate(async()=>{rows=[{ref_path:'a',infer:{status:'failed',error:'bad input',traceId:'wb-fixture',operation_id:'batch'}},{ref_path:'b',infer:{status:'done',prompt:'success b',operation_id:'batch'}}];await pollInferResults(task());return {updates,status:status.textContent,prompt:document.querySelector('[data-ref=b] textarea').value,alerts:alerts.length};});
  assert.equal(mixed.updates.includes('b'),fixed);report.laterSuccessApplied=mixed.updates.includes('b');checks++;
  if(fixed){
   assert.equal(mixed.prompt,'success b');assert.match(mixed.status,/成功 1，失败 1/);
   await page.evaluate(()=>{items=rows;patchCards(rows);});assert.match(await page.locator('.errorBox').textContent(),/bad input.*错误编号：wb-fixture/s);checks++;
   await page.evaluate(async()=>{const t=task();await pollInferResults(t);overrides.b='manual edit';document.querySelector('[data-ref=b] textarea').value='manual edit';await pollInferResults(t);});assert.equal(await page.locator('[data-ref=b] textarea').inputValue(),'manual edit');checks++;
   await page.evaluate(async()=>{rows[1].infer={status:'inferring',operation_id:'batch'};await pollInferResults(task());});assert.equal(await page.evaluate(()=>timers.length),1);checks++;
   await page.evaluate(async()=>{rows[1].infer={status:'maybe_submitted',error:'check original',operation_id:'batch'};await pollInferResults(task());});assert.match(await page.locator('#status').textContent(),/待核查 1/);checks++;
   await page.evaluate(async()=>{fetchMode='error';await pollInferResults(task());});assert.equal(await page.locator('#status').textContent(),'fixture read failure');checks++;
   for(const action of ['poll','status','refresh','load','infer','generate']){
    await page.evaluate(async action=>{
     resetWorkbenchView();workbenchOperation={root:'A',id:'batch',kind:'infer'};document.getElementById('workbench_root').value='A';fetchMode='defer';status.textContent='before';updates=[];
     const t=task();window.pending=action==='poll'?pollInferResults(t):action==='status'?refreshStatus():action==='refresh'?refreshLoopOnce():action==='load'?loadRefs():action==='infer'?runInferTask({...t,operationId:'batch',requestId:'request'}):submitWorkbenchJobs([{ref_path:'a'}]);
     await Promise.resolve();await Promise.resolve();
    },action);
    await page.waitForFunction(()=>fetchResolve!==null,null,{timeout:5000}).catch(error=>{throw Error(action+' did not reach its async boundary: '+error.message);});
    await page.evaluate(async()=>{
     document.getElementById('workbench_root').value='B';resetWorkbenchView();workbenchOperation={root:'B',id:'new-batch',kind:'generate'};status.textContent='new view';
     fetchResolve({ok:true,json:async()=>({id:'old-receipt',accepted:2}),items:[{ref_path:'a',infer:{status:'done',prompt:'stale'}}],progress:{done:999},queue:{}});fetchResolve=null;await window.pending;
    });
    assert.equal(await page.locator('#status').textContent(),'new view',action+' stale response');assert.equal(await page.evaluate(()=>workbenchOperation.id),'new-batch');assert.equal(await page.evaluate(()=>updates.length),0);checks++;
   }
   // Same-project newer batch, not just a different root.
   await page.evaluate(async()=>{document.getElementById('workbench_root').value='A';resetWorkbenchView();workbenchOperation={root:'A',id:'first',kind:'infer'};fetchMode='defer';window.pending=pollInferResults(task());});
   await page.evaluate(async()=>{beginWorkbenchOperation('infer');workbenchOperation.id='second';status.textContent='second';fetchResolve({items:[{ref_path:'b',infer:{status:'done',prompt:'stale'}}]});fetchResolve=null;await window.pending;});assert.equal(await page.locator('#status').textContent(),'second');checks++;
  }
 }finally{await browser.close();}
 report.count=checks;fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify(report,null,2));
 console.log(`${mode}=PASS RATIO_BLOCKS=${ratios.filter(r=>r.error).length}/15 IMAGE_REFERENCES=${observed.references} LATER_SUCCESS=${report.laterSuccessApplied?'APPLIED':'DROPPED'} CHECKS=${checks} PRODUCTION_CALLS=0`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
