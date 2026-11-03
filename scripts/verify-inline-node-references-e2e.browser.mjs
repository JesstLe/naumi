import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export async function runBrowser({origin,info,out,phase,log}){
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  const contexts=[],pages=[],errors=[],checks=[],network=[];
  const pass=name=>{checks.push(name);log(`PASS ${name}`);};
  const api=async(context,url,data,expected=200)=>{
    const response=await context.request.fetch(origin+url,{method:data===undefined?'GET':'POST',data,headers:{origin,'x-naumi-workspace':info.enterprise,'x-naumi-project-context':info.projectKey}});
    const body=await response.json();assert.equal(response.status(),expected,JSON.stringify(body));return body;
  };
  const getPrompt=async(context,nodeId,projectKey=info.projectKey)=>{
    const response=await context.request.get(`${origin}/api/canvas/image-prompts?projectKey=${encodeURIComponent(projectKey)}&nodeId=${encodeURIComponent(nodeId)}`,{headers:{origin,'x-naumi-workspace':info.enterprise,'x-naumi-project-context':projectKey}});
    const body=await response.json();assert.equal(response.status(),200,JSON.stringify(body));return body;
  };
  const selectImage=async(page,id)=>{
    const node=page.locator(`.react-flow__node[data-id="${id}"]`);await expect(node).toBeVisible();await node.click({position:{x:110,y:110}});
    const prompt=page.getByRole('textbox',{name:'节点提示词',exact:true});await expect(prompt).toBeVisible();await expect(prompt).toHaveAttribute('contenteditable','true');return prompt;
  };
  try{
    for(const email of [info.author,info.recipient]){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});contexts.push(context);
      await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1'&&!['data:','blob:'].includes(u.protocol)){network.push(u.origin);return route.abort();}return route.continue();});
      await api(context,'/api/auth/login',{email,password:info.password});
      const page=await context.newPage();pages.push(page);page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));
    }
    const[a,b]=pages,[ac,bc]=contexts;
    await a.goto(origin+'/canvas?project='+encodeURIComponent(info.projectKey));
    let prompt=await selectImage(a,'e2e-source');
    // Real CanvasClient must pass the expanded state to the layout and shell;
    // a standalone shell fixture cannot prove that production wiring.
    await prompt.fill(Array.from({length:50},(_,i)=>`第${i+1}行，保持商品与文字，仅调整参考构图。`).join('\n'));
    const dock=a.getByTestId('image-node-dock'), viewportBefore=await a.locator('.react-flow__viewport').getAttribute('style');
    const sourceBefore=await a.locator('.react-flow__node[data-id="e2e-source"]').getAttribute('style');
    const collapsedHeight=(await dock.boundingBox()).height;
    await dock.getByRole('button',{name:'展开输入区',exact:true}).click();
    await expect.poll(async()=>(await dock.boundingBox()).height).toBeGreaterThan(collapsedHeight+100);
    assert.equal(await a.locator('.react-flow__viewport').getAttribute('style'),viewportBefore);
    assert.equal(await a.locator('.react-flow__node[data-id="e2e-source"]').getAttribute('style'),sourceBefore);
    const scrollOwners=await dock.evaluate(el=>[el,...el.querySelectorAll('*')].filter(n=>/auto|scroll/.test(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+2).map(n=>n.hasAttribute('data-composer-body')));
    assert.deepEqual(scrollOwners,[true]);
    await dock.getByRole('button',{name:'收起输入区',exact:true}).click();
    await expect.poll(async()=>(await dock.boundingBox()).height).toBeLessThanOrEqual(collapsedHeight+2);
    assert.equal(await a.locator('.react-flow__viewport').getAttribute('style'),viewportBefore);
    pass('Actual Canvas expansion grows editor with one body scroller and never changes node coordinates or viewport zoom');
    await prompt.fill('保留@');await a.getByRole('listbox').getByRole('option').first().click();
    await expect.poll(async()=>(await getPrompt(ac,'e2e-source')).document?.prompt).toBe('保留【图1】');
    const chips=prompt.locator('[data-reference-key], [data-inline-reference-key], [data-mention-key]');
    assert.ok(await chips.count()>0,'inline chip DOM must retain identity');
    pass('Full Canvas inline chip enters original compiled token and persists via real auth/PG route');
    await a.getByTestId('image-node-dock').locator('input[type=file]').setInputFiles(path.join(out,'paste.png'));
    await expect.poll(async()=>(await getPrompt(ac,'e2e-source')).document?.additionalKeys?.length).toBe(1);
    const uploaded=(await getPrompt(ac,'e2e-source')).document.additionalKeys[0].slice(5);
    await expect(a.getByTestId('image-node-dock').locator('[data-reference-number]')).toHaveCount(2);
    await prompt.press('End');await prompt.pressSequentially('，背景参考@');
    await a.getByRole('listbox').getByRole('option').last().click();
    await expect.poll(async()=>(await getPrompt(ac,'e2e-source')).document?.prompt).toBe('保留【图1】，背景参考【图2】');
    pass('Native 64MiB-capable upload path registers real owned source and binds reference without generation');
    await a.evaluate(()=>sessionStorage.clear());await a.reload();prompt=await selectImage(a,'e2e-source');
    await expect(prompt).toContainText('背景参考');await expect(a.getByTestId('image-node-dock').locator('[data-reference-number]')).toHaveCount(2);
    const restored=await getPrompt(ac,'e2e-source');assert.equal(restored.document.bindings.find(row=>row.number===2).key,`node:${uploaded}`);
    pass('Fresh tab cache restores prompt, stable numbers, roles and uploaded reference from server');
    const copied=await api(ac,'/api/canvas/nodes/copy',{ids:['e2e-source'],projectKey:info.projectKey,operationId:randomUUID(),detached:true});
    const copyId=copied.idMap['e2e-source'];assert.ok(copyId);
    await api(ac,'/api/artworks/position',{id:copyId,x:130,y:540});
    const copy=await getPrompt(ac,copyId);assert.equal(copy.document.prompt,restored.document.prompt);assert.equal(copy.document.bindings.find(row=>row.number===1).key,`node:${copyId}`);assert.equal(copy.document.bindings.find(row=>row.number===2).key,`node:${uploaded}`);
    const replay=await api(ac,'/api/canvas/image-prompts',{projectKey:info.projectKey,nodeId:copyId,expectedRevision:copy.revision,operationId:randomUUID(),document:{...copy.document,prompt:'副本独立【图2】'}});
    assert.equal(replay.document.prompt,'副本独立【图2】');assert.equal((await getPrompt(ac,'e2e-source')).document.prompt,restored.document.prompt);
    pass('Detached native node copy remaps self ID and retains explicit source; edit does not change original');
    await a.reload();prompt=await selectImage(a,'e2e-source');
    await prompt.press('End');await prompt.pressSequentially('，即刻分享');
    await a.getByRole('button',{name:'发送画布',exact:true}).click();
    await expect.poll(async()=>(await getPrompt(ac,'e2e-source')).document?.prompt).toContain('即刻分享');
    await a.getByLabel('分享接收成员').selectOption(info.recipient);await a.getByRole('button',{name:'发送分享卡片',exact:true}).click();
    await expect.poll(async()=>(await api(ac,`/api/collaboration/shares?enterpriseId=${info.enterprise}&direction=sent`)).items.length).toBe(1);
    const shares=await api(ac,`/api/collaboration/shares?enterpriseId=${info.enterprise}&direction=sent`);const share=shares.items[0];assert.ok(share);
    const requested=await api(bc,`/api/collaboration/shares/${share.id}?enterpriseId=${info.enterprise}`,{action:'request',operationId:randomUUID(),expectedVersion:share.version});
    const r=requested.share||requested;
    const approved=await api(ac,`/api/collaboration/shares/${share.id}?enterpriseId=${info.enterprise}`,{action:'approve',operationId:randomUUID(),expectedVersion:r.version});
    const recipientShare=(await api(bc,`/api/collaboration/shares/${share.id}?enterpriseId=${info.enterprise}`)).share;
    assert.ok(recipientShare.resultProjectKey);const projectKey=recipientShare.resultProjectKey;
    const artworks=(await api(bc,`/api/account?email=${encodeURIComponent(info.recipient)}`)).artworks;
    const recipientNode=artworks.find(art=>art.title==='产品视觉');assert.ok(recipientNode);
    const recipientPrompt=await getPrompt(bc,recipientNode.id,projectKey);assert.match(recipientPrompt.document.prompt,/即刻分享/);
    assert.ok(recipientPrompt.document.bindings.every(binding=>!['node:e2e-source',`node:${uploaded}`].includes(binding.key)));
    await b.goto(origin+'/canvas?project='+encodeURIComponent(projectKey));const received=await selectImage(b,recipientNode.id);await expect(received).toContainText('即刻分享');
    await received.press('End');await received.pressSequentially('，接收者修改');await expect.poll(async()=>(await getPrompt(bc,recipientNode.id,projectKey)).document?.prompt).toContain('接收者修改');
    assert.ok(!(await getPrompt(ac,'e2e-source')).document.prompt.includes('接收者修改'));
    await b.reload();await selectImage(b,recipientNode.id);await expect(b.getByRole('textbox',{name:'节点提示词',exact:true})).toContainText('接收者修改');
    pass('Share action flushes latest text; approval remaps all reference identities; recipient independently edits and reloads full Canvas');
    for(const page of [a,b]){
      await expect.poll(()=>page.getByRole('textbox',{name:'节点提示词',exact:true}).locator('[data-reference-key] img').evaluateAll(images=>images.length>=2&&images.every(image=>image.complete&&image.naturalWidth>0)),{timeout:20000}).toBe(true);
      assert.equal(await page.getByRole('textbox',{name:'节点提示词',exact:true}).locator('[data-reference-key] img[src*="/_next/image"]').count(),0);
    }
    pass('Private source and copied reference thumbnails decode through authorized browser image leases');
    if(await a.getByRole('button',{name:'收起聊天',exact:true}).count())await a.getByRole('button',{name:'收起聊天',exact:true}).click();
    await a.getByTestId('image-reference-composer').screenshot({path:path.join(out,'inline-reference-composer.png')});
    await a.screenshot({path:path.join(out,'inline-references-source.png')});await b.screenshot({path:path.join(out,'inline-references-recipient.png')});
    const evidence=await fetch(origin+'/__fixture/checks').then(response=>response.json());assert.equal(evidence.supplierCalls,0);assert.equal(evidence.ledger,0);assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    await writeFile(path.join(out,'http-evidence.json'),JSON.stringify(evidence,null,2));
    log(`INLINE_REFERENCES_E2E=PASS checks=${checks.length} full_canvas=1 real_auth=1 real_pg=1 suppliers=0`);return{checks,errors,network};
  }finally{
    for(let n=0;n<pages.length;n++){await pages[n].screenshot({path:path.join(out,`final-${n}.png`)}).catch(()=>{});await writeFile(path.join(out,`final-${n}.txt`),await pages[n].locator('body').innerText().catch(()=>''));}
    await writeFile(path.join(out,'browser-result.json'),JSON.stringify({checks,errors,network},null,2));
    for(const context of contexts)await context.close();await browser.close();log('INLINE_BROWSER_CLEANUP=PASS contexts=2 browser_closed=1');
  }
}
