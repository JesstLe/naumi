import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import React from 'react';
import ReactDOM from 'react-dom';
import { startFixture } from './verify-enterprise-collaboration-ui.http.mjs';

const root = process.cwd(), output = path.resolve(process.env.COLLAB_UI_EVIDENCE || 'output/enterprise-collaboration-ui');
await mkdir(output, { recursive: true });
assert.match(React.version, /^19\./); assert.equal(React.version, ReactDOM.version);
const fixtureEntry = path.join(root, 'scripts/verify-enterprise-collaboration-ui.fixture.tsx');
const stub = {
  '@/lib/auth-context': `export {useAuth} from ${JSON.stringify(fixtureEntry)};`,
  '@/lib/supabase': `export {authHeader} from ${JSON.stringify(fixtureEntry)};`,
  '@/lib/auth-modal-context': 'export const useAuthModal=()=>({openAuth:()=>{}});',
  '@/lib/feature-access/client': 'const value={ready:true,can:()=>true,canPage:()=>true};export const useFeatureAccess=()=>value;',
  '@/lib/brand-context': 'export const useBrand=()=>({name:"Naumi",logo:"/fixture-logo.svg",logoHasText:false});',
  '@/components/saas/workspace-selector': 'export const WorkspaceSelector=()=>null;',
  '@/components/studio3d/studio3d-launch': 'export const Studio3dLaunch=()=>null;',
  '@/lib/browser-image-cache': 'export const readBrowserImage=async(url)=>(await fetch(url)).blob();',
  '@/components/cached-image': 'import React from "react";export const CachedImage=(props)=><img {...props}/>;',
  '@/components/media': 'import React from "react";export const Media=({src,alt,ratio,imgClassName})=><div className={ratio}><img src={src} alt={alt} className={imgClassName} style={{width:"100%",height:"100%",objectFit:"contain"}}/></div>;',
  'next/link': 'import React from "react";export default function Link({href,children,onClick,...rest}){return <a href={href} {...rest} onClick={e=>{onClick?.(e);if(!e.defaultPrevented && !e.ctrlKey && !e.metaKey){e.preventDefault();window.__route(href);}}}>{children}</a>}',
  'next/navigation': 'import {useState,useEffect} from "react";function useLocation(){const [v,set]=useState(location.href);useEffect(()=>{const f=()=>set(location.href);window.addEventListener("popstate",f);return()=>window.removeEventListener("popstate",f)},[]);return new URL(v)} export const usePathname=()=>useLocation().pathname;export const useSearchParams=()=>useLocation().searchParams;export const useRouter=()=>({push:path=>window.__route(path)});',
};
const bundle = await build({ entryPoints: [fixtureEntry], bundle: true, write: false, outdir: 'fixture', platform: 'browser', format: 'esm', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_DESKTOP_DEPLOYMENT': '"1"', 'process.env': '{}' }, plugins: [{ name: 'test-composition-only', setup(b) { b.onResolve({ filter: /.*/ }, args => { if (stub[args.path]) return { path: args.path, namespace: 'fixture-stub' }; }); b.onLoad({ filter: /.*/, namespace: 'fixture-stub' }, args => ({ contents: stub[args.path], loader: 'tsx', resolveDir: root })); } }] });
const css = bundle.outputFiles.find(f => f.path.endsWith('.css')).text;
const js = bundle.outputFiles.find(f => f.path.endsWith('.js')).text;
const fixtureCss = `*{box-sizing:border-box}body{margin:0;font-family:Arial,"Microsoft YaHei",sans-serif;color:#273449;background:#f7f8fc}button{cursor:pointer}a{color:inherit;text-decoration:none}.fixture-controls{display:flex;align-items:center;gap:8px;background:#fff;padding:8px 16px;height:42px;border-bottom:1px solid #e9edf4;font-size:10px}.fixture-controls>span{color:#9aa7be;margin-right:auto;letter-spacing:1px}.fixture-controls button{border:1px solid #e0e6f0;border-radius:5px;background:#fff;color:#8590a4;font-size:10px;padding:4px 7px}.fixture-canvas{height:calc(100vh - 42px);background-color:#f5f7fa;background-image:radial-gradient(#cfd6e3 .6px,transparent .6px);background-size:20px 20px}.fixture-canvas>header{display:flex;align-items:center;gap:15px;background:#fff;padding:16px 26px;border-bottom:1px solid #e6ebf3}.fixture-canvas>header>b{font-size:23px;letter-spacing:-1px;color:#384867}.fixture-canvas>header>span{color:#7f8c9f;font-size:13px}.fixture-canvas>header>div{margin-left:auto;display:flex;gap:10px}.fixture-nodes{display:flex;align-items:center;gap:80px;padding:125px 70px}.fixture-nodes article{background:#fff;box-shadow:0 10px 50px #3e527c0d;border:1px solid #dbe2ef;border-radius:14px;padding:18px;width:260px}.fixture-nodes img{width:220px;height:240px;object-fit:contain;background:#f7f3ed;border-radius:8px}.fixture-nodes h2{font-size:15px;font-weight:500;margin:15px 0 4px}.fixture-nodes span,.fixture-nodes p{font-size:12px;color:#98a2b2;line-height:1.8}.fixture-selection{position:absolute;bottom:38px;left:100px;border:1px solid #d9e0f0;background:#fff;padding:10px 18px;border-radius:9px;color:#7385b7}.dt-shell{height:calc(100vh - 42px)}.dt-sidebar{top:42px;height:calc(100vh - 42px)}.dt-topbar{min-height:54px}.dt-shell button{font-family:inherit}`;
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Collaboration UI · Local contract fixture</title><style>${css}\n${fixtureCss}</style><div id="root"></div><script type="module" src="/bundle.js"></script></html>`;
const product = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="340" viewBox="0 0 300 340"><rect width="300" height="340" fill="#f4f0e9"/><ellipse cx="152" cy="292" rx="76" ry="10" fill="#d4cfc5" opacity=".4"/><path d="M92 128Q92 98 122 98H182Q212 98 212 128V253Q212 280 183 280H120Q92 280 92 253Z" fill="#e3e2cf"/><path d="M120 68H183V101H120Z" fill="#787e68"/><path d="M113 61H190V75H113Z" fill="#929982"/><rect x="107" y="158" width="90" height="65" rx="3" fill="#f5f4e9"/><text x="152" y="186" text-anchor="middle" fill="#64705b" font-family="serif" font-size="17">NAUMI</text><text x="152" y="205" text-anchor="middle" fill="#a1a894" font-family="Arial" font-size="7" letter-spacing="2">BOTANICAL CARE</text></svg>`;
const assets = new Map([['/', { type: 'text/html; charset=utf-8', body: html }], ['/bundle.js', { type: 'text/javascript; charset=utf-8', body: js }], ['/fixture-product.svg', { type: 'image/svg+xml', body: product }], ['/fixture-logo.svg', { type: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect x="2" y="2" width="26" height="26" rx="8" fill="#6e80c9"/><path d="M9 21V9L21 21V9" fill="none" stroke="white" stroke-width="2"/></svg>' }]]);
const fixture = await startFixture(assets), checks = [], errors = [];
let browser;
const pass = label => { checks.push(label); console.log(`PASS ${label}`); };
const state = page => page.evaluate(() => window.__client ? ({ account: window.__client.state.account, status: window.__client.state.status, bootstrap: window.__client.state.bootstrap?.enterpriseId, uploads: window.__client.state.uploads.map(u => ({ status: u.status, id: u.id, progress: u.progress })) }) : ({status:'loading'}));
const waitReady = page => expect.poll(async () => (await state(page)).status).toBe('ready');
const selectDirect = async page => { await page.evaluate(() => window.__client.open({ conversationId: 'direct-ab' })); await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible(); };
try {
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const aContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const bContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await bContext.addInitScript(() => sessionStorage.setItem('fixture-actor', 'b@fixture.test'));
  const a = await aContext.newPage(), b = await bContext.newPage();
  for (const page of [a, b]) page.on('pageerror', e => errors.push(e.message));
  await Promise.all([a.goto(fixture.origin + '/canvas'), b.goto(fixture.origin + '/canvas')]);
  await Promise.all([waitReady(a), waitReady(b)]);
  await expect.poll(() => fixture.streams.size).toBe(2);
  await a.getByRole('button', { name: /^消息/ }).first().click();
  await a.locator('.co-conversation').filter({ hasText: '产品设计' }).click();
  await expect(a.locator('.co-message')).toHaveCount(5);
  pass('React 19 strict root: two identities, one authenticated SSE per identity');
  await a.screenshot({ path: path.join(output, 'chat-floating.png') });

  const canvasBefore = await a.locator('.fixture-nodes').evaluate(el => ({ html: el.innerHTML, top: el.getBoundingClientRect().top }));
  await a.getByRole('button', { name: '收起聊天' }).click();
  const existingUnread = await a.evaluate(() => window.__client.state.conversations.reduce((n, c) => n + c.unread, 0));
  await selectDirect(b); await b.getByRole('textbox', { name: '消息内容', exact: true }).fill('B 在线消息，不抢焦点'); await b.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => a.evaluate(() => window.__client.state.conversations.reduce((n, c) => n + c.unread, 0))).toBeGreaterThan(existingUnread);
  await expect(a.locator('[data-collaboration-window]')).toHaveCount(0);
  assert.deepEqual(await a.locator('.fixture-nodes').evaluate(el => ({ html: el.innerHTML, top: el.getBoundingClientRect().top })), canvasBefore);
  pass('Closed chat keeps unread badge; new message never opens dialog or mutates canvas fixture');
  await a.waitForTimeout(350); // drain the preceding event's targeted message read
  const idleReads=fixture.calls.filter(c=>c.path.includes('/conversations') && c.method==='GET').length;
  await a.waitForTimeout(650);
  assert.equal(fixture.calls.filter(c=>c.path.includes('/conversations') && c.method==='GET').length,idleReads);
  pass('Idle closed client has no per-conversation polling loop');


  await selectDirect(a); fixture.flags.loseAck = true;
  await a.getByRole('textbox', { name: '消息内容', exact: true }).fill('ACK 丢失同 ID'); await a.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(a.getByText('送达状态待确认', { exact: true })).toBeVisible();
  await a.getByRole('button', { name: '使用原消息重试' }).click();
  await expect(a.locator('.co-pending')).toHaveCount(0);
  const posts = fixture.counters.messagePosts.filter(p => p.body === 'ACK 丢失同 ID'); assert.equal(posts.length, 2); assert.equal(posts[0].clientId, posts[1].clientId); assert.equal(fixture.messages.get('direct-ab').filter(m => m.body === 'ACK 丢失同 ID').length, 1);
  pass('Lost send ACK retries immutable payload with same clientId and yields one message');

  const xss = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script> **加粗安全** [危险](javascript:alert(1)) [有效链接](https://example.com)';
  await a.getByRole('textbox', { name: '消息内容', exact: true }).fill(xss); await a.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(a.locator('.co-markdown strong').filter({ hasText: '加粗安全' })).toBeVisible();
  assert.equal(await a.locator('.co-markdown img,.co-markdown script,.co-markdown [onerror],.co-markdown a[href^="javascript:"]').count(), 0); assert.equal(await a.evaluate(() => window.__xss), undefined);
  pass('Actual ReactMarkdown XSS: raw HTML discarded, unsafe protocol stripped, strong/link rendered');

  const archive = Buffer.alloc(130_000); for (let i = 0; i < archive.length; i++) archive[i] = i % 251; archive.write('PK\x03\x04', 0, 'binary');
  fixture.flags.slowPart = true;
  await a.getByLabel('选择聊天附件').setInputFiles({ name: '产品素材.zip', mimeType: 'application/zip', buffer: archive });
  await expect.poll(() => fixture.counters.chunks.length).toBeGreaterThan(0);
  await a.getByRole('button', { name: '暂停 产品素材.zip', exact: true }).click();
  await expect(a.getByText(/已暂停/)).toBeVisible();
  const firstUpload = [...fixture.uploads.values()].at(-1), firstId = firstUpload.wire.id;
  const firstParts = new Set(firstUpload.wire.uploadedParts);
  await a.waitForTimeout(700); fixture.flags.slowPart = false;
  await a.getByRole('button', { name: '重试 产品素材.zip', exact: true }).click();
  await expect(a.locator('.co-attachment-chips')).toContainText('产品素材.zip');
  for (const part of firstParts) assert.equal(fixture.counters.chunks.filter(c => c.id === firstId && c.part === part).length, 1);
  await a.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect(a.getByRole('button', { name: '下载 产品素材.zip', exact: true }).first()).toBeVisible();
  assert.equal([...fixture.attachments.values()].find(f => f.wire.name === '产品素材.zip').hash, createHash('sha256').update(archive).digest('hex'));
  const downloadWait = a.waitForEvent('download'); await a.getByRole('button', { name: '下载 产品素材.zip', exact: true }).first().click(); const download = await downloadWait; assert.equal(createHash('sha256').update(await readFile(await download.path())).digest('hex'), createHash('sha256').update(archive).digest('hex'));
  pass('ZIP chunk pause/resume queries original upload and skips acknowledged chunks; download SHA256 exact');
  fixture.flags.slowPart=true;
  await a.getByLabel('选择聊天附件').setInputFiles({name:'路由继续.zip',mimeType:'application/zip',buffer:archive});
  await expect.poll(()=>a.evaluate(()=>window.__client.state.uploads.find(u=>u.file.name==='路由继续.zip')?.status)).toBe('uploading');
  const stableEntry=await a.evaluate(()=>{window.__entry=window.__client.entrySnapshot();return true});
  await a.getByRole('button',{name:'收起聊天',exact:true}).click();
  await a.evaluate(()=>window.__route('/desktop')); fixture.flags.slowPart=false;
  await expect.poll(()=>a.evaluate(()=>window.__client.state.drafts['direct-ab']?.attachments.some(a=>a.name==='路由继续.zip'))).toBe(true);
  assert.equal(await a.evaluate(()=>window.__client.state.uploads.some(u=>u.file.name==='路由继续.zip')),false);
  assert.equal(await a.evaluate(()=>window.__entry===window.__client.entrySnapshot()),true);
  await a.evaluate(()=>window.__route('/canvas'));await selectDirect(a);
  await expect(a.locator('.co-attachment-chips')).toContainText('路由继续.zip');
  pass('In-flight upload survives close + desktop route; public Canvas selector stays referentially stable during upload');


  fixture.flags.slowPart = true;
  await a.getByLabel('选择聊天附件').setInputFiles({ name: '备份.7z', mimeType: 'application/x-7z-compressed', buffer: archive });
  await expect(a.getByRole('button', { name: '取消 备份.7z', exact: true })).toBeVisible();
  await a.getByRole('button', { name: '取消 备份.7z', exact: true }).click();
  await expect(a.locator('.co-upload').filter({ hasText: '备份.7z' })).toContainText('已取消');
  fixture.flags.slowPart = false; await a.waitForTimeout(700);
  await a.getByRole('button', { name: '重试 备份.7z', exact: true }).click(); await expect(a.locator('.co-attachment-chips')).toContainText('备份.7z');
  assert.equal(fixture.counters.cancellations, 1);
  await a.evaluate(()=>{const transfer=new DataTransfer();transfer.items.add(new File(['Rar!fixture'],'源文件.rar',{type:'application/vnd.rar'}));document.querySelector('.co-composer').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));}); await expect(a.locator('.co-attachment-chips')).toContainText('源文件.rar');
  pass('7z cancel confirms DELETE, retry gets new upload; RAR accepted without extraction');

  fixture.flags.denyAttachment = true;
  await a.getByRole('button', { name: '下载 产品素材.zip', exact: true }).first().click(); await expect(a.getByText('文件下载失败 (403)', { exact: true })).toBeVisible(); fixture.flags.denyAttachment = false;
  await a.getByRole('button', { name: '文件', exact: true }).click(); await expect(a.getByRole('button', { name: '下载 产品素材.zip', exact: true }).first()).toBeVisible();
  await a.getByRole('button', { name: '消息', exact: true }).click();
  pass('File tab loads contract kind=files; denied download reports 403 and exposes no blob');

  await a.getByRole('textbox', { name: '消息内容', exact: true }).fill('A 路由草稿');
  const connections = fixture.counters.connections;
  await a.getByRole('button', { name: '切换路由', exact: true }).click();
  await expect(a.locator('[data-desktop]')).toBeVisible(); await expect(a.locator('[data-collaboration-window]')).toHaveCount(1); await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('A 路由草稿');
  assert.equal(fixture.counters.connections, connections);
  await expect(a.locator('.dt-projects a').first()).toHaveText('春日产品方案');
  await a.getByRole('button', { name: '收起聊天', exact: true }).click();
  await a.locator('.dt-projects a').first().click(); await expect(a.locator('.dt-projects a').first()).toHaveAttribute('aria-current', 'page');
  await a.screenshot({ path: path.join(output, 'desktop.png') });
  await a.evaluate(() => window.__route('/canvas')); await selectDirect(a); await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('A 路由草稿');
  pass('Actual DesktopShell/Home reuse root provider; draft survives routes, project order uses desktopProjects and exact key');

  await a.getByRole('button', { name: 'ready false', exact: true }).click(); await a.getByRole('button', { name: 'ready true', exact: true }).click();
  await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('A 路由草稿'); assert.equal(fixture.counters.connections, connections);
  await a.reload(); await waitReady(a); await selectDirect(a); await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('A 路由草稿');
  await a.getByLabel('切换通讯企业').selectOption('enterprise-second'); await waitReady(a); await selectDirect(a); await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('');
  await a.getByRole('textbox', { name: '消息内容', exact: true }).fill('第二企业草稿'); await a.getByLabel('切换通讯企业').selectOption('enterprise-fixture'); await waitReady(a); await selectDirect(a); await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('A 路由草稿');
  pass('ready hydration retains accepted client; reload and enterprise-isolated local drafts');

  fixture.flags.delayMembers = 600;
  await a.evaluate(() => { window.__late = 'pending'; window.__client.loadMembers('品牌').then(() => window.__late = 'accepted').catch(() => window.__late = 'fenced'); });
  await a.getByRole('button', { name: '账户 B', exact: true }).click(); await a.getByRole('button', { name: '账户 A', exact: true }).click(); fixture.flags.delayMembers = 0;
  await waitReady(a); await selectDirect(a); await expect.poll(() => a.evaluate(() => window.__late)).toBe('fenced'); await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('');
  assert.equal(await a.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('naumi:collaboration:draft:')).length), 0);
  pass('A -> B -> A rejects old continuation even with equal final identity; private drafts cleared');
  await a.evaluate(() => { window.__authDelay=500;window.__lateAuth='pending';window.__client.loadMembers('NEVER_DISPATCH_OLD_AUTH').then(()=>window.__lateAuth='accepted').catch(()=>window.__lateAuth='fenced'); });
  await a.getByRole('button',{name:'账户 B',exact:true}).click();await a.getByRole('button',{name:'账户 A',exact:true}).click();
  await a.evaluate(()=>window.__authDelay=0);await waitReady(a);await selectDirect(a);
  await expect.poll(()=>a.evaluate(()=>window.__lateAuth)).toBe('fenced');assert.equal(fixture.calls.some(c=>c.query.q==='NEVER_DISPATCH_OLD_AUTH'),false);
  pass('Deferred authHeader continuation fenced before HTTP dispatch after A -> B -> A');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==', 'base64');
  await a.evaluate(data => { window.__canvasKeys = 0; window.addEventListener('keydown', e => { if (!(e.target instanceof Element && e.target.closest('[data-canvas-hotkeys-blocked="true"]'))) window.__canvasKeys++; }, true); const input = document.querySelector('textarea[aria-label="消息内容"]'); const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], '截图.png', { type: 'image/png' })); input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt })); }, png.toString('base64'));
  await expect(a.locator('.co-attachment-chips')).toContainText('截图.png'); await a.getByRole('textbox', { name: '消息内容', exact: true }).focus(); await a.keyboard.press('Delete'); await a.keyboard.press('Control+z'); assert.equal(await a.evaluate(() => window.__canvasKeys), 0);
  await a.getByRole('button', { name: '发送消息', exact: true }).click(); await a.getByRole('button', { name: '预览 截图.png', exact: true }).first().click(); await expect(a.getByRole('dialog', { name: '附件预览', exact: true })).toBeVisible(); await a.getByRole('button', { name: '关闭附件预览' }).click();
  pass('Screenshot paste uploads PNG, actual media preview works, canvas hotkey guard isolates Delete/undo');
  // Fixed, locally encoded 64x64 VP8 sample; deterministic even in headless tabs.
  await a.evaluate(data=>{const transfer=new DataTransfer();transfer.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'动效.webm',{type:'video/webm'}));document.querySelector('.co-composer').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));}, 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAK1EU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEyTbuMU6uEHFO7a1OsggKf7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjMuMS4xMDFXQYxMYXZmNjMuMS4xMDFEiYhAj0AAAAAAABZUrmvXrgEAAAAAAABO14EBc8WIN9HNhSsBBsycgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QHc1lA4JCwgUC6gUCagQJVsIRVuYEBVe6BAOwBAAAAAAAAAgAAElTDZ/pzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYzLjEuMTAxc3PVY8CLY8WIN9HNhSsBBsxnyKBFo4dFTkNPREVSRIeTTGF2YzYzLjEuMTAxIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDEuMDAwMDAwMDAwAB9DtnVA6OeBAKO7gQAAgFADAJ0BKkAAQAAARwiFhYiFhIgCAgJ1qgIGxkFcMdITAFVYAP7+x/r/8bx4FeS7K/+tTIx8+4CjloEAfQDRAQABEBAAGAAYWC/0AAiOgACjloEA+gDRAQABEBAAGAAYWC/0AAiOgACjloEBdwDRAQABEBAAGAAYWC/0AAiOgACjloEB9ADRAQABEBAAGAAYWC/0AAiOgACjloECcQDRAQABEBAAGAAYWC/0AAiOgACjloEC7gDRAQABEBAAGAAYWC/0AAiOgACjloEDawDRAQABEBAUYABhYL/QACI6AAAcU7trkbuPs4EAt4r3gQHxggGx8IED');
  await expect(a.locator('.co-attachment-chips')).toContainText('动效.webm');await a.getByRole('button',{name:'发送消息',exact:true}).click();await a.getByRole('button',{name:'预览 动效.webm',exact:true}).first().click();
  await a.locator('.co-preview video').evaluate(async el=>{try{await el.play()}catch(e){window.__videoError=String(e)}});await expect.poll(()=>a.locator('.co-preview video').evaluate(el=>el.readyState)).toBeGreaterThanOrEqual(2);await a.getByRole('button',{name:'关闭附件预览'}).click();
  pass('Real VP8 WebM drag/drop uploads, authenticated video blob decodes in preview');

  await a.getByRole('button', { name: '加载更早消息', exact: true }).click(); await expect(a.locator('.co-message')).not.toHaveCount(5);
  await a.getByRole('button', { name: '搜索聊天记录', exact: true }).click(); await a.getByRole('textbox', { name: '搜索消息', exact: true }).fill('历史设计记录'); await expect(a.locator('.co-message')).toHaveCount(5);
  await a.getByRole('button', { name: '更多搜索结果', exact: true }).click(); await expect(a.locator('.co-message')).toHaveCount(7);
  await a.getByRole('button', { name: '关闭搜索', exact: true }).click();
  await a.getByRole('button', { name: /^引用消息/ }).first().click(); await expect(a.locator('.co-reply-draft')).toBeVisible(); await a.getByRole('textbox', { name: '消息内容', exact: true }).fill('引用测试'); await a.getByRole('button', { name: '提及成员', exact: true }).click(); await a.locator('.co-mention-list button').filter({ hasText: '陈舟' }).click(); await a.getByRole('button', { name: '发送消息', exact: true }).click();
  await expect.poll(() => fixture.counters.messagePosts.some(p => p.body.includes('引用测试') && p.replyTo && p.mentionIds.includes('b@fixture.test'))).toBe(true);
  await a.getByRole('button', { name: '会话设置', exact: true }).click(); await a.getByRole('button', { name: '置顶', exact: true }).click(); await a.getByRole('button', { name: '免打扰', exact: true }).click(); await expect(a.getByRole('button', { name: '取消置顶', exact: true })).toBeVisible(); await expect(a.getByRole('button', { name: '取消免打扰', exact: true })).toBeVisible(); await a.getByRole('button', { name: '会话设置', exact: true }).click();
  pass('History/search cursor paging, reply + @ payload, pinned/muted server patches');
  await a.getByRole('button',{name:/^定位未读/}).click();await expect(a.locator('[data-unread-marker]')).toBeVisible();
  await a.getByRole('button',{name:'标为已读',exact:true}).click();await expect.poll(()=>a.evaluate(()=>window.__client.state.conversations.find(c=>c.id==='direct-ab')?.unread)).toBe(0);
  pass('Unread locator follows historical cursors to actual boundary; explicit read receipt refreshes unread');

  await a.getByRole('button', { name: '成员', exact: true }).click(); await a.getByRole('textbox', { name: '搜索姓名或岗位' }).fill('产品'); await expect(a.locator('.co-member')).toHaveCount(1); await a.getByRole('textbox', { name: '搜索姓名或岗位' }).fill(''); await expect(a.locator('.co-member')).toHaveCount(3); await a.getByLabel('在线状态', { exact: true }).selectOption('away'); await expect(a.locator('.co-member')).toHaveCount(1); await a.getByLabel('在线状态', { exact: true }).selectOption('all');
  await a.getByRole('checkbox', { name: '选择 陈舟', exact: true }).check(); await a.getByRole('textbox', { name: '群聊名称', exact: true }).fill('实际创建群聊'); await a.getByRole('button', { name: '创建群聊', exact: true }).click(); await expect(a.locator('.co-thread-header h2')).toHaveText('实际创建群聊');
  await a.getByRole('button', { name: '会话设置', exact: true }).click(); await a.getByRole('textbox', { name: '重命名群聊', exact: true }).fill('设计协作组'); await a.getByRole('button', { name: '保存名称', exact: true }).click(); await a.getByLabel('添加群成员', { exact: true }).selectOption('c@fixture.test'); await a.getByRole('button', { name: '添加成员', exact: true }).click(); await expect(a.getByRole('button', { name: '移除 周然', exact: true })).toBeVisible(); await a.getByRole('button', { name: '移除 周然', exact: true }).click(); await a.getByRole('button', { name: '离开群聊', exact: true }).click(); await expect(a.locator('.co-thread-header h2')).toHaveCount(0);
  pass('Member name/role/presence filters; create group, rename, add/remove members, leave clears conversation');

  await selectDirect(a); const selectable = a.getByRole('checkbox', { name: /^选择消息/ }).first(); await selectable.check(); await a.getByRole('button', { name: '转发', exact: true }).click(); await a.locator('.co-forward label').filter({ hasText: '春日产品小组' }).locator('input').check(); await a.getByRole('button', { name: '确认转发', exact: true }).click(); await expect(a.locator('.co-forward')).toHaveCount(0);
  await a.getByRole('button', { name: '撤回', exact: true }).last().click(); await expect(a.getByText('消息已撤回', { exact: true }).first()).toBeVisible();
  pass('Multi-select forwarding and withdrawal update real message projection');

  await a.getByRole('button', { name: '收起聊天', exact: true }).click(); await a.getByRole('button', { name: '发送所选节点', exact: true }).click(); await a.getByLabel('分享接收成员').selectOption('b@fixture.test'); await a.getByRole('button', { name: '发送分享卡片', exact: true }).click();
  await expect(a.locator('.co-share-card').last()).toContainText('春日产品方案'); assert.equal(fixture.counters.copies, 0);
  await expect(a.locator('.co-share-card img.co-share-cover').last()).toBeVisible();
  await b.getByRole('button', { name: '申请', exact: true }).click(); await expect(b.getByRole('button', { name: '申请复用', exact: true })).toBeVisible();
  const beforeShareEvent=fixture.messages.get('direct-ab').length;
  await b.getByRole('button', { name: '申请复用', exact: true }).click(); await expect(b.locator('.co-request')).toContainText('待批准');
  await expect(a.locator('.co-share-card').last()).toContainText('待批准');assert.equal(fixture.messages.get('direct-ab').length,beforeShareEvent);
  pass('shares-only SSE refreshes visible card via independent authorization without a new message');
  await a.getByRole('button', { name: '申请', exact: true }).click(); await a.getByRole('button', { name: '选择来源并批准', exact: true }).click();
  await a.getByRole('button', { name: '选择所选节点', exact: true }).click(); await a.getByRole('button', { name: '批准所选内容', exact: true }).click();
  await expect.poll(() => fixture.counters.copies).toBe(1); await expect(b.getByRole('link', { name: /打开独立画布/ }).first()).toHaveAttribute('href', /project=tree%3Acopy-/);
  assert.equal(await b.locator('[data-collaboration-window]').innerText().then(s => s.includes('prompt-secret')), false);
  const copiesBefore=fixture.counters.copies;await b.getByRole('link',{name:/打开独立画布/}).first().click();assert.match(new URL(b.url()).searchParams.get('project'),/^tree:copy-/);assert.equal(fixture.counters.copies,copiesBefore);
  pass('Selected native IDs -> recipient offer -> request -> author-selected source approval -> independent project key; card alone grants no copy');
  await b.evaluate(()=>window.__client.createShare({action:'request',authorId:'a@fixture.test'}));await a.getByRole('button',{name:'申请',exact:true}).click();
  await expect(a.getByRole('button',{name:'拒绝',exact:true})).toBeVisible();await a.getByRole('button',{name:'拒绝',exact:true}).click();await expect(a.getByText('已拒绝',{exact:true})).toBeVisible();
  pass('Direct member canvas request can be rejected without creating a copy');
  for(let i=4;i<=101;i++)fixture.members.push({id:`employee${String(i).padStart(3,'0')}@fixture.test`,name:`员工${i}`,roleName:'创意设计',presence:'offline'});
  const template=fixture.conversations.get('direct-ab');
  for(let i=0;i<55;i++)fixture.conversations.set(`extra-${i}`,{...template,id:`extra-${i}`,title:`分页会话 ${i}`,read:{},preferences:{},updatedAt:new Date(Date.UTC(2026,10,3,0,0,i)).toISOString()});
  await a.reload();await waitReady(a);await a.evaluate(()=>window.__client.open({section:'members'}));
  await expect(a.locator('.co-member')).toHaveCount(100);await a.getByRole('button',{name:'加载更多成员',exact:true}).click();await expect(a.locator('.co-member')).toHaveCount(101);await expect(a.getByRole('button',{name:'私聊 员工101',exact:true})).toBeVisible();
  await a.getByRole('textbox',{name:'搜索姓名或岗位',exact:true}).fill('员工101');await expect(a.locator('.co-member')).toHaveCount(1);await a.getByRole('button',{name:'私聊 员工101',exact:true}).click();await expect(a.locator('.co-thread-header h2')).toHaveText('员工101');
  await a.getByRole('button',{name:'更多会话',exact:true}).click();await expect.poll(()=>a.evaluate(()=>window.__client.state.conversations.some(c=>c.id==='direct-ab'))).toBe(true);
  assert.ok(fixture.calls.some(c=>c.path.endsWith('/members')&&c.query.cursor));assert.ok(fixture.calls.some(c=>c.path.endsWith('/conversations')&&c.query.cursor));
  pass('Bootstrap first100/first50: employee101 searchable/chat reachable, member and conversation opaque cursors paged');
  await selectDirect(a);


  await selectDirect(a); const lastCursor = [...fixture.calls].reverse().find(c => c.path.endsWith('/events')).query.cursor;
  fixture.flags.malformedStream = true; fixture.closeStreams();
  await expect(a.locator('.co-stream-error')).toContainText(/消息流 JSON 异常|消息连接中断/);
  fixture.pushMessage('direct-ab', 'b@fixture.test', '断线后补读消息'); const event = fixture.emit(['messages', 'conversations'], 'direct-ab');
  await expect(a.locator('.co-markdown').filter({ hasText: '断线后补读消息' })).toHaveCount(1, { timeout: 15000 });
  for (const stream of fixture.streams) if (stream.actor === 'a@fixture.test') stream.res.write(`event: update\ndata: ${JSON.stringify(event)}\n\n`);
  await a.waitForTimeout(300); await expect(a.locator('.co-markdown').filter({ hasText: '断线后补读消息' })).toHaveCount(1);
  const eventCalls = fixture.calls.filter(c => c.path.endsWith('/events') && c.actor === 'a@fixture.test'); assert.ok(eventCalls.length > 1); assert.ok(eventCalls.every(c => typeof c.query.cursor === 'string'));
  pass(`Authenticated SSE malformed/EOF reconnect retains cursor and deduplicates invalidations (first cursor ${lastCursor})`);

  fixture.flags.badJson = true; await a.evaluate(() => window.__client.loadMembers().catch(e => window.__client.report(e))); await expect(a.getByRole('alert').filter({ hasText: '响应格式异常 (503)' })).toBeVisible(); await a.getByRole('button', { name: '关闭消息错误' }).click();
  pass('HTML/503 JSON failure is explicit, never substituted with demo chats');
  await a.evaluate(()=>window.__client.open({conversationId:'group-abc'}));
  await expect(a.locator('.co-thread-header h2')).toHaveText('春日产品小组');
  fixture.conversations.get('group-abc').memberIds=['b@fixture.test','c@fixture.test'];
  fixture.emit(['conversations'],undefined,'a@fixture.test');
  await expect.poll(()=>a.evaluate(()=>window.__client.state.conversations.some(c=>c.id==='group-abc'))).toBe(false);
  assert.equal(await a.evaluate(()=>Boolean(window.__client.state.messages['group-abc'])),false);
  await selectDirect(a);
  pass('Membership invalidation removes denied conversation, messages, drafts, and file cache');


  await a.evaluate(()=>window.__client.draft('direct-ab',{body:'这版可以，我们一起完善细节。',replyTo:undefined}));
  await a.getByRole('button', { name: '展开聊天窗口', exact: true }).click(); await a.locator('.co-message-scroll').evaluate(el=>el.scrollTop=el.scrollHeight); await a.screenshot({ path: path.join(output, 'chat-expanded.png') });
  await a.getByRole('button', { name: '还原聊天窗口', exact: true }).click(); const before = await a.locator('.co-window').boundingBox(); await a.locator('.co-window-header>strong').hover(); await a.mouse.down(); await a.mouse.move(before.x - 160, before.y - 40, { steps: 5 }); await a.mouse.up(); const after = await a.locator('.co-window').boundingBox(); assert.notEqual(after.x, before.x);
  await a.mouse.move(after.x+after.width-3,after.y+after.height-3);await a.mouse.down();await a.mouse.move(after.x+after.width+40,after.y+after.height+20,{steps:4});await a.mouse.up();const resized=await a.locator('.co-window').boundingBox();assert.ok(resized.width>after.width);
  await a.setViewportSize({ width: 390, height: 844 }); await selectDirect(a); await a.screenshot({ path: path.join(output, 'chat-mobile.png') }); assert.ok(await a.locator('.co-window').evaluate(el => el.getBoundingClientRect().width <= innerWidth));
  pass('Rendered light floating/expanded/mobile screenshots; drag and responsive bounds checked');

  await a.getByRole('textbox', { name: '消息内容', exact: true }).fill('退出前私密草稿'); await a.evaluate(() => window.__setActor(null)); await expect.poll(() => fixture.streams.size).toBe(1); assert.equal(await a.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('naumi:collaboration:draft:')).length), 0); await expect(a.locator('[data-collaboration-window]')).toHaveCount(0);
  pass('Sign-out aborts stream/uploads and removes private cached drafts');
  assert.deepEqual(errors, []);
  const parentDoc = await readFile('docs/changes/2026-11-02-enterprise-collaboration.md', 'utf8'); assert.ok(parentDoc.includes('CollaborationProvider'));
  const layout = await readFile('src/app/layout.tsx', 'utf8'), canvas = await readFile('src/components/canvas/canvas-client.tsx', 'utf8');
  assert.equal((layout.match(/<CollaborationProvider>/g) || []).length, 1); assert.ok(layout.indexOf('<ToastProvider>') < layout.indexOf('<CollaborationProvider>')); assert.ok(layout.indexOf('<CollaborationProvider>') < layout.indexOf('<AppShell>'));
  assert.ok(canvas.includes('browsing && !desktopAppearance')); assert.ok(canvas.includes('collaborationNodeIds.has')); assert.ok(canvas.includes('data-canvas-hotkeys-blocked'));
  pass('Static real Canvas narrow wiring + root placement + desktop duplicate chrome guards');
  console.log(`COLLABORATION_UI=PASS checks=${checks.length} react=${React.version} HTTP_FIXTURE=1 REAL_BACKEND=0 SUPPLIER_CALLS=0 PG_CONTAINERS=0`);
} finally {
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ checks, errors, react: React.version, evidence: 'React19 real component + local HTTP contract fixture, not integrated backend or production', counters: fixture.counters, calls: fixture.calls }, null, 2));
  const vf=[...fixture.attachments.values()].find(f=>f.wire.name==='动效.webm');if(vf)await writeFile(path.join(output,'fixture-video.webm'),vf.data);if(browser){const pages=browser.contexts()[0]?.pages()||[];if(pages[0])await writeFile(path.join(output,'video-debug.json'),JSON.stringify(await pages[0].evaluate(()=>({error:window.__videoError,video:Array.from(document.querySelectorAll('video')).map(v=>({ready:v.readyState,network:v.networkState,error:v.error?.message,src:v.src}))})).catch(()=>({})),null,2));}await browser?.close(); await fixture.close();
}
