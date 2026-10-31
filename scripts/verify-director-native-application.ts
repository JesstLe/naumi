import assert from "node:assert/strict";
import {connectNativeParentDatabase} from "./video-fusion/native-parent-database";
import {randomBytes, randomUUID, createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {mkdir, writeFile, unlink} from "node:fs/promises";
import path from "node:path";
import {Pool} from "pg";
import {chromium,expect as originalExpect} from "@playwright/test";
import {newDirectorProject,directorProjectSchema,directorProjectFingerprint} from "../src/lib/director/project";
import {createVideoFixture, CAP_RICH} from "./video-fusion/harness";
import {prepareVideoAssets} from "./video-fusion/assets.mjs";
import {generateCanvasVideo} from "../src/lib/video/canvas-submission";
import {prewarmNativeWriteRoutes} from './verification/native-route-readiness';
const expect=originalExpect.configure({timeout:30000});

/** Real Next/API/transactions/worker/storage/billing; disposable PostgreSQL and simulated upstreams only. */
async function main() {
  const out=path.resolve(process.argv[2]||process.env.DIRECTOR_APP_EVIDENCE||"output/director-native-application");await mkdir(out,{recursive:true});
  const owner="canvas-director-native-20261027", name="director-native-app-"+randomUUID(), password=randomBytes(24).toString("hex"), database="naumi_video_fixture_native_"+randomBytes(6).toString("hex");
  const envFile=path.join(out,name+".env");await writeFile(envFile,`POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=${database}\n`,{mode:0o600});
  function docker(args:string[]){const r=spawnSync("docker",args,{encoding:"utf8",windowsHide:true});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined,page:any;const browserErrors:string[]=[],network:Array<{phase:string;url:string;status?:number;failure?:string}>=[];
  let container="", pool:Pool|undefined, fixture:Awaited<ReturnType<typeof createVideoFixture>>|undefined, listening=false;
  let digest="";const publications=new Map<string,unknown>();
  const router=createServer(async(req,res)=>{try{
    const parts:Buffer[]=[];for await(const part of req)parts.push(part);const body=parts.length?JSON.parse(Buffer.concat(parts).toString()):{};
    const send=(status:number,value:unknown)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(value));};
    if(req.url==="/internal/config/state")return send(200,{digest});
    if(req.url==="/internal/config/prepare")return send(200,{digest:body.digest,phase:"prepared"});
    if(req.url==="/internal/config/activate"){if(body.expectedDigest!==digest)return send(409,{});digest=body.digest;const p={id:body.id,digest,phase:"applied"};publications.set(body.id,p);return send(200,p);}
    if(req.url?.startsWith("/internal/config/publications/")){const p=publications.get(req.url.split("/").at(-1)!);return send(p?200:404,p||{});}
    send(404,{});
  }catch{res.writeHead(500);res.end();}});
  try {
    const parentDatabase=await connectNativeParentDatabase();
    let databaseUrl:string;
    if(parentDatabase){pool=parentDatabase.pool;databaseUrl=parentDatabase.url;}else{
    container=docker(["run","--detach","--rm","--name",name,"--label",`naumi.task=${owner}`,"--memory","768m","--cpus","2","--tmpfs","/var/lib/postgresql/data","--publish","127.0.0.1::5432","--env-file",envFile,"postgres:16-alpine"]);
    // The image's temporary initialization server can answer its Unix socket
    // before the final TCP postmaster exists. Our actual clients use TCP.
    const readiness:Array<{attempt:number;exit:number|null;literal:string}>=[];
    let ready=false;for(let i=0;i<60;i++){
      const probe=spawnSync("docker",["exec",container,"pg_isready","--host","127.0.0.1","-U","postgres","-d",database],{windowsHide:true,encoding:"utf8"});
      readiness.push({attempt:i,exit:probe.status,literal:probe.stdout+probe.stderr});
      if(probe.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,200));
    }
    await writeFile(path.join(out,"postgres-readiness.json"),JSON.stringify({transport:"TCP",ready,samples:readiness},null,2));assert.ok(ready);
    const port=Number(docker(["port",container,"5432/tcp"]).split(":").at(-1));
    databaseUrl=`postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;pool=new Pool({connectionString:databaseUrl,max:2});
    await pool.query("CREATE TABLE public.naumi_video_fixture_guard(owner text NOT NULL)");await pool.query("INSERT INTO public.naumi_video_fixture_guard VALUES($1)",["canvas-video-fusion-20261013"]);
    }
    await new Promise<void>(r=>router.listen(0,"127.0.0.1",r));listening=true;
    const address=router.address() as {port:number};
    process.env.NAUMI_VERIFY_ISOLATED_DB="1";process.env.VIDEO_FIXTURE_DATABASE_URL=databaseUrl;
    process.env.VIDEO_FIXTURE_ROUTER_MANAGEMENT_URL=`http://127.0.0.1:${address.port}`;process.env.VIDEO_FIXTURE_ROUTER_TOKEN=randomBytes(32).toString("hex");process.env.VIDEO_FIXTURE_ROUTER_ENVELOPE_SECRET=randomBytes(32).toString("hex");
    const assetsRoot=path.join(out,"assets");await prepareVideoAssets(assetsRoot,[4]);
    const h=fixture=await createVideoFixture({startWorker:false,databaseUrl,assetsRoot,videoDefinition:{...CAP_RICH,providerOptions:{seed:{type:"integer",minimum:0,maximum:9999}}}});

    const id="director-"+randomUUID(),key=`tree:${id}`,project=newDirectorProject();project.duration=2;
    const payload={id,projectKey:key,expectedRevision:0,operationId:randomUUID(),title:"API导演",project,x:20,y:30};
    const created=await h.request<any>("a","POST","/api/canvas/director-nodes",payload);assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.node.revision,1);
    assert.equal((await h.request<any>("a","POST","/api/canvas/director-nodes",payload)).body.node.revision,1);
    assert.equal((await h.request("b","GET",`/api/canvas/director-nodes/${id}`)).status,404);
    assert.equal((await h.request("a","PATCH",`/api/canvas/director-nodes/${id}`,{expectedRevision:0,operationId:randomUUID(),title:"stale"})).status,409);
    const simultaneous=await Promise.all([1,2].map(x=>h.request<any>("a","PATCH",`/api/canvas/director-nodes/${id}`,{expectedRevision:1,operationId:randomUUID(),x})));assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
    let node=(await h.request<any>("a","GET",`/api/canvas/director-nodes/${id}`)).body.node;
    const updated=await h.request<any>("a","PATCH",`/api/canvas/director-nodes/${id}`,{expectedRevision:node.revision,operationId:randomUUID(),project:{...project,panoramaArtworkId:h.refs.image.id}});assert.equal(updated.status,200,JSON.stringify(updated.body));node=updated.body.node;
    const parsedProject=directorProjectSchema.parse(node.project);assert.notEqual(JSON.stringify(node.project),JSON.stringify(parsedProject));assert.equal(directorProjectFingerprint(node.project),directorProjectFingerprint(parsedProject));
    await writeFile(path.join(out,'JSONB_PROJECT_ORDER.json'),JSON.stringify({realPostgres:true,rawStringComparisonDifferent:true,semanticFingerprintEqual:true,postgresKeys:Object.keys(node.project),parsedKeys:Object.keys(parsedProject)},null,2));
    const bad=await h.request<any>("b","POST","/api/canvas/director-nodes",{...payload,id:'director-b-'+randomUUID(),projectKey:undefined,operationId:randomUUID(),project:{...project,panoramaArtworkId:h.refs.image.id}});assert.equal(bad.status,404);
    const copied=await h.request<any>("a","POST","/api/canvas/nodes/copy",{operationId:randomUUID(),ids:[id,h.refs.image.id],projectKey:key});assert.equal(copied.status,200,JSON.stringify(copied.body));assert.equal(copied.body.directorNodes.length,1);const copy=copied.body.directorNodes[0];assert.equal(copy.project.panoramaArtworkId,copied.body.idMap[h.refs.image.id]);assert.deepEqual(copy.outputs,[]);
    const atomic=await h.request<any>("a","POST","/api/canvas/history",{operationId:randomUUID(),operations:[{type:"director-patch",id,expectedRevision:node.revision,fields:{x:999}},{type:"visibility",id:'missing-other-owned-media',visible:false}]});assert.equal(atomic.status,409);assert.equal((await h.request<any>("a","GET",`/api/canvas/director-nodes/${id}`)).body.node.x,node.x);
    const operationId=randomUUID(),mixedDelete={operationId,directorIds:[copy.id],artworkIds:copied.body.artworkIds};assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",mixedDelete)).status,200);assert.equal((await h.request("a","POST","/api/canvas/nodes/delete",mixedDelete)).status,200);assert.equal((await h.request("a","GET",`/api/canvas/director-nodes/${copy.id}`)).status,404);
    const restore=await h.request<any>("a","POST","/api/canvas/history",{operationId:randomUUID(),operations:[{type:"director-visibility",id:copy.id,visible:true},...copied.body.artworkIds.map((id:string)=>({type:"visibility",id,visible:true}))]});assert.equal(restore.status,200,JSON.stringify(restore.body));assert.equal((await h.request("a","GET",`/api/canvas/director-nodes/${copy.id}`)).status,200);
    const freeBefore=await h.creditState("a");
    const warm=[];for(const url of ['/api/account','/api/projects','/api/canvas/text-nodes','/api/canvas/director-nodes?includeDeleted=1','/api/canvas/node-settings','/api/video/assets?limit=30','/api/config','/api/canvas/video-nodes','/api/video/tasks','/api/canvas/image-tasks','/api/video/media-jobs','/api/canvas/workflow-import','/api/models?feature=canvas.image','/api/video/catalog','/api/feature-access','/api/enterprise','/api/auth/session','/api/version']){const response=await h.request<any>('a','GET',url);warm.push({url,status:response.status});assert.equal(response.status,200,JSON.stringify({url,status:response.status,body:response.body}));}await writeFile(path.join(out,'prewarm.json'),JSON.stringify(warm,null,2));
    const writeRoutes=await prewarmNativeWriteRoutes(h,['/api/video/references',`/api/canvas/director-nodes/${id}/outputs`,`/api/canvas/video-nodes/prewarm/generate`]);await writeFile(path.join(out,'native-write-route-prewarm.json'),JSON.stringify(writeRoutes,null,2));await h.request('a','GET',h.refs.image.url);await h.request('a','POST','/api/media/image-cache',{});
    // Finish the real dev compilation and download its actual entry assets
    // before starting the browser's fixed webpack chunk-load timer. No routes
    // are mocked and no failed browser navigation is silently retried.
    const htmlResponse=await fetch(`${h.baseUrl}/canvas?node=${id}`,{headers:{cookie:h.cookies.a},signal:AbortSignal.timeout(180000)});assert.equal(htmlResponse.status,200);
    const html=await htmlResponse.text(),entryAssets=[...new Set(Array.from(html.matchAll(/(?:src|href)="([^"<>]+)"/g),match=>match[1].replaceAll('&amp;','&')).filter(url=>url.startsWith('/_next/static/')&&!url.includes('.woff')))];
    const warmed=[];for(const url of entryAssets){const response=await fetch(h.baseUrl+url,{signal:AbortSignal.timeout(180000)});assert.equal(response.status,200,url);warmed.push({url,bytes:(await response.arrayBuffer()).byteLength});}
    await writeFile(path.join(out,'prewarm-assets.json'),JSON.stringify(warmed,null,2));
    browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const context=await browser.newContext({viewport:{width:1440,height:960}});await context.addCookies([{name:'nv_user',value:h.cookies.a.slice(8),url:h.baseUrl,httpOnly:true,sameSite:'Lax'},{name:'naumi_locale',value:'zh',url:h.baseUrl}]);page=await context.newPage();page.setDefaultTimeout(180000);const errors=browserErrors;page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('request',(request:any)=>{const url=new URL(request.url());network.push({phase:'request',url:url.pathname});});page.on('response',(response:any)=>{const url=new URL(response.url());network.push({phase:'response',url:url.pathname,status:response.status()});});page.on('requestfailed',(request:any)=>{const url=new URL(request.url());network.push({phase:'failed',url:url.pathname,failure:request.failure()?.errorText});});
    await page.goto(`${h.baseUrl}/canvas?node=${id}`,{waitUntil:'domcontentloaded',timeout:180000});const card=page.locator(`.react-flow__node[data-id="${id}"]`);await card.getByTestId('director-canvas-node').waitFor();await card.getByRole('button',{name:'打开3D导演台',exact:true}).first().click();const editor=page.getByTestId('director-editor');await editor.locator('canvas[data-director-renderer="webgl"]').waitFor();await expect(editor.getByRole('button',{name:'图片回画布',exact:true})).toBeEnabled();
    await editor.getByLabel('工程名称',{exact:true}).fill('原生导演验收');await editor.getByRole('button',{name:'行走',exact:true}).click();await editor.getByRole('button',{name:'方体',exact:true}).click();await editor.getByLabel('位置 X',{exact:true}).fill('-1');await editor.getByRole('button',{name:'添加机位',exact:true}).click();await editor.getByLabel('对象名称',{exact:true}).fill('运动机位');await editor.getByRole('button',{name:'方体 2',exact:true}).click();
    await editor.getByRole('button',{name:'关键帧',exact:true}).click();await editor.getByLabel('导演时间轴',{exact:true}).focus();await page.keyboard.press('End');await editor.getByLabel('位置 X',{exact:true}).fill('1');await editor.getByRole('button',{name:'关键帧',exact:true}).click();
    const savingAt=Date.now(),savedResponse=page.waitForResponse((response:any)=>new URL(response.url()).pathname===`/api/canvas/director-nodes/${id}`&&response.request().method()==='PATCH');
    await editor.getByRole('button',{name:'保存工程',exact:true}).click();const saved=await savedResponse;assert.equal(saved.status(),200);await saved.finished();
    const persistedProject=(await h.request<any>('a','GET',`/api/canvas/director-nodes/${id}`)).body.node.project;assert.equal(persistedProject.name,'原生导演验收');assert.equal(persistedProject.keyframes.length,2);
    await writeFile(path.join(out,'SAVE_RECEIPT.json'),JSON.stringify({status:'PASS',http:200,elapsedMs:Date.now()-savingAt,projectName:persistedProject.name,keyframes:persistedProject.keyframes.length}));
    await expect(editor.getByRole('button',{name:'保存工程',exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'图片回画布',exact:true})).toBeEnabled();
    await page.screenshot({path:path.join(out,'actual-editor-desktop.png')});
    await editor.getByRole('button',{name:'图片回画布',exact:true}).click();await expect.poll(async()=>{const r=await h.request<any>('a','GET',`/api/canvas/director-nodes/${id}`);return r.body.node.outputs.length;},{timeout:120000}).toBe(1);await expect(editor.getByRole('button',{name:'视频回画布',exact:true})).toBeEnabled();
    await editor.getByRole('button',{name:'视频回画布',exact:true}).click();await expect.poll(async()=>{const r=await h.request<any>('a','GET',`/api/canvas/director-nodes/${id}`);return r.body.node.outputs.length;},{timeout:120000}).toBe(2);await expect(editor.getByRole('button',{name:'视频回画布',exact:true})).toBeEnabled();
    node=(await h.request<any>('a','GET',`/api/canvas/director-nodes/${id}`)).body.node;assert.equal(node.project.name,'原生导演验收');assert.equal(node.project.keyframes.length,2);assert.equal(node.project.cameras.length,2);
    const assets=(await h.request<any>('a','GET','/api/video/assets?limit=100')).body.assets,outputs=node.outputs.map((output:any)=>assets.find((asset:any)=>asset.artworkId===output.artworkId));assert.ok(outputs.every(Boolean));assert.deepEqual(outputs.map((asset:any)=>asset.kind),['image','video']);
    for(const asset of outputs){assert.equal(asset.projectKey,key);const data=await h.request<ArrayBuffer>('a','GET',asset.url);assert.equal(data.status,200);assert.equal(createHash('sha256').update(Buffer.from(data.body)).digest('hex'),asset.sha256);assert.equal((await h.request('b','GET',asset.url)).status,404);await writeFile(path.join(out,asset.kind==='image'?'actual-canvas-frame.png':'actual-canvas-preview.webm'),Buffer.from(data.body));}
    const decoded=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-i',path.join(out,'actual-canvas-preview.webm'),'-map','0:v:0','-f','framemd5','-'],{encoding:'utf8',windowsHide:true});assert.equal(decoded.status,0,decoded.stderr);const decodedFrames=decoded.stdout.split(/\r?\n/).filter(line=>line&&!line.startsWith('#'));assert.ok(decodedFrames.length>=12,'decoded animation frames: '+decodedFrames.length);assert.ok(new Set(decodedFrames.map(line=>line.split(',').at(-1)?.trim())).size>=3);await writeFile(path.join(out,'decoded-frame-hashes.txt'),decoded.stdout);
    assert.deepEqual(await h.creditState('a'),freeBefore);assert.equal(h.supplierCalls().filter(call=>call.phase==='create').length,0);
    await editor.getByRole('button',{name:'保存并关闭',exact:true}).click();await expect(editor).toHaveCount(0);await page.reload({waitUntil:'domcontentloaded'});await card.getByRole('button',{name:'打开3D导演台',exact:true}).first().click();await expect(editor.getByLabel('工程名称',{exact:true})).toHaveValue('原生导演验收');
    await page.setViewportSize({width:390,height:844});assert.ok(await editor.evaluate((element:HTMLElement)=>element.getBoundingClientRect().width<=390));
    await expect(editor.locator('canvas[data-director-renderer="webgl"]')).toBeVisible();await expect(editor.getByRole('button',{name:'图片回画布',exact:true})).toBeEnabled();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
    await editor.getByRole('button',{name:'对象',exact:true}).click();await editor.getByRole('button',{name:'方体 2',exact:true}).click();await editor.getByRole('button',{name:'属性',exact:true}).click();await expect(editor.getByLabel('对象名称',{exact:true})).toHaveValue('方体 2');await editor.getByRole('button',{name:'属性',exact:true}).click();
    await page.screenshot({path:path.join(out,'actual-editor-mobile.png')});await editor.getByRole('button',{name:'保存并关闭',exact:true}).click();

    await page.setViewportSize({width:1440,height:960});
    await page.getByTestId('canvas-add-node-button').click();await page.getByTestId('canvas-create-menu').getByRole('menuitem',{name:'3D 导演台',exact:true}).click();await editor.waitFor();await editor.getByLabel('工程名称',{exact:true}).fill('交互导演节点');await editor.getByRole('button',{name:'保存并关闭',exact:true}).click();await expect(editor).toHaveCount(0);
    const live=async()=>(await h.request<any>('a','GET','/api/canvas/director-nodes')).body.nodes;
    const interactive=(await live()).find((item:any)=>item.title==='交互导演节点');assert.ok(interactive);const interactiveCard=page.locator(`.react-flow__node[data-id="${interactive.id}"]`),title=interactiveCard.getByText('交互导演节点',{exact:true});await title.waitFor();const drag=await title.boundingBox();assert.ok(drag);await page.mouse.move(drag.x+Math.min(70,drag.width/2),drag.y+drag.height/2);await page.mouse.down();await page.mouse.move(drag.x+Math.min(70,drag.width/2)+70,drag.y+drag.height/2+50,{steps:12});await page.mouse.up();
    await expect.poll(async()=>Number((await live()).find((item:any)=>item.id===interactive.id)?.x),{timeout:60000}).not.toBe(interactive.x);const moved=(await live()).find((item:any)=>item.id===interactive.id);await expect(interactiveCard.getByTestId('director-canvas-node')).toHaveAttribute('data-revision',String(moved.revision));
    await page.locator('button[data-tool="undo"]').click();await expect.poll(async()=>Number((await live()).find((item:any)=>item.id===interactive.id)?.x)).toBe(interactive.x);await page.locator('button[data-tool="redo"]').click();await expect.poll(async()=>Number((await live()).find((item:any)=>item.id===interactive.id)?.x)).toBe(moved.x);
    await title.click({button:'right'});await page.getByRole('menuitem',{name:/^创建副本/}).click();await expect.poll(async()=>(await live()).filter((item:any)=>item.title==='交互导演节点').length).toBe(2);const duplicate=(await live()).find((item:any)=>item.title==='交互导演节点'&&item.id!==interactive.id);assert.ok(duplicate);const duplicateTitle=page.locator(`.react-flow__node[data-id="${duplicate.id}"]`).getByText('交互导演节点',{exact:true});await duplicateTitle.click({button:'right'});await page.getByRole('menuitem',{name:/^删除/}).click();await page.getByRole('button',{name:'确定删除',exact:true}).click();await expect.poll(async()=>(await live()).some((item:any)=>item.id===duplicate.id)).toBe(false);
    await page.locator('button[data-tool="undo"]').click();await expect.poll(async()=>(await live()).some((item:any)=>item.id===duplicate.id)).toBe(true);await page.locator('button[data-tool="redo"]').click();await expect.poll(async()=>(await live()).some((item:any)=>item.id===duplicate.id)).toBe(false);await page.locator('button[data-tool="undo"]').click();await expect.poll(async()=>(await live()).some((item:any)=>item.id===duplicate.id)).toBe(true);await page.screenshot({path:path.join(out,'actual-canvas-graph.png')});
    const videoId='vnode-director-reuse-'+randomUUID(),video=outputs[1],image=outputs[0];const reusable=await h.request<any>('a','POST','/api/canvas/video-nodes',{id:videoId,projectKey:key,expectedRevision:0,operationId:randomUUID(),config:{modelId:'video-a',providerId:'managed-video',mode:'reference',prompt:'延续 {{ref 1}}，参考 {{ref 2}}',durationSeconds:4,resolution:'720p',aspectRatio:'16:9',generateAudio:false},inputs:[{id:'motion',nodeId:video.artworkId,kind:'video',role:'source_video',value:video.url},{id:'look',nodeId:image.artworkId,kind:'image',role:'reference',value:image.url}]});assert.equal(reusable.status,201,JSON.stringify(reusable.body));
    const generate={expectedRevision:1,idempotencyKey:randomUUID()},sent=await h.request<any>('a','POST',`/api/canvas/video-nodes/${videoId}/generate`,generate);assert.equal(sent.status,202,JSON.stringify(sent.body));assert.equal((await h.request<any>('a','POST',`/api/canvas/video-nodes/${videoId}/generate`,generate)).body.taskId,sent.body.taskId);
    const until=Date.now()+180000;let task:any;while(Date.now()<until){await h.forceVideoPollDue(sent.body.taskId);await h.tick();task=(await h.request<any>('a','GET',`/api/video/tasks?id=${sent.body.taskId}`)).body.task;if(task.status==='completed')break;assert.ok(!['failed','cancelled','needs_attention'].includes(task.status),JSON.stringify(task));await new Promise(r=>setTimeout(r,300));}assert.equal(task.status,'completed');const frozen=await h.taskPersistence('a',task.id);assert.deepEqual(frozen.video_references.map((ref:any)=>ref.artworkId),[video.artworkId,image.artworkId]);assert.equal(h.supplierCalls().filter(call=>call.phase==='create').length,1);assert.deepEqual(errors,[]);
    // Actual extracted client composition -> original HTTP/PG/task/ledger path.
    // Lose one accepted response, then query that same operation without POST.
    const storageValues=new Map<string,string>(),storage={getItem:(k:string)=>storageValues.get(k)??null,setItem:(k:string,v:string)=>{storageValues.set(k,v);},removeItem:(k:string)=>{storageValues.delete(k);}};
    let currentNode=(await h.request<any>('a','GET',`/api/canvas/video-nodes/${videoId}`)).body.node;
    let clientPosts=0,loseResponse=true,postedBatchId:string|undefined;const clientBalanceBefore=await h.balance("a");const persisted:number[]=[];
    const request=async(url:string,init:RequestInit={})=>{
      const result=await h.request<any>('a',init.method||'GET',url,init.body?JSON.parse(String(init.body)):undefined);
      if(init.method==='POST'){clientPosts++;if(url.endsWith('/batch'))postedBatchId=JSON.parse(String(init.body)).idempotencyKey;if(loseResponse){loseResponse=false;throw new Error('R6S_LOST_ACCEPTED_RESPONSE');}}
      return new Response(JSON.stringify(result.body),{status:result.status,headers:{'content-type':'application/json'}});
    };
    const refreshNode=async()=>{currentNode=(await h.request<any>('a','GET',`/api/canvas/video-nodes/${videoId}`)).body.node;};
    const ports={storage,request,submit:async(url:string,init:RequestInit,_quote:any,onIdentity:(id:string)=>void)=>{onIdentity(new Headers(init.headers).get('x-naumi-billing-operation-id')!);return request(url,init);},node:()=>currentNode,
      save:async(id:string,draft:any)=>{const saved=await h.request<any>('a','PATCH',`/api/canvas/video-nodes/${id}`,{...draft,operationId:randomUUID()});assert.equal(saved.status,200,JSON.stringify(saved.body));currentNode=saved.body.node;return currentNode;},refreshNodes:refreshNode,refreshTasks:async()=>{},refreshCredits:async()=>{}};
    const scope={assertCurrent:()=>{},isCurrent:()=>true},draft=()=>({title:currentNode.title,config:currentNode.config,inputs:currentNode.inputs,expectedRevision:currentNode.revision});
    const call={email:h.accounts.a,nodeId:videoId,draft:draft(),quote:{version:1,credits:6,reserveCredits:6} as any,onPersisted:(revision:number)=>persisted.push(revision)};
    await assert.rejects(generateCanvasVideo(call,scope,ports),/R6S_LOST_ACCEPTED_RESPONSE/);
    const retained=JSON.parse([...storageValues.values()][0]);assert.ok(retained.idempotencyKey&&!retained.taskId);assert.equal(clientPosts,1);assert.equal(persisted.length,1);
    const found=(await h.request<any>('a','GET',`/api/video/tasks?idempotencyKey=${retained.idempotencyKey}`)).body.task;assert.ok(found?.id);
    await assert.rejects(generateCanvasVideo({...call,draft:draft()},scope,ports),/仍在执行/);assert.equal(clientPosts,1);
    const complete=async(id:string)=>{const until=Date.now()+180000;while(Date.now()<until){await h.forceVideoPollDue(id);await h.tick();const task=(await h.request<any>('a','GET',`/api/video/tasks?id=${id}`)).body.task;if(task.status==='completed')return task;assert.ok(!['failed','cancelled','needs_attention'].includes(task.status),JSON.stringify(task));await new Promise(r=>setTimeout(r,300));}throw Error('R6S_VIDEO_COMPLETION_TIMEOUT');};
    await complete(found.id);const single=await h.taskPersistence('a',found.id);assert.equal(single.video_references.length,2);
    // A separate draft uses the existing batch client and frozen workflow, not
    // a second task owner. First run may return its original preparation state.
    const batchId='vnode-r6s-batch-'+randomUUID(),made=await h.request<any>('a','POST','/api/canvas/video-nodes',{id:batchId,projectKey:key,expectedRevision:0,operationId:randomUUID(),config:{...currentNode.config,batchCount:2},inputs:currentNode.inputs});assert.equal(made.status,201,JSON.stringify(made.body));currentNode=made.body.node;
    const batchCall={...call,nodeId:batchId,draft:draft(),count:2};let batchError:unknown;try{await generateCanvasVideo(batchCall,scope,{...ports,refreshNodes:async()=>{}});}catch(error){batchError=error;}
    const batchReceipt=[...storageValues.entries()].find(([key])=>key.includes('canvas-video-batch'));
    if(batchError)assert.ok(batchReceipt,String(batchError));
    assert.ok(postedBatchId);const untilBatch=Date.now()+180000;let run:any;
    {
      while(Date.now()<untilBatch){await h.tick();const receipt=await h.request<any>('a','GET',`/api/canvas/video-nodes/${batchId}/batch?batchId=${postedBatchId}`);run=receipt.body.run;if(run?.nodes.every((node:any)=>node.taskId))break;await new Promise(r=>setTimeout(r,300));}
      assert.equal(run.nodes.length,2);let cost=Number(found.cost);for(const node of run.nodes){const task=await complete(node.taskId);cost+=Number(task.cost);}
      assert.ok(cost>0&&Number.isFinite(cost));assert.equal(clientBalanceBefore-await h.balance('a'),cost);
      if(batchReceipt){const before=clientPosts;await generateCanvasVideo(batchCall,scope,{...ports,refreshNodes:async()=>{}});assert.equal(clientPosts,before);assert.equal(storageValues.has(batchReceipt[0]),false);}
    }
    assert.equal(clientPosts,2);assert.equal(h.supplierCalls().filter(call=>call.phase==='create').length,4);
    await writeFile(path.join(out,'result.json'),JSON.stringify({realApp:true,realPostgres:true,realBrowserWebGL:true,actualMenuCreateDragUndoRedoDuplicateDeleteRestore:true,sceneCharactersCameraKeyframes:true,saveReload:true,concurrentRevisionOneWinner:true,replay:true,mixedCopyDeleteRestoreAtomic:true,actualImageVideoOutputToCanvas:true,mediaHashes:true,crossAccount404:true,renderOutputsFree:true,bothOutputsReusedByVideoTask:true,extractedVideoApplication:true,lostAcceptedResponseOriginalLookup:true,batchOriginalReceiptBody:true,clientPosts,simulatedSupplierCreates:4,paidCalls:0,taskId:task.id,projectKey:key,outputs:outputs.map((asset:any)=>({artworkId:asset.artworkId,kind:asset.kind,bytes:asset.bytes,sha256:asset.sha256,probe:asset.probe}))},null,2));
    console.log('DIRECTOR_APPLICATION=PASS REAL_APP_DB_WEBGL=PASS SCENE_CHARACTER_CAMERA_KEYS=PASS SAVE_RELOAD=PASS MIXED_COPY_DELETE_RESTORE=ATOMIC REVISION=ONE_WINNER REPLAY=PASS UI_CREATE_DRAG_COPY_DELETE_UNDO_REDO=PASS PNG_WEBM=CANVAS_OWNED_HASHES RENDER_CHARGES=0 BOTH_OUTPUTS=VIDEO_TASK_REUSED EXTRACTED_VIDEO_CLIENT=ACTUAL_HTTP_PG LOST_RESPONSE=ORIGINAL_LOOKUP BATCH=ORIGINAL_BODY CLIENT_POSTS=2 SIMULATED_CREATES=4 PAID_CALLS=0 PAGE_ERRORS=0');
  }catch(error){await writeFile(path.join(out,'browser-diagnostics.json'),JSON.stringify({errors:browserErrors,network},null,2));if(page){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}throw error;}finally{
    if(browser)await browser.close();if(fixture)await fixture.stop();if(listening)await new Promise<void>(r=>router.close(()=>r()));if(pool)await pool.end();
    if(container){
      assert.equal(docker(["inspect","--format",'{{index .Config.Labels "naumi.task"}}',container]),owner);
      await writeFile(path.join(out,"postgres-final-state.json"),docker(["inspect","--format","{{json .State}}",container]));
      const logs=spawnSync("docker",["logs",container],{encoding:"utf8",windowsHide:true});
      await writeFile(path.join(out,"postgres-final.log"),(logs.stdout||"")+(logs.stderr||""));
      docker(["rm","--force",container]);
    }
    await unlink(envFile);
    await writeFile(path.join(out,'CLEANUP.json'),JSON.stringify({status:'PASS',fixtureStopped:true,browserClosed:true,routerClosed:true,poolClosed:true,ownContainerRemoved:container,environmentFileRemoved:true}));
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
