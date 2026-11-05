// Complete Next CanvasClient + real browser. Auth/API/media are isolated loopback
// fixtures; no real supplier requests or production database changes.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), crypto = require('node:crypto'), sharp = require('sharp');
const {createImagePromptFixture}=require('./canvas-image-prompt-fixture.cjs');
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const sourceRoot=path.resolve(arg('--source-root',path.join(__dirname,'..'))),baseline=args.includes('--baseline'),port=Number(arg('--port','15381')),base='http://127.0.0.1:'+port;
const cp=require('node:child_process'),net=require('node:net');
const out=path.resolve(arg('--output-root',process.env.CANVAS_THEME_MATRIX_EVIDENCE||'output/canvas-theme-matrix'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
fs.mkdirSync(out, { recursive: true });
const sourceFiles=['src/app/layout.tsx','src/app/globals.css','src/components/canvas/canvas-client.tsx','src/components/ui/surface-appearance.tsx','src/lib/canvas/appearance.ts','src/components/canvas/composer-shell.tsx','src/components/canvas/composer-shell.module.css','src/components/canvas/prompt-optimizer.tsx','src/components/canvas/image-version-control.tsx','src/components/canvas/text-image-generation-dialog.tsx','src/components/canvas/frame-ratio-dialog.tsx','src/components/canvas/canvas-help-dialog.tsx','src/components/canvas/group-layer.module.css','src/components/canvas/generation-placeholder.module.css','src/components/canvas/imagegen-pending-recovery.tsx','src/components/ui/text-model-select.tsx','src/components/ui/select-menu.tsx','src/components/ui/image-quality-select.tsx','src/components/tools/feature-model-select.tsx'];
function sourceHashes(){return sourceFiles.map(file=>({file:path.join(sourceRoot,file),sha256:fs.existsSync(path.join(sourceRoot,file))?crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceRoot,file))).digest('hex'):null}));}
sourceFiles.push('src/components/canvas/use-canvas-view-controls.ts','src/components/canvas/use-canvas-viewport-focus.ts','src/components/canvas/image-composer.tsx','src/components/canvas/image-generation-controls.tsx','src/components/canvas/text-composer.tsx','src/components/canvas/image-import-status.tsx','src/components/canvas/nodes/artwork-node.tsx','src/components/canvas/nodes/text-node.tsx');
sourceFiles.push('scripts/canvas-image-prompt-fixture.cjs','scripts/canvas-mapping-ui-fixture.cjs');
const sourceAtStart=sourceHashes();


async function startFixture(){
  for(const p of [port,port+1])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(p,'127.0.0.1',()=>s.close(resolve));});
  const fixturePath=path.join(sourceRoot,'scripts/serve-canvas-regeneration-fixture.cjs');
  let fixture=fs.readFileSync(fixturePath,'utf8');
  // Alter only the test proxy; never rewrite the product app. Keep project entry,
  // but do not force a light canvas on every HTML request.
  const forced="localStorage.setItem('nv:canvas:bg','light');";
  assert.ok(fixture.includes(forced),'known local fixture theme injection');
  const injectionStart=fixture.indexOf("if(headers['content-type']?.includes('text/html'))");
  const injectionEnd=fixture.indexOf('res.writeHead(r.statusCode',injectionStart);
  assert.ok(injectionStart>0&&injectionEnd>injectionStart);
  fixture=fixture.slice(0,injectionStart)+fixture.slice(injectionEnd);
  fixture=fixture.replaceAll('.next-canvas-regeneration','.next-theme-matrix');
  const entry=path.join(out,'runtime-fixture.cjs');fs.writeFileSync(entry,fixture);
  const tsconfig=path.join(sourceRoot,'tsconfig.json'),tsBefore=fs.readFileSync(tsconfig);
  const original=JSON.parse(tsBefore.toString());
  const env={...process.env,CANVAS_REGEN_PORT:String(port),NODE_ENV:'development',NODE_OPTIONS:'--max-old-space-size=3072',NEXT_TELEMETRY_DISABLED:'1'};
  const app=cp.spawn(process.execPath,[entry],{cwd:sourceRoot,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const log=fs.createWriteStream(path.join(out,'runtime.log'));app.stdout.pipe(log);app.stderr.pipe(log);
  const started=Date.now();
  while(true){try{const response=await fetch('http://127.0.0.1:'+(port+1)+'/canvas',{signal:AbortSignal.timeout(45000)});if(response.ok){await response.arrayBuffer();break;}}catch{}if(app.exitCode!==null||Date.now()-started>180000)throw Error('LOCAL_NEXT_FIXTURE_DID_NOT_START');await delay(100);}
  return {pid:app.pid,async stop(){
    if(process.platform==='win32')cp.spawnSync('taskkill',['/PID',String(app.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else app.kill('SIGTERM');
    await new Promise(resolve=>log.end(resolve));
    const after=JSON.parse(fs.readFileSync(tsconfig,'utf8'));const clean={...after,include:after.include?.filter(value=>value!=='.next-theme-matrix/types/**/*.ts')};
    const normalized={...original,include:[...original.include].sort()},cleanNormalized={...clean,include:[...clean.include].sort()};
    if(JSON.stringify(normalized)===JSON.stringify(cleanNormalized))fs.writeFileSync(tsconfig,tsBefore);
    else fs.writeFileSync(path.join(out,'tsconfig-not-restored.txt'),'Concurrent or unexpected tsconfig edits retained.');
  }};
}

(async () => {
  const runtime=await startFixture();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  // These accessibility assertions describe the Chinese UI, not the host OS.
  // Use real browser/SSR locale inputs; do not replace the product translator.
  const context = await browser.newContext({ viewport: { width: 1800, height: 1200 }, locale: 'zh-CN' });
  await context.addCookies([{ name: 'naumi_locale', value: 'zh', url: base }]);
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const checks = [], errors = [], external = [], requests = [], groups = [], history = [], optimizations = [], textGenerations = [], textWrites = [];
  const rootId = 'regeneration-root', otherId = 'reference-neighbor', textId = 'text-feedback';
  const account = 'regeneration-ui@example.test';
  const originalPrompt = '保留瓶身和标签，使用浅色自然光。';
  const optimizedPrompt = '保留瓶身轮廓与标签文字，浅色背景搭配柔和自然光，呈现清晰细节。';
  const writePrompt = '为这款营养品写一句简洁文案';
  const written = '每日一份轻盈营养，陪伴自在生活。';
  const now = new Date().toISOString();
  const pixels = await sharp({ create: { width: 768, height: 1024, channels: 3, background: '#e4ede7' } }).composite([{ input: Buffer.from('<svg width="768" height="1024"><rect x="245" y="295" width="278" height="470" rx="50" fill="#fffdf4"/><rect x="275" y="222" width="218" height="100" rx="14" fill="#6e9180"/><rect x="246" y="450" width="276" height="210" fill="#d1dfd3"/><circle cx="384" cy="550" r="69" fill="#567d68"/><text x="384" y="574" font-size="68" text-anchor="middle" fill="white">N</text><path d="M285 701H483" stroke="#a5b9aa" stroke-width="8"/></svg>') }]).png().toBuffer();
  const version = crypto.createHash('sha256').update(pixels).digest('hex');
  fs.writeFileSync(path.join(out, 'fixture-product.png'), pixels);
  let arts, user, textFail = true, ocrCatalogDone = true;
  let texts = [{ id: textId, projectKey: 'tree:' + rootId, title: '品牌文案', prompt: writePrompt, content: '给每一天，恰到好处的营养。', status: 'completed', sourceIds: [], targetIds: [], productIds: [], canvasX: 950, canvasY: 160, width: 330, height: 230, createdAt: now, updatedAt: now }];
  const model = { id: 'gpt-image-2', label: '图片模型', modality: 'image', supportsEdit: true, qualities: ['medium'], nativeResolutions: ['1K'], generationParameters: { ratios: ['auto', '1:1', '3:4', '16:9'], resolutions: ['1K'] }, qualitySupported: true };
  const textModel = { id: 'published-text', label: '文字模型', modality: 'text', supportsVision: true };
  const promptFixtureState={promptRequests:[]};
  const imagePromptFixture=createImagePromptFixture({getArtworks:()=>arts||[],state:promptFixtureState});
  const generationFixtureState={requests:[],preAck:null,postAck:null,receiptStatus:null};
  let generationAckGate=null;
  page.on('pageerror', e => errors.push(e.message));
  const lifecycle=[];const observe=event=>{if(lifecycle.length<256)lifecycle.push({time:new Date().toISOString(),...event});};
  page.on('crash',()=>observe({kind:'page-crash',url:page.url()}));
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())observe({kind:'navigation',url:frame.url()});});
  page.on('requestfailed',request=>{const pathname=new URL(request.url()).pathname;if(request.isNavigationRequest()||pathname.startsWith('/_next/'))observe({kind:'request-failed',pathname,navigation:request.isNavigationRequest(),failure:request.failure()});});
  page.on('response',response=>{if(response.request().isNavigationRequest())observe({kind:'navigation-response',url:response.url(),status:response.status(),contentType:response.headers()['content-type']});});
  const hydration=[];page.on('console',message=>{if(message.type()==='error'&&/hydrat|didn.t match|server rendered/i.test(message.text()))hydration.push(message.text());});
  const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['blob:', 'data:'].includes(u.protocol)) { external.push(u.origin); return route.abort(); }
    if (p === '/api/account') {
      const response = await route.fetch(), data = await response.json(); user = data.user;
      arts ||= [{ ...data.artworks[0], id: rootId, title: '营养品原图', prompt: originalPrompt, image: '/media/feedback-original.png', width: 768, height: 1024, canvasWidth: 264, canvasHeight: 352, canvasX: 100, canvasY: 150, parentId: undefined, parentIds: [], canvasGroupId: null },
        { ...data.artworks[0], id: otherId, title: '参考构图', prompt: originalPrompt, image: '/media/feedback-reference.png', width: 768, height: 1024, canvasWidth: 264, canvasHeight: 352, canvasX: 510, canvasY: 150, parentId: rootId, parentIds: [rootId], source: 'generate', canvasGroupId: null }];
      return json(route, { ...data, artworks: arts });
    }
    if (p === '/api/canvas/image-prompts') {
      const receipt=await imagePromptFixture.request(req.method(),req.method()==='GET'?Object.fromEntries(u.searchParams):req.postDataJSON());
      return json(route,receipt.body,receipt.status);
    }
    if (p === '/api/imagegen' && req.method() === 'POST') {
      generationFixtureState.requests.push({body:req.postDataJSON(),operationId:req.headers()['x-naumi-billing-operation-id']});
      if(generationAckGate&&await generationAckGate.promise==='abort')return route.abort();
      return route.continue();
    }
    if (p === '/api/canvas/text-nodes') {
      if (req.method() === 'POST') { const body = req.postDataJSON(); textWrites.push(body); const list = body.nodes || [body]; for (const item of list) { const at = texts.findIndex(n => n.id === item.id); if (at >= 0) texts[at] = { ...texts[at], ...item }; else texts.push(item); } return json(route, { node: texts.find(n => n.id === body.id), nodes: texts, persisted: true }); }
      return json(route, { nodes: texts, persisted: true });
    }
    if (['/api/canvas/video-nodes', '/api/canvas/director-nodes', '/api/canvas/character-nodes', '/api/canvas/scene-nodes', '/api/canvas/audio-nodes', '/api/canvas/timeline-nodes'].includes(p)) return json(route, { nodes: [], persisted: true });
    if (p === '/api/models') {
      const feature = u.searchParams.get('feature'), text = ['canvas.ocr', 'canvas.text-generate', 'canvas.assistant'].includes(feature);
      return json(route, { managed: true, supported: true, available: true, feature, version: 152, models: [text ? textModel : model], defaultModelId: text ? textModel.id : model.id });
    }
    if (p === '/api/billing/catalog') { const response = await route.fetch(), data = await response.json(); for (const feature of ['canvas.ocr', 'canvas.text-edit', 'canvas.text-generate']) data.features[feature] = { label: feature, enabled: true, unit: 'image', prices: { medium: { '1K': 0 } } }; return json(route, data); }
    if (p === '/api/billing/quote') {
      const body = req.postDataJSON(); requests.push({ path: p, body, model: req.headers()['x-naumi-feature-model'], ocrCatalogDone });
      if (body.feature === 'canvas.ocr') { assert.equal(ocrCatalogDone, true); assert.equal(body.modelId, textModel.id); }
      return json(route, { ...body, modelId: body.modelId || textModel.id, credits: 0, reserveCredits: 0, version: 1, modelVersion: 152, quote: { id: 'fixture-q-' + requests.length } });
    }
    if (p === '/api/canvas/text-generate') {
      const body = req.postDataJSON(); textGenerations.push(body);
      return textFail ? json(route, { error: '文字回复未完整返回，请稍后重试', code: 'TEXT_OUTPUT_LIMIT' }, 502) : json(route, { text: written, model: textModel.id });
    }
    if (p === '/api/prompt-assist') { const body = req.postDataJSON(); optimizations.push({ body, model: req.headers()['x-naumi-feature-model'] }); return json(route, { prompt: body.tool === 'canvas-text' ? '写一句突出轻盈营养、简洁自然的品牌文案。' : optimizedPrompt }); }
    if (p === '/api/canvas/ocr') { requests.push({ path: p, model: req.headers()['x-naumi-feature-model'], ocrCatalogDone }); assert.equal(ocrCatalogDone, true); assert.equal(req.headers()['x-naumi-feature-model'], textModel.id); return json(route, { engine: 'fixture-vision', image: { width: 768, height: 1024 }, segments: [{ id: 'ocr-line', text: 'N', confidence: .99, box: { x: 352, y: 504, width: 68, height: 80 } }] }); }
    if (p === '/api/media/image-cache') { const sources = req.postDataJSON().sources; return json(route, { account, results: Object.fromEntries(sources.map(source => [source, { source, account, version, fetchUrl: source, bytes: pixels.length, contentType: 'image/png' }])) }); }
    if (p.startsWith('/media/feedback-')) return route.fulfill({ contentType: 'image/png', body: pixels });
    if (p === '/api/download' && u.searchParams.get('u')?.includes('/media/feedback-')) return route.fulfill({ contentType: 'image/png', body: pixels });
    if (p === '/api/artworks/get') return json(route, { artworks: arts.filter(a => (u.searchParams.get('ids') || '').split(',').includes(a.id)) });
    if (p === '/api/canvas/groups') { const body = req.postDataJSON(); const assignments = body.assignments || body.ids.map(id => ({ id, canvasGroupId: body.action === 'group' ? 'feedback-persistent-group' : null })); groups.push({ body, assignments }); for (const item of assignments) Object.assign(arts.find(a => a.id === item.id), item); return json(route, { ok: true, persisted: true, assignments }); }
    if (p === '/api/canvas/history') { const body = req.postDataJSON(); history.push(body); for (const op of body.operations || []) { const a = arts.find(a => a.id === op.id); if (a && op.type === 'position') { a.canvasX = op.x; a.canvasY = op.y; } } return json(route, { ok: true, persisted: true }); }
    if (p === '/api/artworks/position') { const body = req.postDataJSON(); Object.assign(arts.find(a => a.id === body.id), { canvasX: body.x, canvasY: body.y }); return json(route, { ok: true }); }
    return route.continue();
  });
  const node = id => page.locator(`.react-flow__node[data-id="${id}"]`);
  const select = async id => { await node(id).click({ position: { x: 100, y: 80 } }); };
  const empty=async()=>{await page.locator('.react-flow__pane').click({position:{x:1300,y:850}});};
  const check = name => { checks.push(name); console.log('CHECK=' + name); };


  const samples=[],violations=[],contrasts=[];
  function verify(condition,name,details={}){checks.push({name,pass:!!condition,...details});if(!condition)violations.push({name,...details});}
  const appearance=async locator=>locator.evaluate(el=>{const s=getComputedStyle(el);let p=el,background=[];while(p){const c=getComputedStyle(p);background.push({tag:p.tagName,className:typeof p.className==='string'?p.className:'',background:c.backgroundColor});p=p.parentElement;}return {tag:el.tagName,text:el.textContent?.trim().slice(0,80),className:el.className,color:s.color,background:s.backgroundColor,border:s.borderColor,outline:s.outlineColor,outlineStyle:s.outlineStyle,opacity:s.opacity,canvasPanel:s.getPropertyValue('--canvas-ui-panel-solid').trim(),canvasText:s.getPropertyValue('--canvas-ui-text').trim(),globalText:s.getPropertyValue('--c-text2').trim(),backgrounds:background};});
  const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
  function lum(c){const s=c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return s[0]*.2126+s[1]*.7152+s[2]*.0722;}
  function composite(f,b){const alpha=f[3]??1;return f.slice(0,3).map((v,i)=>v*alpha+b[i]*(1-alpha));}
  function effective(sample){let color=[255,255,255];for(const bg of [...sample.backgrounds].reverse()){const c=rgb(bg.background);if(c.length>=3)color=composite(c,color);}return color;}
  function contrast(sample,bg){const a=lum(rgb(sample.color)),b=lum(bg||effective(sample));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
  function readable(name,sample,bg){const ratio=contrast(sample,bg);contrasts.push({name,ratio,color:sample.color,background:bg||effective(sample)});verify(ratio>=4.5,name,{contrast:ratio});}
  function surface(name,sample,canvas){verify(canvas==='dark'?lum(effective(sample))<.15:lum(effective(sample))>.6,name,{color:sample.color,background:effective(sample),canvas});}
  async function theme(app,canvas){await page.evaluate(value=>{document.documentElement.classList.toggle('dark',value==='dark');localStorage.setItem('theme',value);window.dispatchEvent(new Event('naumi:theme-change'));},app);const desired=canvas==='dark'?'切换深色画布':'切换浅色画布';if(await page.getByRole('button',{name:desired,exact:true}).count())await page.getByRole('button',{name:desired,exact:true}).click();await page.waitForTimeout(80);}
  const closeDialog=async label=>{await page.getByRole('dialog',{name:label,exact:true}).getByRole('button',{name:/关闭|取消/}).first().click();};
  async function snapshot(name){await page.screenshot({path:path.join(out,name+'.png')});}
  async function capture(app,canvas){
    const key=app+'-app-'+canvas+'-canvas';await theme(app,canvas);await select(rootId);await expect(page.getByTestId('image-node-dock')).toBeVisible();
    const imageDock=page.getByTestId('image-node-dock');const result={app,canvas,imageDock:await appearance(imageDock)};
    surface(key+'_IMAGE_DOCK',result.imageDock,canvas);readable(key+'_IMAGE_DOCK_TEXT',result.imageDock);
    const arrow=imageDock.getByTestId('generation-submit-action');await arrow.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(arrow).toBeFocused();const focused=await appearance(arrow);verify(focused.outlineStyle!=='none',key+'_GENERATE_FOCUS_VISIBLE');
    await page.getByTestId('canvas-prompt-optimize').click();await expect(page.getByRole('textbox',{name:'优化预览',exact:true})).toBeVisible();
    result.optimize=await appearance(page.getByRole('dialog',{name:'提示词优化',exact:true}));surface(key+'_OPTIMIZER_PORTAL',result.optimize,canvas);readable(key+'_OPTIMIZER_TEXT',result.optimize);
    await snapshot(key+'-optimizer');await page.getByRole('button',{name:'取消',exact:true}).click();
    await imageDock.getByTestId('image-version-control').click();const historyDialog=page.getByRole('dialog',{name:'图片历史版本',exact:true});await historyDialog.waitFor();
    result.history=await appearance(historyDialog);surface(key+'_HISTORY_PORTAL',result.history,canvas);readable(key+'_HISTORY_TEXT',result.history);await page.getByRole('button',{name:'关闭历史版本',exact:true}).click();
    await imageDock.getByRole('button',{name:'更多图片参数',exact:true}).click();const settings=page.getByRole('dialog',{name:'更多图片参数',exact:true});await settings.waitFor();surface(key+'_MORE_OPTIONS',await appearance(settings),canvas);await page.getByRole('button',{name:'关闭设置',exact:true}).click();
    await select(textId);const dock=page.getByTestId('text-node-dock');await expect(dock).toBeVisible();result.textDock=await appearance(dock);surface(key+'_TEXT_DOCK',result.textDock,canvas);
    await dock.getByRole('tab',{name:'AI 写作',exact:true}).click();
    const textModel=dock.locator('button[title^="文字模型："]').first();result.textModel=await appearance(textModel);readable(key+'_TEXT_MODEL_CONTRAST',result.textModel);
    await textModel.hover();await page.waitForTimeout(180);readable(key+'_TEXT_MODEL_HOVER',await appearance(textModel));await textModel.click();
    const textOption=page.getByRole('button',{name:'文字模型',exact:true}).last();if(await textOption.count()){readable(key+'_TEXT_MODEL_OPTION',await appearance(textOption));await textOption.click();}else await page.keyboard.press('Escape');
    await snapshot(key+'-text');
    await dock.getByRole('button',{name:'生成图片',exact:true}).click();const generateDialog=page.getByTestId('text-image-generation-dialog');await expect(generateDialog).toBeVisible();surface(key+'_TEXT_IMAGE_DIALOG',await appearance(generateDialog),canvas);await generateDialog.getByRole('button',{name:'取消',exact:true}).click();
    const assistant=page.getByRole('complementary',{name:'画布 Agent',exact:true});const combo=assistant.getByRole('combobox',{name:'文字模型',exact:true});await combo.click();const menu=page.getByRole('listbox',{name:'文字模型',exact:true});await menu.waitFor();surface(key+'_AGENT_MODEL_PORTAL',await appearance(menu),canvas);readable(key+'_AGENT_MODEL_TEXT',await appearance(menu));await page.keyboard.press('Escape');
    // Blank node uses the same composer, not a fabricated CSS-only demo.
    await page.locator('[data-tool="image-node"]').click();await expect(page.getByTestId('pending-node-dock')).toBeVisible();surface(key+'_EMPTY_IMAGE_DOCK',await appearance(page.getByTestId('pending-node-dock')),canvas);await empty();
    if(app==='light'){await empty();await page.locator('[data-tool="more"]').click();await page.getByTestId('canvas-more-tools-menu').getByRole('menuitem',{name:/快捷键/}).click();const help=page.getByTestId('canvas-help-dialog');await help.waitFor();surface(key+'_HELP_DIALOG',await appearance(help),canvas);await help.getByRole('textbox').fill('撤销');verify(await help.innerText().then(value=>value.includes('撤销')),key+'_HELP_SEARCH');await page.keyboard.press('Escape');await expect(help).toHaveCount(0);verify(true,key+'_HELP_ESCAPE');}
    await page.reload({waitUntil:'domcontentloaded'});await node(rootId).waitFor();await page.waitForTimeout(200);
    verify(await page.getByRole('button',{name:canvas==='dark'?'切换浅色画布':'切换深色画布',exact:true}).count()===1,key+'_CANVAS_THEME_RELOAD');
    verify(await page.locator('html').evaluate(el=>el.classList.contains('dark'))===(app==='dark'),key+'_APP_THEME_RELOAD');
    samples.push(result);console.log('SAMPLE='+app+'/'+canvas);
  }
  try {
    await context.addInitScript(()=>{if(!localStorage.getItem('nv:canvas:last'))localStorage.setItem('nv:canvas:last','tree:regeneration-root');});
    await page.goto(base+'/canvas',{waitUntil:'domcontentloaded',timeout:180000});await node(rootId).waitFor({timeout:120000});await node(textId).waitFor();
    await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');check('EXPLICIT_CHINESE_BROWSER_AND_SSR_LOCALE');
    await page.waitForFunction(()=>[...document.querySelectorAll('.react-flow__node img')].filter(i=>i.complete&&i.naturalWidth>0).length>=2);
    await capture('light','light');await capture('light','dark');await capture('dark','light');await capture('dark','dark');
    // Real first OCR action, with actual feature selector portal.
    await select(rootId);await page.getByRole('button',{name:'更多处理',exact:true}).click();const ocrAction=page.locator('[role="menuitem"][data-action="edit-text"]');await expect(ocrAction).toContainText('编辑图中文字');await ocrAction.click();await expect(page.getByRole('textbox',{name:'修改文字 1',exact:true})).toHaveValue('N');
    await page.getByRole('combobox',{name:'执行模型',exact:true}).click();let menu=page.getByRole('listbox',{name:'执行模型',exact:true});await menu.waitFor();surface('OCR_EXECUTION_MODEL_PORTAL_DARK',await appearance(menu),'dark');readable('OCR_EXECUTION_MODEL_TEXT',await appearance(menu));await page.keyboard.press('Escape');await snapshot('dark-ocr');
    await page.reload({waitUntil:'domcontentloaded'});await node(rootId).waitFor();
    verify(await page.getByRole('button',{name:'切换浅色画布',exact:true}).count()===1,'DARK_CANVAS_PREFERENCE_SURVIVES_RELOAD');verify(await page.locator('html').evaluate(el=>el.classList.contains('dark')),'DARK_APP_PREFERENCE_SURVIVES_RELOAD');
    // Capture and measure the four previously confirmed readability defects.
    await select(textId);const dock=page.getByTestId('text-node-dock');await dock.getByRole('tab',{name:'AI 写作',exact:true}).click();const instruction=dock.getByRole('textbox',{name:'AI 写作要求',exact:true});await instruction.fill('主题故障态检查');await instruction.press('Control+Enter');await expect(node(textId).getByRole('alert')).toBeVisible();
    const failure={text:await appearance(node(textId).getByRole('alert')),card:await appearance(node(textId).locator('.canvas-ui-node-card').first())};readable('TEXT_FAILURE_CONTRAST',failure.text);await snapshot('dark-text-error');
    await page.reload({waitUntil:'domcontentloaded'});await node(rootId).waitFor();await theme('dark','dark');await select(rootId);await node(otherId).click({position:{x:100,y:80},modifiers:['Shift']});await page.getByTestId('image-batch-bar').getByRole('button',{name:'成组',exact:true}).click();
    const frame=page.getByTestId('canvas-group-frame');await frame.waitFor();const group={selected:await appearance(frame),title:await appearance(node(rootId).locator('.art-title').first())};surface('GROUP_SELECTED_SURFACE',group.selected,'dark');readable('GROUP_SELECTED_TITLE_CONTRAST',group.title,effective(group.selected));await snapshot('dark-group-selected');await empty();group.unselected=await appearance(frame);readable('GROUP_UNSELECTED_TITLE_CONTRAST',await appearance(node(rootId).locator('.art-title').first()),effective(group.unselected));await snapshot('dark-group-persistent');
    await page.getByRole('button',{name:'选择分组（2 张图片）',exact:true}).click();await page.getByTestId('image-batch-bar').getByRole('button',{name:'解组',exact:true}).click();await empty();await select(rootId);
    // The standard action releases after its original receipt, while the job
    // continues in the background. Measure the existing disabled contract in
    // the actual pre-ACK window instead of racing an already received ACK.
    let settleAck;generationAckGate={promise:new Promise(resolve=>{settleAck=resolve;}),release:()=>settleAck('continue'),cancel:()=>settleAck('abort')};
    await page.getByTestId('generation-submit-action').click();
    const generating=page.getByTestId('generation-placeholder');await Promise.all([generating.waitFor(),expect.poll(()=>generationFixtureState.requests.length,{timeout:30000}).toBe(1)]);const regeneration={text:await appearance(generating),overlay:await appearance(generating.locator('..'))};surface('REGENERATION_OVERLAY_SURFACE',regeneration.overlay,'dark');readable('REGENERATION_TITLE_CONTRAST',regeneration.text);verify(await page.getByTestId('generation-submit-action').isDisabled(),'GENERATING_ACTION_DISABLED');await snapshot('dark-regeneration');
    generationFixtureState.preAck=await (await fetch(base+'/__fixture/state')).json();assert.equal(generationFixtureState.preAck.submissions.length,0);
    const originalReceipt=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/imagegen'&&response.request().method()==='POST');
    generationAckGate.release();const accepted=await originalReceipt;generationFixtureState.receiptStatus=accepted.status();assert.equal(accepted.status(),200);
    await expect(page.getByTestId('generation-submit-action')).toBeEnabled();
    generationFixtureState.postAck=await (await fetch(base+'/__fixture/state')).json();assert.equal(generationFixtureState.requests.length,1);assert.equal(generationFixtureState.postAck.submissions.length,1);assert.equal(generationFixtureState.postAck.submissions[0].operationId,accepted.request().postDataJSON().operationId);
    // The fixture marks only the local request as failed; no supplier or live queue.
    await fetch(base+'/__fixture/fail');const failed=node(rootId).getByRole('alert');await expect(failed).toContainText('重新生成未完成',{timeout:15000});surface('INPLACE_IMAGE_FAILURE_SURFACE',await appearance(failed),'dark');readable('INPLACE_IMAGE_FAILURE_TEXT',await appearance(failed));await snapshot('dark-image-failure');
    // Original accepted receipt remains queryable; verify its local recovery UI.
    await page.reload({waitUntil:'domcontentloaded'});await node(rootId).waitFor();const recovery=page.getByRole('complementary',{name:'图像任务恢复',exact:true});await recovery.waitFor();await recovery.getByRole('button',{name:/待恢复任务/}).click();const list=recovery.getByRole('list',{name:'待恢复原任务',exact:true});await list.waitFor();surface('RECOVERY_SURFACE',await appearance(list),'dark');readable('RECOVERY_TEXT',await appearance(list));await snapshot('dark-recovery');
    const loaded=sourceHashes();verify(JSON.stringify(loaded)===JSON.stringify(sourceAtStart),'SOURCE_HASHES_STABLE_DURING_RUN');
    verify(external.length===0,'ZERO_EXTERNAL_NETWORK');verify(errors.length===0,'ZERO_PAGEERRORS',{errors});verify(hydration.length===0,'NO_HYDRATION_MISMATCH',{hydration});
    if(baseline){assert.ok(violations.some(v=>v.name==='REGENERATION_TITLE_CONTRAST'));assert.ok(violations.some(v=>v.name==='GROUP_SELECTED_TITLE_CONTRAST'));assert.ok(violations.some(v=>v.name==='TEXT_FAILURE_CONTRAST'));assert.ok(violations.some(v=>v.name.includes('TEXT_MODEL_CONTRAST')));}
    const status=baseline?'REPRODUCED':violations.length?'FAIL':'PASS',exit=baseline?1:violations.length?2:0;
    const literal=`CANVAS_THEME_MATRIX=${status} COMBINATIONS=4 CHECKS=${checks.length} VIOLATIONS=${violations.length} FULL_NEXT=YES SUPPLIER_CALLS=0 EXIT=${exit}`;
    fs.writeFileSync(path.join(out,'RESULT.json'),JSON.stringify({status,sourceRoot,baseline,checks,violations,contrasts,samples,failure,regeneration,group,errors,hydration,external,loaded,sourceAtStart,promptFixtureState,generationFixtureState,supplierCalls:0,productionWrites:0,literal},null,2));console.log(literal);process.exitCode=exit;
  }catch(e){let screenshotError=null,bodyError=null;await page.screenshot({path:path.join(out,'failure.png')}).catch(error=>{screenshotError=String(error);});const body=await page.locator('body').innerText().catch(error=>{bodyError=String(error);return '';});fs.writeFileSync(path.join(out,'ERROR.json'),JSON.stringify({error:e.stack,checks,violations,contrasts,samples,errors,external,promptFixtureState,generationFixtureState,body,screenshotError,bodyError,lifecycle},null,2));throw e;}
  finally{generationAckGate?.cancel();fs.writeFileSync(path.join(out,'BROWSER_LIFECYCLE.json'),JSON.stringify({fixturePid:runtime.pid,lifecycle,errors,hydration,originalTimeouts:true,gestureRetries:0},null,2));await browser.close();await runtime.stop();}
})().catch(e=>{console.error(e);process.exitCode=2});
