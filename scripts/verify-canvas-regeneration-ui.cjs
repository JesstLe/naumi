// Full local Next CanvasClient; the existing API fixture is started separately.
// node scripts/serve-canvas-unified-dock-fixture.cjs (ports set with env).
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sharp=require('sharp');
const base=process.env.CANVAS_IMAGE_FIXTURE_URL||'http://127.0.0.1:17861';
const baseline=process.argv.includes('--baseline');
const out=path.resolve(process.env.CANVAS_IMAGE_EVIDENCE||'output/canvas-regeneration-ui');fs.mkdirSync(out,{recursive:true});
const sourceRoot=path.resolve(process.env.CANVAS_UI_SOURCE_ROOT||process.cwd());
const serverSourceSnapshot=['src/components/canvas/canvas-client.tsx','src/components/cached-image.tsx','src/lib/browser-image-cache.ts','src/components/canvas/image-reference-composer.tsx','src/components/canvas/generation-placeholder.module.css'].map(relative=>{
  const file=path.join(sourceRoot,relative);return{path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
});
(async()=>{
  const checks=[],errors=[],external=[],requests=[],submissions=[],geometries=[];
  const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1600,height:1100}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const sizes=[[400,225],[225,400],[260,260],[173,109]],ids=['placement-root','placement-second','placement-square','placement-resized'];
  const bytes=new Map();for(const [index,[width,height]]of sizes.entries()){
    const w=width*3,h=height*3;
    bytes.set(`/media/regen-${index}.png`,await sharp({create:{width:w,height:h,channels:3,background:['#7eacbf','#d1b594','#a3beab','#bab4d2'][index]}}).composite([{input:Buffer.from(`<svg width="${w}" height="${h}"><ellipse cx="${w*.5}" cy="${h*.5}" rx="${w*.3}" ry="${h*.32}" fill="#ecdfc8"/><path d="M0 ${h*.8}L${w} ${h*.3}" stroke="#fafafa" stroke-width="${h*.06}"/></svg>`)}]).png().toBuffer());
  }
  let arts,job=null,planRelease,saveRelease,fail=false;
  const pausedPlan=()=>new Promise(r=>{planRelease=r});
  const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  await context.route('**/*',async route=>{
    const r=route.request(),u=new URL(r.url());
    if(!['localhost','127.0.0.1'].includes(u.hostname)&&!['data:','blob:'].includes(u.protocol)){external.push(u.origin);return route.abort();}
    if(u.pathname==='/api/media/image-cache'){
      const sources=r.postDataJSON().sources,account='placement-fixture@example.test';requests.push({type:'manifest',sources});
      return json(route,{account,results:Object.fromEntries(sources.map(source=>{const p=new URL(source,base).pathname,b=bytes.get(p)||bytes.values().next().value;return[source,{source,account,version:crypto.createHash('sha256').update(b).digest('hex'),fetchUrl:source,bytes:b.length,contentType:'image/png'}]}))});
    }
    if(u.pathname.startsWith('/media/regen-')){requests.push({type:'image',url:u.pathname+u.search});return route.fulfill({contentType:'image/png',body:bytes.get(u.pathname)||bytes.values().next().value});}
    if(u.pathname==='/api/account'){
      const response=await route.fetch(),data=await response.json();
      if(!arts)arts=ids.map((id,i)=>({...data.artworks[0],id,title:['横图','竖图','方图','自定尺寸'][i],parentId:i?ids[0]:undefined,parentIds:i?[ids[0]]:[],image:`/media/regen-${i}.png`,width:sizes[i][0]*3,height:sizes[i][1]*3,canvasWidth:sizes[i][0],canvasHeight:sizes[i][1],canvasX:300+i*460,canvasY:500,ratio:i===1?'3:4':'1:1'}));
      return json(route,{...data,artworks:arts});
    }
    if(u.pathname==='/api/canvas/video-nodes'||u.pathname==='/api/canvas/text-nodes')return json(route,{nodes:[],persisted:true});
    if(u.pathname==='/api/artworks/get'){
      if(job?.phase==='done'&&saveRelease===undefined)await new Promise(r=>{saveRelease=r});
      return json(route,{artworks:arts.filter(a=>(u.searchParams.get('ids')||'').split(',').includes(a.id))});
    }
    if(u.pathname==='/api/imagegen/inputs')return json(route,{artworkId:'fixture-upload-'+submissions.length,url:'/media/regen-0.png',width:1200,height:675});
    if(u.pathname==='/api/imagegen/plan'){
      const body=r.postDataJSON();await pausedPlan();return json(route,{request:body,intent:{operation:'edit',background:null,requirements:[],conflicts:[]},steps:[{key:'generate',operation:'edit',credits:0}],warnings:[],confirmationRequired:false,totalCredits:0,billingVersion:1,modelVersion:1});
    }
    if(u.pathname==='/api/imagegen'&&r.method()==='POST'){
      const body=r.postDataJSON();submissions.push(body);job={body,phase:'pending'};
      return json(route,{operationId:body.operationId,jobId:'imagegen-'+body.operationId,status:'pending',stage:'generating',artifacts:[],chargedCredits:0});
    }
    if(u.pathname==='/api/generate-image'&&job){
      if(job.phase==='pending')return json(route,{status:'pending',images:[]});
      const target=arts.find(a=>a.id===job.body.canvasTarget.nodeId);
      if(fail)return json(route,{status:'error',error:'回归模拟失败，保留原图',images:[]});
      return json(route,{status:'done',images:[{id:'fixture-output',url:target.image,width:target.width,height:target.height}],canvasAttachment:{nodeId:target.id,revision:target.canvasImageRevision,applied:true,previousVersionId:'v0',versionId:'v'+target.canvasImageRevision,previousImage:job.previous}});
    }
    return route.continue();
  });
  const waitFor=async test=>{for(let i=0;i<300&&!test();i++)await new Promise(r=>setTimeout(r,30));assert.ok(test(),'fixture boundary reached')};
  const node=id=>page.locator(`.react-flow__node[data-id="${id}"]`);
  const snapshot=id=>node(id).evaluate(n=>({w:n.offsetWidth,h:n.offsetHeight,transform:n.style.transform,edges:[...document.querySelectorAll('.react-flow__edge')].map(e=>e.getAttribute('data-id')).sort(),src:n.querySelector('img')?.getAttribute('src')}));
  try{
    await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:180000});await node(ids[0]).waitFor({timeout:120000});
    await page.waitForFunction(()=>[...document.querySelectorAll('.react-flow__node img')].filter(i=>i.complete&&i.naturalWidth>0).length>=4);
    for(const id of ids){
      const n=node(id);await n.click({position:{x:50,y:55}});await page.getByTestId('generation-submit-action').waitFor();
      const before=await snapshot(id);assert.equal(before.edges.length,3);await n.locator('img').evaluate(i=>{window.originalNodeImage=i});
      planRelease=undefined;saveRelease=undefined;await page.getByTestId('generation-submit-action').click();
      if(baseline){
        await n.getByText('重新生成中…',{exact:true}).waitFor();await waitFor(()=>!!planRelease);
        assert.equal(await n.getByRole('progressbar').count(),0);assert.equal(await n.locator('img').evaluate(i=>i===window.originalNodeImage),true);
        assert.deepEqual({...await snapshot(id),src:undefined},{...before,src:undefined});
        await page.screenshot({path:path.join(out,'baseline-spinner.png')});
        fs.writeFileSync(path.join(out,'UI_BASELINE.json'),JSON.stringify({result:'REPRODUCED',checks:['REAL_ORIGINAL_NODE_HAS_SPINNER_BUT_NO_GENERATION_PROGRESS'],geometry:before,errors,external,serverSourceSnapshot,supplierCalls:0,exit:1},null,2));
        console.log('CANVAS_REGENERATION_UI=REPRODUCED CHECKS=1 FULL_NEXT=1 SUPPLIER_CALLS=0 EXIT=1');process.exitCode=1;return;
      }
      await n.locator('[data-stage=preparing]').waitFor();assert.equal(await n.locator('img').evaluate(i=>i===window.originalNodeImage),true);
      const preparing=await snapshot(id);assert.deepEqual({...preparing,src:undefined},{...before,src:undefined});
      await waitFor(()=>!!planRelease);planRelease();await n.locator('[data-stage=generating]').waitFor();
      assert.equal(await n.getByRole('progressbar').count(),1);assert.equal(await n.getByTestId('canvas-image-quick-cutout').count(),0);
      const generating=await snapshot(id);assert.deepEqual({...generating,src:undefined},{...before,src:undefined});geometries.push({id,before,preparing,generating});
      if(id==='placement-second')await page.screenshot({path:path.join(out,'portrait-regeneration.png')});
      if(id==='placement-root')await page.screenshot({path:path.join(out,'landscape-regeneration.png')});
      const target=arts.find(a=>a.id===id);job.previous=target.image;const next=target.image.replace('.png',`-v${submissions.length}.png`);bytes.set(next,bytes.get(target.image));target.image=next;target.canvasImageRevision=(target.canvasImageRevision||0)+1;job.phase='done';
      await n.locator('[data-stage=saving]').waitFor({timeout:20000});assert.deepEqual({...await snapshot(id),src:undefined},{...before,src:undefined});
      await waitFor(()=>!!saveRelease);saveRelease();await n.getByTestId('regeneration-progress').waitFor({state:'detached',timeout:20000});
      await page.waitForFunction(id=>{const i=document.querySelector(`.react-flow__node[data-id="${id}"] img`);return i?.complete&&i.naturalWidth>0},id);
      assert.deepEqual({...await snapshot(id),src:undefined},{...before,src:undefined});checks.push(id.toUpperCase()+'_REAL_CLICK_PREPARE_GENERATE_SAVE_DONE_GEOMETRY_AND_EDGES_UNCHANGED');
    }
    const id=ids[3],n=node(id),before=await snapshot(id);fail=true;planRelease=undefined;
    await page.getByTestId('generation-submit-action').click();await waitFor(()=>!!planRelease);planRelease();await n.locator('[data-stage=generating]').waitFor();job.phase='error';
    await n.getByRole('alert').waitFor({timeout:20000});assert.equal(await n.getByTestId('regeneration-progress').count(),0);assert.equal((await snapshot(id)).src,before.src);assert.equal(await page.getByTestId('generation-submit-action').getAttribute('aria-label'),'重试');checks.push('FAILED_REGENERATION_RETAINS_ORIGINAL_IMAGE_AND_RETRY');
    await node(ids[1]).click({position:{x:50,y:55}});await page.getByTestId('image-reference-composer').waitFor();
    await page.waitForFunction(()=>{const images=[...document.querySelectorAll('[data-testid=image-reference-composer] img')];return images.length>0&&images.every(i=>i.complete&&i.naturalWidth>0)});
    assert.equal(await page.getByTestId('image-reference-composer').locator('img').count(),1);
    await page.waitForTimeout(350); // Finish the existing dock selection animation before capture.
    await page.screenshot({path:path.join(out,'reference-preview.png')});checks.push('REAL_NODE_REFERENCE_PANEL_USES_DECODED_THUMBNAILS');
    assert.equal(submissions.length,5);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks.push('ONE_SUBMISSION_PER_CLICK_NO_PAGEERRORS_NO_EXTERNAL_NETWORK');
    fs.writeFileSync(path.join(out,'UI_RESULT.json'),JSON.stringify({checks,geometries,submissions,requests,errors,external,serverSourceSnapshot,supplierCalls:0,productionWrites:0},null,2));
    console.log(`CANVAS_REGENERATION_UI=PASS CHECKS=${checks.length} FULL_NEXT=1 GEOMETRIES=4 SUPPLIER_CALLS=0 PAGEERRORS=0`);
  }catch(e){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:e.stack,checks,errors,external,requests,submissions,body:await page.locator('body').innerText().catch(()=>'' )},null,2));throw e;}
  finally{planRelease?.();saveRelease?.();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
