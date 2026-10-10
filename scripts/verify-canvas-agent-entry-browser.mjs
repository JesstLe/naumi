import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, expect as baseExpect } from '@playwright/test';

const out = path.resolve(process.env.CANVAS_AGENT_EVIDENCE_DIR || 'output/canvas-agent-entry/browser');
await mkdir(out, { recursive: true });
const originalConfig = await readFile('tsconfig.json');
const dist = '.next-agent-entry-acceptance';
const expect = baseExpect.configure({ timeout: 45000 });
const logs = [], errors = [], checks = [], submissions = [];
let app, browser, page;
const pass = name => { checks.push(name); console.log('PASS ' + name); };
try {
  const socket = createServer(); await new Promise(r => socket.listen(0, '127.0.0.1', r));
  const port = socket.address().port; await new Promise(r => socket.close(r));
  const base = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    env: { ...process.env, DATABASE_URL: '', NAUMI_MULTI_USER: '0', SETTINGS_SECRET: randomUUID(), VIDEO_WORKER_SECRET: randomUUID(), NAUMI_VIDEO_WORKER: '0', OPENAI_API_KEY: 'fixture', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: dist }, stdio: ['ignore','pipe','pipe'],
  });
  app.stdout.on('data', c => logs.push(c.toString())); app.stderr.on('data', c => logs.push(c.toString()));
  let ready = false;
  for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 500)); }
  assert.ok(ready, 'dev server ready');
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const now = new Date().toISOString(), email = 'canvas-agent@example.test';
  const user = { name: 'Agent入口验收', email, plan: 'starter', creditsTotal: 99999, creditsUsed: 0, joinedAt: now, renewsAt: now, invoices: [], canHigh: true };
  const art = { id: 'agent-root', title: '商品参考图', category: 'main', prompt: '保留主体', createdAt: now, status: 'completed', image: base + '/demos/suite-demo/suppl-src.png', gradient: '', origin: 'canvas', source: 'canvas-add', groupId: 'agent-root', width: 1024, height: 1024, canvasWidth: 320, canvasHeight: 320, canvasX: 120, canvasY: 120, ratio: '1:1', resolution: '1K' };
  const model = { id: 'gpt-image-2', label: 'GPT Image 2', modality: 'image', supportsEdit: true, qualities: ['low','medium','high'], qualitySupported: true, nativeResolutions: ['1K','2K'], generationParameters: { ratios: ['1:1','3:4','4:3'], resolutions: ['1K','2K'] } };
  const features = Object.fromEntries(['image.generate','canvas.image','canvas.text-generate','canvas.assistant','tool.cutout'].map(f => [f, { label: f, enabled: true, unit: 'image', prices: { low: {'1K':0}, medium: {'1K':0}, high: {'1K':0} } }]));
  const textModels = [{id:'gpt-6-astra',label:'GPT-6 Astra',modality:'text'}, {id:'gemini-2.5-pro',label:'Gemini 2.5 Pro · 企业专用长模型名称验收',modality:'text'}];
  const prefKey = 'nv:canvas:agent:disclosure:' + email;
  async function boot(width, { empty = false, pref = null, locale = 'zh', blockedStorage = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
    await context.addCookies([{ name: 'naumi_locale', value: locale, url: base }]);
    await context.addInitScript(({ user, empty, pref, prefKey, blockedStorage }) => {
      localStorage.setItem('theme','light'); localStorage.setItem('naumi:last-email',user.email);
      localStorage.setItem('naumi:user:' + user.email, JSON.stringify(user)); localStorage.setItem('nv:canvas:bg','light');
      if (!empty && !localStorage.getItem('nv:canvas:last')) localStorage.setItem('nv:canvas:last','tree:agent-root');
      if (pref && !localStorage.getItem(prefKey)) localStorage.setItem(prefKey,pref);
      if (blockedStorage) {
        const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
        Storage.prototype.getItem = function(key) { if(key===prefKey)throw new Error('Fixture blocked preference storage'); return get.call(this,key); };
        Storage.prototype.setItem = function(key,value) { if(key===prefKey)throw new Error('Fixture blocked preference storage'); return set.call(this,key,value); };
      }
    }, { user, empty, pref, prefKey, blockedStorage });
    const p = await context.newPage(); page = p; p.setDefaultTimeout(45000);
    p.on('pageerror', e => errors.push(e.message));
    await p.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), endpoint = url.pathname;
      if (endpoint === '/api/config') return route.fulfill({ json: { db:true, authMode:'mock', multiUser:true, commerceVisible:false, imageQualityCapable:true, creditsMetered:true, imageModels:[model], defaultImageModel:model.id } });
      if (endpoint === '/api/auth/session') return route.fulfill({ json: {user} });
      if (endpoint === '/api/account') return route.fulfill({ json: {persisted:true,user,artworks:empty ? [] : [art]} });
      if (endpoint === '/api/projects') return route.fulfill({ json: {names:{'tree:agent-root':'Agent画布验收'}} });
      if (endpoint === '/api/models') { const text = ['canvas.assistant','canvas.text-generate'].includes(url.searchParams.get('feature')); return route.fulfill({ json: {managed:text,supported:true,feature:url.searchParams.get('feature'),version:1,models:text?textModels:[model],defaultModelId:text?textModels[0].id:model.id} }); }
      if (endpoint === '/api/text-models') return route.fulfill({ json: {models:textModels.map(m=>m.id),defaultModel:textModels[0].id} });
      if (endpoint === '/api/billing/catalog') return route.fulfill({ json: {version:1,features,products:[],thresholds:{highQualityPaidFen:0,agentConfirmCredits:100},effective:{metering:true,commerce:false,recharge:false}} });
      if (endpoint === '/api/billing/quote') return route.fulfill({ json: {...req.postDataJSON(),credits:0,reserveCredits:0,version:1} });
      if (endpoint === '/api/canvas/assistant') {
        submissions.push({body:req.postDataJSON(),headers:req.headers()});
        return route.fulfill({ contentType:'text/event-stream', body:'event: delta\ndata: {"text":"验收回复：保留商品主体。"}\n\n' });
      }
      if (req.method() === 'POST' && /generate|image-tasks/.test(endpoint)) throw new Error('Unexpected paid generation');
      return route.fulfill({ json: {items:[],tasks:[],names:{},nodes:[],settings:{},records:[],artworks:[],ok:true,persisted:true} });
    });
    await p.route('**/_next/static/chunks/**', async route => {
      const file = path.resolve(dist, new URL(route.request().url()).pathname.replace('/_next/',''));
      assert.ok(file.startsWith(path.resolve(dist)+path.sep));
      await route.fulfill({ contentType:'application/javascript',body:await readFile(file) });
    });
    await p.route('**/demos/suite-demo/suppl-src.png', async route => route.fulfill({contentType:'image/png',body:await readFile('public/demos/suite-demo/suppl-src.png')}));
    await p.goto(base+'/canvas', { timeout: 120000 });
    if (empty) await p.getByTestId('canvas-project-browser').getByRole('button',{name:locale === 'zh' ? '创建新项目' : 'New project',exact:true}).click();
    await expect(p.getByTestId('canvas-agent-toggle')).toBeVisible();
    return { p, context };
  }
  async function verifyComposerModel(p) {
    const sidebar=p.getByTestId('canvas-assistant-panel'), composer=sidebar.getByTestId('canvas-assistant-composer');
    await expect(sidebar.getByTestId('canvas-assistant-model')).toHaveCount(1);
    const select=composer.getByRole('combobox',{name:'文字模型'});
    await expect(select).toContainText('GPT-6 Astra');
    await expect(select.locator('[data-model-brand="openai"]')).toBeVisible();
    await select.click();
    const menu=p.getByRole('listbox',{name:'文字模型'}); await expect(menu).toBeVisible();
    const m=await menu.boundingBox(), view=p.viewportSize();
    assert.ok(m.x>=8 && m.x+m.width<=view.width-8 && m.y>=8 && m.y+m.height<=view.height-8,'portalled model menu stays in viewport');
    assert.equal(await menu.evaluate(el=>el.closest('[data-testid="canvas-assistant-panel"]')),null,'menu escapes clipping sidebar');
    await select.press('ArrowDown'); await select.press('Enter');
    await expect(menu).toHaveCount(0); await expect(select).toContainText('Gemini 2.5 Pro');
    await expect(select.locator('[data-model-brand="gemini"]')).toBeVisible();
    const s=await select.boundingBox(), send=await composer.getByRole('button',{name:'发送消息',exact:true}).boundingBox(), c=await composer.boundingBox();
    assert.ok(s.x+s.width<=send.x && send.x+send.width<=c.x+c.width && Math.abs(s.y-send.y)<2,'long model name leaves send reachable');
    return select;
  }
  const { p: desktop, context: desktopContext } = await boot(1440, {empty:true});
  const panel = desktop.getByTestId('canvas-assistant-panel'), toggle = desktop.getByTestId('canvas-agent-toggle');
  await expect(panel).toBeVisible(); await expect(toggle).toHaveAttribute('aria-expanded','true');
  await expect(panel.getByRole('heading',{name:'画布 Agent',exact:true})).toBeVisible();
  await expect(panel.getByTestId('canvas-assistant-task')).toHaveCount(4);
  const box = await panel.boundingBox(), stage = await desktop.getByTestId('canvas-drop-zone').boundingBox();
  assert.equal(Math.round(box.width),360); assert.ok(stage.x+stage.width <= box.x);
  assert.notEqual(await desktop.evaluate(() => document.activeElement?.tagName),'TEXTAREA');
  await verifyComposerModel(desktop); pass('model brand/name/switch moved inside composer; portalled menu and keyboard selection work');
  await panel.getByTestId('canvas-assistant-task').first().click();
  const input = panel.getByTestId('canvas-assistant-input'); const draft = await input.inputValue();
  assert.ok(draft); await expect(panel.getByRole('button',{name:'发送消息',exact:true})).toBeDisabled();
  await input.press('Enter'); assert.equal(submissions.length,0);
  await desktop.screenshot({path:path.join(out,'desktop-empty.png')});
  pass('empty canvas defaults to 360px sibling tasks, no autofocus or unbound request');
  await panel.getByRole('button',{name:'收起助手',exact:true}).click(); await expect(panel).toHaveCount(0);
  assert.equal(await desktop.evaluate(key => localStorage.getItem(key),prefKey),'closed');
  await toggle.click(); await expect(input).toHaveValue(draft); await expect(input).toBeFocused();
  await toggle.click(); await desktop.reload();
  await desktop.getByTestId('canvas-project-browser').getByRole('button',{name:'创建新项目',exact:true}).click();
  await expect(toggle).toHaveAttribute('aria-expanded','false'); await expect(panel).toHaveCount(0);
  await toggle.click(); await desktop.reload();
  await desktop.getByTestId('canvas-project-browser').getByRole('button',{name:'创建新项目',exact:true}).click();
  await expect(panel).toBeVisible();
  pass('collapse/reopen preserves draft; reload remembers explicit closed/open preference');
  await desktopContext.close();

  const {p: image,context:imageContext} = await boot(1440);
  const imagePanel=image.getByTestId('canvas-assistant-panel'), imageToggle=image.getByTestId('canvas-agent-toggle');
  const root=image.locator('.react-flow__node[data-id="agent-root"]'); await expect(root).toBeVisible();
  await verifyComposerModel(image);
  await root.click(); await expect(imagePanel.getByRole('button',{name:'查看参考图片',exact:true}).first()).toBeEnabled();
  await imagePanel.getByTestId('canvas-assistant-input').fill('帮我点评商品图');
  await imagePanel.getByRole('button',{name:'发送消息',exact:true}).click();
  await expect(imagePanel).toContainText('验收回复：保留商品主体。');
  assert.equal(submissions.length,1); assert.equal(submissions[0].body.anchorId,art.id);
  assert.deepEqual(submissions[0].body.contextIds,[art.id]); assert.ok(submissions[0].headers['x-naumi-billing-operation-id']);
  assert.equal(submissions[0].headers['x-naumi-text-model'],'gemini-2.5-pro','selected model reaches original assistant request header');
  await imageToggle.click(); await imageToggle.click(); await expect(imagePanel).toContainText('验收回复：保留商品主体。');
  await root.click();
  await image.keyboard.press('m');
  await expect(image.getByTestId('canvas-main-toolbar').locator('[data-tool="marquee"]')).toHaveClass(/canvas-ui-primary/);
  await imagePanel.getByTestId('canvas-assistant-input').fill('v'); await image.keyboard.press('m');
  await expect(imagePanel.getByTestId('canvas-assistant-input')).toHaveValue('vm');
  await image.screenshot({path:path.join(out,'desktop-context.png')});
  pass('image context, SSE and billing operation intact; close preserves chat and canvas shortcuts remain usable');
  await imageToggle.click(); await root.click(); await image.getByTestId('image-node-toolbar').locator('[data-action="assistant"]').click();
  await expect(imagePanel).toBeVisible(); pass('image toolbar shortcut reopens same global Agent');
  await root.click({button:'right'}); await image.getByTestId('canvas-context-menu').getByRole('menuitem',{name:'属性设置',exact:true}).click();
  await expect(image.getByTestId('node-properties-panel')).toBeVisible(); await expect(imagePanel).toHaveCount(0);
  await image.setViewportSize({width:390,height:844}); await image.setViewportSize({width:1440,height:960});
  await expect(imagePanel).toHaveCount(0); await expect(image.getByTestId('node-properties-panel')).toHaveCount(1);
  assert.equal(await image.evaluate(key=>localStorage.getItem(key),prefKey),'open');
  await imageToggle.click(); await expect(imagePanel).toBeVisible(); await expect(image.getByTestId('node-properties-panel')).toHaveCount(0);
  pass('properties temporarily replace Agent without overwriting disclosure preference');
  await image.setViewportSize({width:1024,height:900});
  const smallStage=await image.getByTestId('canvas-drop-zone').boundingBox(), actions=await image.getByTestId('canvas-top-actions').boundingBox(), chrome=await image.getByTestId('canvas-project-chrome').boundingBox();
  assert.ok(smallStage.width>=600); assert.ok(actions.y>=chrome.y+chrome.height);
  const mainTools=await image.getByTestId('canvas-main-toolbar').boundingBox(), viewTools=await image.getByTestId('canvas-view-toolbar').boundingBox();
  assert.ok(mainTools.y+mainTools.height <= viewTools.y-8, 'bottom toolbars separated');
  await image.screenshot({path:path.join(out,'desktop-1024.png')});
  await image.setViewportSize({width:390,height:844}); await expect(imagePanel).toHaveCount(0);
  await imageToggle.click(); await expect(imagePanel).toBeVisible(); await expect(imagePanel).toHaveAttribute('role','dialog');
  await image.keyboard.press('Escape'); await expect(imagePanel).toHaveCount(0);
  pass('1024px chrome avoids collision; resizing to mobile collapses and overlay Escape works');
  await imageContext.close();

  for (const width of [390,320]) {
    const {p,context}=await boot(width,{pref:'open'});
    const mobilePanel=p.getByTestId('canvas-assistant-panel'), mobileToggle=p.getByTestId('canvas-agent-toggle');
    await expect(mobilePanel).toHaveCount(0); await expect(mobileToggle).toHaveAttribute('aria-expanded','false');
    const t=await mobileToggle.boundingBox(); assert.ok(t.x>=0 && t.x+t.width<=width);
    await mobileToggle.click(); await expect(mobilePanel).toBeVisible();
    await verifyComposerModel(p);
    const b=await mobilePanel.boundingBox(); assert.ok(b.x>=8 && b.x+b.width<=width-8);
    await p.screenshot({path:path.join(out,`mobile-${width}.png`)});
    await p.keyboard.press('Escape'); await p.reload(); await expect(mobilePanel).toHaveCount(0);
    await context.close();
  }
  pass('390/320px entry stays visible, mobile defaults closed even with saved desktop open preference');
  const {p:en,context:enContext}=await boot(1280,{empty:true,locale:'en'});
  await expect(en.getByRole('button',{name:'Canvas Agent',exact:true})).toBeVisible();
  await expect(en.getByRole('heading',{name:'Canvas Agent',exact:true})).toBeVisible(); await enContext.close();
  pass('English global entry and empty sidebar localized');
  const {p:readonly,context:readonlyContext}=await boot(1440);
  await readonly.goto(base+'/canvas?email=viewer%40example.test&node=agent-root');
  await expect(readonly.locator('.react-flow__node[data-id="agent-root"]')).toBeVisible();
  await expect(readonly.getByTestId('canvas-agent-toggle')).toHaveCount(0); await expect(readonly.getByTestId('canvas-assistant-panel')).toHaveCount(0);
  await readonlyContext.close(); pass('read-only shared canvas retains existing access boundary');
  const {p:storage,context:storageContext}=await boot(1440,{empty:true,blockedStorage:true});
  await expect(storage.getByTestId('canvas-assistant-panel')).toBeVisible(); await storage.getByTestId('canvas-agent-toggle').click();
  await expect(storage.getByTestId('canvas-assistant-panel')).toHaveCount(0); await storage.getByTestId('canvas-agent-toggle').click();
  await expect(storage.getByTestId('canvas-assistant-panel')).toBeVisible(); await storageContext.close();
  pass('blocked preference storage falls back to working in-memory disclosure');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,submissions,providerCalls:0},null,2));
  console.log('BROWSER=PASS DESKTOP_EMPTY_CONTEXT=PASS PREFERENCE=PASS MOBILE_320_390=PASS CHROME_1024=PASS HOTKEYS=PASS MODEL_COMPOSER=PASS MODEL_MENU_KEYBOARD=PASS SSE_FIXTURE=PASS PROVIDER_CALLS=0');
} catch(error) {
  await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  await writeFile(path.join(out,'failure.json'),JSON.stringify({checks,errors,body:await page?.locator('body').innerText().catch(()=>null)},null,2));
  throw error;
} finally {
  await browser?.close();
  if(app?.pid) { if(process.platform==='win32') {try{execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'pipe'});}catch{}} else app.kill('SIGTERM'); }
  await writeFile('tsconfig.json',originalConfig); await writeFile(path.join(out,'next.log'),logs.join(''));
}
