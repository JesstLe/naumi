import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, expect as baseExpect } from '@playwright/test';

const out = path.resolve(process.env.CANVAS_AGENT_EVIDENCE_DIR || 'output/orb-full-state-companion-20261012/canvas-browser');
await mkdir(out, { recursive: true });
const originalConfig = await readFile('tsconfig.json');
const dist = '.next-orb-companion-acceptance';
const expect = baseExpect.configure({ timeout: 45000 });
const logs = [], errors = [], checks = [], submissions = [];
let app, browser, page;
let responseMode="done";
let histories=[],historyTitle="换色对话",deleted=false;
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
        if(req.method()==='GET')return route.fulfill({json:url.searchParams.get('id')?{session:{id:'cv-history',title:historyTitle,turns:[{id:'saved-user',role:'user',content:'把颜色改成蓝色'},{id:'saved-assistant',role:'assistant',content:'历史换色已完成',artifacts:[{id:'agent-output',image:art.image,title:'换色结果'}]}],steps:[{type:'tool_end',id:'recolor',summary:'换色完成'}],running:false}}:{sessions:deleted?[]:[{id:'cv-history',title:historyTitle,updatedAt:now}]}});
        if(req.method()==='PATCH'){historyTitle=req.postDataJSON().title;return route.fulfill({json:{ok:true}});}
        if(req.method()==='DELETE'){deleted=true;return route.fulfill({json:{ok:true}});}
        submissions.push({body:req.postDataJSON(),headers:req.headers()});
        if(responseMode==='waiting') return route.fulfill({contentType:'text/event-stream',body:'event: attention\ndata: {"kind":"waiting"}\n\nevent: delta\ndata: {"text":"本次需要确认报价。"}\n\nevent: done\ndata: {"ok":true}\n\n'});
        if(responseMode==='eof') return route.fulfill({contentType:'text/event-stream',body:'event: delta\ndata: {"text":"连接尚未完成"}\n\n'});
        return route.fulfill({ contentType:'text/event-stream', body:'event: delta\ndata: {"text":"验收回复：保留商品主体。"}\n\nevent: tool_start\ndata: {"id":"recolor","tool":"recolor_product","summary":"正在换色"}\n\nevent: tool_end\ndata: {"id":"recolor","summary":"换色完成"}\n\nevent: artifacts\ndata: '+JSON.stringify({artifacts:[{id:'agent-output',image:art.image,title:'换色结果'}]})+'\n\nevent: done\ndata: {"ok":true}\n\n' });
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
  const {p,context}=await boot(1440);
  const panel=p.getByTestId('canvas-assistant-panel'), input=panel.getByTestId('canvas-assistant-input'), floating=p.getByTestId('canvas-agent-orb'), orb=floating.locator('[data-orb-state]');
  await expect(orb.locator('svg')).toHaveCount(1);
  await input.fill('只分析商品图'); await panel.getByRole('button',{name:'发送消息',exact:true}).click();
  await expect(panel).toContainText('验收回复：保留商品主体。'); await expect(orb).toHaveAttribute('data-orb-state','done');
  await expect(floating.getByRole('status')).toHaveText('已完成');
  await panel.getByRole('button',{name:'有帮助',exact:true}).click();await expect(orb).toHaveAttribute('data-orb-state','happy');
  pass('real canvas SSE done + feedback drive companion with unchanged billing request');
  await panel.getByRole('button',{name:'新建对话',exact:true}).click();await expect(floating.getByRole('status')).toHaveText('Agent');
  responseMode='waiting';await input.fill('生成一组图片');await panel.getByRole('button',{name:'发送消息',exact:true}).click();
  await expect(panel).toContainText('本次需要确认报价。');await expect(orb).toHaveAttribute('data-orb-state','waiting');
  await expect(floating.getByRole('status')).toHaveText('等待输入');await expect(panel.getByTestId('canvas-assistant-attention')).toHaveText('等待输入');await panel.getByRole('button',{name:'有帮助',exact:true}).click();await expect(orb).toHaveAttribute('data-orb-state','waiting');
  pass('structured attention survives delta, done and positive feedback; no false success');
  await p.screenshot({path:path.join(out,'waiting.png')});
  await panel.getByRole('button',{name:'新建对话',exact:true}).click();responseMode='eof';await input.fill('检查连接');await panel.getByRole('button',{name:'发送消息',exact:true}).click();
  await expect(orb).toHaveAttribute('data-orb-state','error');await expect(panel.getByRole('alert')).toContainText('任务连接已中断');
  pass('EOF without done remains failed');
  await panel.getByRole('button',{name:'新建对话',exact:true}).click();
  const point=await floating.boundingBox();await p.mouse.move(point.x+40,point.y+40);await p.mouse.down();await p.mouse.move(point.x-260,point.y+190,{steps:5});await p.mouse.up();
  const moved=await floating.boundingBox();assert.ok(Math.abs(point.x-moved.x)>200);await expect(panel).toBeVisible();pass('full canvas drag expands across viewport and does not toggle sidebar');
  await p.setViewportSize({width:390,height:844});await p.getByTestId('canvas-agent-toggle').click();await expect(panel).toBeVisible();
  const mob=await floating.boundingBox();assert.ok(mob.x>=0&&mob.x+mob.width<=390);await p.screenshot({path:path.join(out,'mobile.png')});pass('mobile orb bounds and sidebar remain accessible');
  assert.equal(submissions.length,3);assert.deepEqual(errors,[]);
  console.log('ORB_CANVAS_BROWSER=PASS checks='+checks.length+' ACTUAL_CANVAS=PASS SSE_FIXTURE=PASS PROVIDER_CALLS=0');
  await context.close();
} finally {
  await browser?.close();
  if(app) { try { process.platform==='win32'?execFileSync('taskkill',['/PID',String(app.pid),'/T','/F'],{stdio:'ignore'}):app.kill('SIGTERM'); } catch {} }
  await writeFile('tsconfig.json',originalConfig);
  await writeFile(path.join(out,'server.log'),logs.join(''));
  await writeFile(path.join(out,'result.json'),JSON.stringify({checks,errors,submissions:submissions.length,mode:'actual-canvas-fixture-SSE',paidCalls:0},null,2));
}
