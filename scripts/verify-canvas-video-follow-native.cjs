'use strict';
// Full actual Next/ReactFlow Canvas. Durable task discovery/artwork persistence
// are isolated HTTP fixtures; only original tasks are followed, never generated.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process'),{chromium,expect}=require('@playwright/test');
const out=path.resolve(process.argv[2]||'output/canvas-video-follow-native'),port=Number(process.env.CANVAS_VIDEO_FOLLOW_PORT||15430),base='http://127.0.0.1:'+port;
async function free(p){await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve))})}
(async()=>{
 fs.mkdirSync(out,{recursive:true});await free(port);await free(port+1);
 const app=spawn(process.execPath,['scripts/serve-canvas-regeneration-fixture.cjs'],{env:{...process.env,CANVAS_REGEN_PORT:String(port)},windowsHide:true,stdio:['ignore','pipe','pipe']}),log=fs.createWriteStream(path.join(out,'runtime.log'));app.stdout.pipe(log);app.stderr.pipe(log);
 let browser,page,arts,tasks=[{id:'legacy-video',source:'canvas',sourceId:'regeneration-root',status:'processing',progress:55,prompt:'视频恢复'}];
 const checks=[],queries=[],positions=[],merges=[],errors=[],external=[],paid=[];const pass=n=>{checks.push(n);console.log('PASS '+n)};
 try{
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url()),json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(!['127.0.0.1','localhost'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){external.push(u.origin);return route.abort()}
   if(u.pathname==='/api/account'){const original=await route.fetch(),body=await original.json();arts??=body.artworks;return json({...body,artworks:arts})}
   if(u.pathname==='/api/video/tasks'&&u.searchParams.has('sourceIds')){queries.push({url:u.toString(),headers:req.headers(),tasks:structuredClone(tasks)});return json({ok:true,tasks})}
   if(u.pathname==='/api/artworks/position'){const body=req.postDataJSON();positions.push(body);const art=arts.find(a=>a.id===body.id);assert(art);if(art.canvasX==null||art.canvasY==null)Object.assign(art,{canvasX:body.x,canvasY:body.y});return json({ok:true})}
   if(u.pathname==='/api/artworks/get'){const ids=(u.searchParams.get('ids')||'').split(',');merges.push(ids);return json({artworks:arts.filter(a=>ids.includes(a.id))})}
   if(['/api/imagegen','/api/generate-image','/api/video/generate'].includes(u.pathname)&&req.method()==='POST'){paid.push(u.pathname);return json({error:'NO_PAID_POST_IN_FOLLOW_FIXTURE'},500)}
   return route.continue();
  });
  let ready=false;for(const deadline=Date.now()+180000;Date.now()<deadline;){if(app.exitCode!==null)throw Error('Own Next fixture exited '+app.exitCode);ready=await fetch(base+'/canvas',{signal:AbortSignal.timeout(5000)}).then(r=>r.ok).catch(()=>false);if(ready)break;await new Promise(r=>setTimeout(r,300))}assert(ready);
  await page.clock.install();await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:180000});const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);await node('regeneration-root').waitFor({timeout:150000});const pending=node('pend-video-task-legacy-video');await pending.waitFor();await expect.poll(()=>queries.length).toBeGreaterThan(0);pass('ACTUAL_CANVAS_RESTORES_ORIGINAL_RUNNING_VIDEO_PLACEHOLDER');
  const originalIdentity=await pending.getAttribute('data-id');assert(queries.every(q=>q.headers['x-naumi-project-context']==='tree:regeneration-root'&&q.headers['x-naumi-workspace']==='personal'));pass('TASK_DISCOVERY_CARRIES_CAPTURED_WORKSPACE_AND_PROJECT');
  async function poll(next){tasks=next;const count=queries.length;await page.clock.fastForward(16000);await expect.poll(()=>queries.length).toBeGreaterThan(count)}
  await poll([{...tasks[0],status:'needs_attention',progress:0}]);await expect(pending.getByText('视频任务待处理',{exact:false})).toBeVisible();assert.equal(await pending.getAttribute('data-id'),originalIdentity);pass('NEEDS_ATTENTION_UPDATES_SAME_ORIGINAL_TASK_CARD');
  await poll([{...tasks[0],status:'cancelled'}]);await pending.waitFor({state:'detached'});assert.equal(positions.length,0);assert.equal(merges.length,0);pass('CANCELLED_TERMINAL_REMOVES_ONLY_ORIGINAL_PLACEHOLDER_NO_RESULT_WRITE');
  const output={...arts[0],id:'video-output',title:'视频恢复结果',parentId:'regeneration-root',source:'video',canvasX:null,canvasY:null};arts.push(output);
  await poll([{...tasks[0],status:'completed',artworkId:output.id}]);await expect.poll(()=>positions.length).toBe(1);await expect.poll(()=>merges.length).toBe(1);await node(output.id).waitFor();assert.equal(positions[0].mode,'initialize');assert.equal(positions[0].id,output.id);pass('COMPLETED_ORIGINAL_RESULT_INITIALIZED_MERGED_AND_RENDERED');
  await poll(tasks);assert.equal(positions.length,1);assert.equal(merges.length,1);pass('REPEATED_DISCOVERY_NEVER_REGENERATES_OR_REINITIALIZES_RESULT');
  await page.setViewportSize({width:390,height:844});await expect(node('regeneration-root')).toBeAttached();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=390));pass('MOBILE390_PROJECT_REMAINS_USABLE_WITH_RECOVERED_RESULT');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(paid,[]);pass('NO_PAGEERROR_EXTERNAL_OR_PAID_GENERATION_POST');
  const literal=`CANVAS_VIDEO_FOLLOW_NATIVE=PASS CHECKS=${checks.length} FULL_NEXT_REACTFLOW=1 POSITION_INITIALIZE=${positions.length} MERGES=${merges.length} PAID_GENERATION_POSTS=0`;
  fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status:'PASS',checks,queries,positions,merges,errors,external,paid,literal,scope:'Actual complete Next/ReactFlow and follower; controlled task/account HTTP; no PG or supplier; fixture output image stands for existing video artwork.'},null,2));console.log(literal);
 }catch(error){fs.writeFileSync(path.join(out,'FAILURE.json'),JSON.stringify({error:error.stack,checks,queries,positions,merges,errors,external,paid,body:await page?.locator('body').innerText().catch(()=>null)},null,2));throw error}
 finally{await browser?.close();if(app.exitCode===null&&app.signalCode===null){if(process.platform==='win32'){const q=spawnSync('taskkill',['/pid',String(app.pid),'/t','/f'],{windowsHide:true,encoding:'utf8'});fs.writeFileSync(path.join(out,'fixture-stop.log'),q.stdout+q.stderr)}else app.kill('SIGTERM')}log.end()}
})().catch(error=>{console.error(error);process.exitCode=1});
