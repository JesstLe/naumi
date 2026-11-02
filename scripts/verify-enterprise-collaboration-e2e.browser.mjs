import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';

export async function runBrowser({ origin, info, out, phase, log }) {
  let browser; const contexts = [], checks = [], errors = [], external = [], pages = [];
  const pass = s => { checks.push(s); log(`PASS ${s}`); };
  const api = async (context, route, data, method = data === undefined ? 'GET' : 'POST', expected = 200) => {
    const res = await context.request.fetch(`${origin}${route}${route.includes('?') ? '&' : '?'}enterpriseId=${info.enterprise}`, { method, data, headers: { origin, 'x-naumi-workspace': info.enterprise } });
    const body = await res.json(); assert.equal(res.status(), expected, JSON.stringify(body)); return body;
  };
  const state = p => p.evaluate(() => ({ status: window.__e2e?.client.state.status, count: window.__e2e?.client.state.conversations.length, unread: window.__e2e?.client.entrySnapshot().unread, ids: window.__e2e?.client.state.conversations.map(c => c.id) }));
  const close = async p => { if (await p.locator('[data-collaboration-window]').count()) await p.getByRole('button', { name: '收起聊天', exact: true }).click(); };
  try {
    browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
    for (const actor of [info.author, info.recipient]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); contexts.push(context);
      await context.route('**/*', route => { const u = new URL(route.request().url()); if (!['127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) { external.push(u.origin); return route.abort(); } return route.continue(); });
      await api(context, '/api/auth/login', { email: actor, password: info.password });
      const session = await api(context, '/api/auth/session'); assert.equal(session.user.email, actor);
      const cookies = await context.cookies(); assert.ok(cookies.some(c => c.name === 'nv_user' && c.httpOnly));
      const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
      await page.goto(origin + '/canvas'); await expect.poll(async () => (await state(page)).status, { timeout: 60000 }).toBe('ready');
    }
    const [a, b] = pages, [ac, bc] = contexts;
    const verifyGeneration = async () => {
    await close(a); await a.goto(origin + '/canvas?project=' + encodeURIComponent(info.projectKey));
    await expect(a.locator('.react-flow__node[data-id="text-e2e"]')).toBeVisible();
    const generate = async prompt => {
      await a.locator('.react-flow__node[data-id="text-e2e"]').getByTestId('text-node-title').click();
      await a.getByTestId('text-node-dock').locator('textarea').fill(prompt);
      await a.getByTestId('text-node-dock').getByRole('button', { name: '文字生成', exact: true }).click();
      await expect.poll(async () => (await fetch(origin + '/__fixture/checks').then(r => r.json())).generations.some(g => g.prompt === prompt)).toBe(true);
    };
    await generate('离开项目继续完成');
    await a.getByTestId('canvas-project-chrome').locator('button').first().click(); await a.getByRole('button', { name: '全部项目', exact: true }).first().click();
    await a.getByTestId('canvas-project-browser').getByRole('button', { name: /文字生成 原作者的独立文案/ }).click();
    await expect(a.locator('.react-flow__node[data-id="text-other"]')).toBeVisible();
    await api(ac, '/__fixture/generation-release', { prompt: '离开项目继续完成' });
    await expect.poll(async () => (await api(ac, '/api/canvas/text-nodes')).nodes.find(n => n.id === 'text-e2e').content).toBe('本地测试生成：离开项目继续完成');
    assert.equal((await fetch(origin + '/__fixture/checks').then(r => r.json())).generations[0].aborted, false);
    pass('Full Canvas text generation with explicit local supplier port survives project departure and persists original project');
    await a.getByTestId('canvas-project-chrome').locator('button').first().click(); await a.getByRole('button', { name: '全部项目', exact: true }).first().click(); await a.getByTestId('canvas-project-browser').getByRole('button', { name: '春日产品方案', exact: true }).click();
    await generate('换号后的旧生成结果');
    for (const actor of [info.recipient, info.author]) { const login = await api(ac, '/api/auth/login', { email: actor, password: info.password }); await a.evaluate(user => window.__e2e.auth.applyServerUser(user, true), login.user); await expect.poll(async () => a.evaluate(() => window.__e2e.client.state.account)).toBe(actor); }
    await api(ac, '/__fixture/generation-release', { prompt: '换号后的旧生成结果' });
    await expect.poll(async () => (await fetch(origin + '/__fixture/checks').then(r => r.json())).generations[1].released).toBe(true);
    await a.waitForTimeout(500);
    assert.equal((await api(ac, '/api/canvas/text-nodes')).nodes.find(n => n.id === 'text-e2e').content, '本地测试生成：离开项目继续完成');
    assert.ok(!(await api(bc, '/api/canvas/text-nodes')).nodes.some(n => n.content.includes('换号后的旧生成结果')));
    pass('Real login A-B-A fences old Canvas generation continuation; recipient native persistence unchanged');
    };
    await a.getByTestId('canvas-project-browser').getByRole('button', { name: '春日产品方案', exact: true }).click();
    await expect(a.locator('.react-flow__node[data-id="e2e-source"]')).toBeVisible();
    await expect(a.locator('.react-flow__node[data-id="text-e2e"]')).toBeVisible();
    pass('React19 actual AuthProvider/password signed login + full CanvasClient/ReactFlow + real PG native nodes');
    if (phase === 'GENERATION') { await verifyGeneration(); log('COLLABORATION_GENERATION=PASS'); return { checks, errors, external }; }
    const boot = await api(bc, '/api/collaboration/bootstrap');
    assert.equal(boot.conversations.length, 50); assert.ok(!boot.conversations.some(c => c.id === info.lastId));
    const before = await state(b);
    await api(ac, `/api/collaboration/conversations/${info.lastId}/messages`, { clientId: randomUUID(), body: '最后页实时消息' });
    if (phase !== 'MODIFIED') {
      await b.waitForTimeout(3000); const after = await state(b);
      assert.equal(boot.unreadTotal, undefined); assert.equal(before.unread, 0); assert.equal(after.unread, 0); assert.ok(!after.ids.includes(info.lastId));
      await a.screenshot({ path: path.join(out, 'baseline-actual-canvas.png') });
      log('COLLABORATION_E2E_BASELINE=REPRODUCED unread_total_missing=1 last_page_event_lost=1 full_canvas=1 suppliers=0');
      return { checks, errors, external, reproduced: 2 };
    }
    assert.equal(boot.unreadTotal, 1); assert.equal(before.unread, 1);
    await expect.poll(async () => (await state(b)).unread).toBe(2);
    await expect.poll(async () => (await state(b)).ids.includes(info.lastId)).toBe(true);
    await b.getByRole('button', { name: /^消息/ }).first().click();
    await b.locator('.co-conversation').filter({ hasText: info.lastTitle }).click();
    await expect(b.locator('.co-message').filter({ hasText: '最后页实时消息' })).toBeVisible();
    pass('56 conversations: full unread total and unseen last-page SSE targeted fetch opens real messages');
    // Capture only this browser's real event transport, separate from API probes.
    const eventReads = [];
    const observeEvent = request => { if (request.method() === 'GET' && request.url().includes('/api/collaboration/')) eventReads.push(new URL(request.url()).pathname); };
    b.on('request', observeEvent);
    await api(ac, `/api/collaboration/conversations/${info.firstId}/messages`, { clientId: randomUUID(), body: '有界事件读取' });
    await expect.poll(async () => (await state(b)).unread).toBe(3);
    b.off('request', observeEvent);
    assert.ok(eventReads.includes(`/api/collaboration/conversations/${info.firstId}`));
    assert.ok(!eventReads.includes('/api/collaboration/bootstrap') && !eventReads.includes('/api/collaboration/conversations'));
    const firstMessages = await api(bc, `/api/collaboration/conversations/${info.firstId}/messages`);
    await api(bc, `/api/collaboration/conversations/${info.firstId}/read`, { messageId: firstMessages.items[0].id });
    await expect.poll(async () => (await state(b)).unread).toBe(2);
    await b.getByRole('button', { name: '标为已读', exact: true }).click();
    await expect.poll(async () => (await state(b)).unread).toBe(0);
    // Author's own post and withdrawn posts never inflate recipient/author totals.
    const own = await api(bc, `/api/collaboration/conversations/${info.lastId}/messages`, { clientId: randomUUID(), body: '本人不算未读' });
    assert.equal((await api(bc, '/api/collaboration/bootstrap')).unreadTotal, 0);
    const withdrawn = await api(ac, `/api/collaboration/conversations/${info.lastId}/messages`, { clientId: randomUUID(), body: '即将撤回' });
    await api(ac, `/api/collaboration/messages/${withdrawn.message.id}/withdraw`, {});
    assert.equal((await api(bc, '/api/collaboration/bootstrap')).unreadTotal, 0);
    await api(bc, `/api/collaboration/conversations/${info.lastId}`, { leave: true }, 'PATCH');
    await api(ac, `/api/collaboration/conversations/${info.lastId}/messages`, { clientId: randomUUID(), body: '退出期间不算未读' });
    assert.equal((await api(bc, '/api/collaboration/bootstrap')).unreadTotal, 0);
    await api(ac, `/api/collaboration/conversations/${info.lastId}`, { addMemberIds: [info.recipient] }, 'PATCH');
    assert.equal((await api(bc, '/api/collaboration/bootstrap')).unreadTotal, 0);
    const current = await api(bc, `/api/collaboration/conversations/${info.lastId}/messages`); assert.equal(current.items.length, 0);
    await api(ac, `/api/collaboration/conversations/${info.lastId}/messages`, { clientId: randomUUID(), body: '重新加入后的新消息' });
    await expect.poll(async () => (await state(b)).unread).toBe(1);
    pass('Unread aggregate honors own/withdrawn/read/joined/left/rejoined intervals with real membership writes');
    const requestsBefore = (await fetch(origin + '/__fixture/checks').then(r => r.json())).calls;
    assert.ok(requestsBefore.some(c => c.method === 'GET' && c.path === `/api/collaboration/conversations/${info.lastId}`));
    assert.ok(requestsBefore.filter(c => c.path === '/api/collaboration/bootstrap').length < 20);
    pass('Event resolves authorized conversation id without walking later pages or bootstrap loops');

    const open = async p => { if (!await p.locator('[data-collaboration-window]').count()) await p.locator('[data-collaboration-entry]').first().click(); };
    const memberTab = p => p.locator('.co-window-nav').getByRole('button', { name: '成员', exact: true }).click();
    const send = async (p, body) => { await p.getByRole('textbox', { name: '消息内容', exact: true }).fill(body); await p.locator('.co-composer').getByRole('button', { name: '发送消息', exact: true }).click(); await expect(p.locator('.co-pending')).toHaveCount(0); };
    await open(a); await memberTab(a);
    await expect(a.locator('.co-member').filter({ hasText: '陈舟' }).locator('.co-presence.online')).toBeVisible();
    await a.getByRole('button', { name: '私聊 陈舟', exact: true }).click();
    await expect(a.locator('.co-thread-header h2')).toHaveText('陈舟');
    const direct = await a.evaluate(() => window.__e2e.client.state.activeId);
    await send(a, '**真实 Markdown** <img src=x onerror="window.__xss=1"> [危险](javascript:alert(1))');
    await b.evaluate(id => window.__e2e.client.open({ conversationId: id }), direct);
    await expect(b.locator('.co-markdown strong')).toHaveText('真实 Markdown');
    assert.equal(await b.locator('.co-markdown img,.co-markdown script,.co-markdown [onerror],.co-markdown a[href^="javascript:"]').count(), 0);
    assert.equal(await b.evaluate(() => window.__xss), undefined);
    pass('Ordinary employees initiate actual direct chat with resolved names; Markdown renders, raw HTML never executes');

    // Network-offline context: server presence expires, SSE reconnect catches up.
    await bc.setOffline(true); await memberTab(a);
    await expect.poll(async () => (await api(ac, '/api/collaboration/members')).items.find(m => m.id === info.recipient).presence, { timeout: 25000, intervals: [1000] }).toBe('offline');
    await a.getByRole('button', { name: '私聊 陈舟', exact: true }).click(); await send(a, '离线期间的真实持久消息');
    await bc.setOffline(false);
    await expect(b.locator('.co-message').filter({ hasText: '离线期间的真实持久消息' })).toBeVisible({ timeout: 35000 });
    pass('Online/offline presence TTL and two-context SSE reconnect recover durable offline messages');

    await memberTab(a); await a.getByLabel('选择 陈舟', { exact: true }).check(); await a.getByLabel('选择 周岚', { exact: true }).check();
    await a.getByLabel('群聊名称', { exact: true }).fill('产品联调群'); await a.getByRole('button', { name: '创建群聊', exact: true }).click();
    await send(a, '真实群聊消息'); const group = await a.evaluate(() => window.__e2e.client.state.activeId);
    await b.evaluate(id => window.__e2e.client.open({ conversationId: id }), group); await expect(b.locator('.co-message').filter({ hasText: '真实群聊消息' })).toBeVisible();
    await api(bc, `/api/collaboration/conversations/${group}`, { removeMemberIds: [info.author] }, 'PATCH', 403);
    pass('Real group create/message and ordinary non-owner member mutation denied');
    await a.evaluate(id => window.__e2e.client.open({ conversationId: id }), direct); await b.evaluate(id => window.__e2e.client.open({ conversationId: id }), direct);

    const zip = new JSZip(); zip.file('design.txt', 'explicit user chosen work file\n' + 'Z'.repeat(200000)); const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
    let holdPart, partHeld = false;
    const partGate = new Promise(resolve => { holdPart = resolve; });
    await ac.route('**/api/collaboration/uploads/*?*part=1', async route => { partHeld = true; await partGate; await route.continue().catch(() => {}); });
    await a.getByLabel('选择聊天附件').setInputFiles({ name: '产品设计.zip', mimeType: 'application/zip', buffer: archive });
    await expect.poll(() => partHeld).toBe(true);
    const upload = await a.evaluate(() => ({ id: window.__e2e.client.state.uploads[0].upload.id, generation: window.__e2e.client.generation }));
    await a.getByRole('button', { name: '暂停 产品设计.zip', exact: true }).click(); holdPart(); await ac.unroute('**/api/collaboration/uploads/*?*part=1');
    await a.getByRole('textbox', { name: '消息内容', exact: true }).fill('跨画布与桌面的草稿');
    await close(a);
    await a.getByTestId('canvas-project-chrome').locator('button').first().click(); await a.getByRole('button', { name: '全部项目', exact: true }).first().click();
    await a.getByTestId('canvas-project-browser').getByRole('button', { name: /文字生成 原作者的独立文案/ }).click();
    await expect(a.locator('.react-flow__node[data-id="text-other"]')).toBeVisible();
    await a.evaluate(() => window.__route('/desktop')); await expect(a.locator('[data-desktop]')).toBeVisible();
    await open(a); await expect(a.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('跨画布与桌面的草稿');
    assert.equal(await a.evaluate(() => window.__e2e.client.generation), upload.generation);
    await a.getByRole('button', { name: '重试 产品设计.zip', exact: true }).click();
    await expect(a.locator('.co-attachment-chips')).toContainText('产品设计.zip');
    await a.locator('.co-composer').getByRole('button', { name: '发送消息', exact: true }).click();
    const downloadWait = b.waitForEvent('download'); await b.getByRole('button', { name: '下载 产品设计.zip', exact: true }).click();
    const downloaded = await downloadWait; assert.equal(createHash('sha256').update(await readFile(await downloaded.path())).digest('hex'), createHash('sha256').update(archive).digest('hex'));
    const uploaded = await api(ac, `/api/collaboration/uploads/${upload.id}`); assert.deepEqual(uploaded.upload.uploadedParts, [0, 1, 2, 3]);
    await a.screenshot({ path: path.join(out, 'desktop-chat-upload.png') });
    pass('Actual ZIP/private storage 0-based chunks pause + project/desktop draft preservation + same-upload resume + real download SHA256');

    const png = await readFile(path.join(out, 'paste.png'));
    await a.getByRole('textbox', { name: '消息内容', exact: true }).evaluate((el, bytes) => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], '截图.png', { type: 'image/png' })); el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: dt })); }, [...png]);
    await expect(a.locator('.co-attachment-chips')).toContainText('截图.png'); await a.locator('.co-composer').getByRole('button', { name: '发送消息', exact: true }).click();
    const imageMessage = (await api(bc, `/api/collaboration/conversations/${direct}/messages`)).items.find(m => m.attachments.some(at => at.name === '截图.png'));
    assert.equal(imageMessage.attachments[0].mime, 'image/png');
    const screenshotDownload = b.waitForEvent('download'); await b.getByRole('button', { name: '下载 截图.png', exact: true }).click();
    assert.equal(createHash('sha256').update(await readFile(await (await screenshotDownload).path())).digest('hex'), createHash('sha256').update(png).digest('hex'));
    pass('Screenshot clipboard uses real upload signature MIME and actual authorized download hash');

    await close(a); await a.evaluate(key => window.__route('/canvas?project=' + encodeURIComponent(key)), info.projectKey);
    await expect(a.locator('.react-flow__node[data-id="e2e-source"]')).toBeVisible();
    await a.locator('.react-flow__node[data-id="e2e-source"]').click({ position: { x: 120, y: 100 } });
    const selectionBefore = await a.locator('.react-flow__node.selected').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-id')));
    const viewportBefore = await a.locator('.react-flow__viewport').getAttribute('style');
    await open(a); await a.getByRole('textbox', { name: '消息内容', exact: true }).fill('聊天按键');
    await a.getByRole('textbox', { name: '消息内容', exact: true }).press('Control+a'); await a.getByRole('textbox', { name: '消息内容', exact: true }).press('Backspace');
    await a.getByRole('textbox', { name: '消息内容', exact: true }).press('Delete');
    assert.deepEqual(await a.locator('.react-flow__node.selected').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-id'))), selectionBefore);
    assert.equal(await a.locator('.react-flow__viewport').getAttribute('style'), viewportBefore);
    await close(a); await send(b, '收起时不改变画布选择');
    await expect.poll(async () => (await state(a)).unread).toBeGreaterThan(0);
    assert.equal(await a.locator('[data-collaboration-window]').count(), 0);
    assert.deepEqual(await a.locator('.react-flow__node.selected').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-id'))), selectionBefore);
    pass('Real Canvas selection/viewport survive chat Delete/Backspace and collapsed incoming messages without focus theft');

    // Actual artwork context menu -> card; entire workflow -> offer -> request.
    await a.locator('.react-flow__node[data-id="e2e-source"]').click({ button: 'right', position: { x: 120, y: 100 } });
    await a.getByText('发送作品给同事', { exact: true }).click(); await a.getByLabel('分享接收成员').selectOption(info.recipient); await a.getByRole('button', { name: '发送分享卡片', exact: true }).click();
    await expect(b.locator('.co-share-card')).toHaveCount(1);
    const artShare = (await api(ac, '/api/collaboration/shares?direction=sent')).items[0]; assert.equal(artShare.kind, 'artwork');
    await close(a); await a.getByRole('button', { name: '发送画布', exact: true }).click(); await a.getByLabel('分享接收成员').selectOption(info.recipient); await a.getByRole('button', { name: '发送分享卡片', exact: true }).click();
    await expect(b.locator('.co-share-card')).toHaveCount(2);
    const workflow = (await api(ac, '/api/collaboration/shares?direction=sent')).items.find(s => s.kind === 'workflow'); assert.ok(workflow);
    const card = b.locator('.co-share-card').last(); await card.getByRole('button', { name: '查看申请' }).click();
    const requestRow = b.locator('.co-request').filter({ has: b.getByRole('button', { name: '申请复用', exact: true }) }).filter({ hasText: workflow.title }).last();
    await requestRow.getByRole('button', { name: '申请复用', exact: true }).click();
    await expect(a.locator('.co-share-card').last()).toContainText('待批准');
    pass('Real artwork/workflow cards and shares-only SSE refresh existing card without a new message');
    await a.locator('.co-window-nav').getByRole('button', { name: '申请', exact: true }).click();
    await a.getByRole('button', { name: '选择来源并批准', exact: true }).click(); await a.getByRole('link', { name: /选择来源画布/ }).click();
    await expect(a.getByTestId('canvas-project-browser')).toBeVisible();
    await a.getByTestId('canvas-project-browser').getByRole('button', { name: '春日产品方案', exact: true }).click();
    await expect(a.locator('.co-approval-inline')).toBeVisible();
    await a.locator('[data-tool="image-node"]').click();
    await expect(a.getByRole('button', { name: '选择所选节点', exact: true })).toBeDisabled();
    assert.equal(await a.evaluate(() => window.__e2e.client.state.pendingShare), null);
    pass('Unsaved selected pending node never silently approves the whole canvas');
    // Clear the earlier image selection: author approves their whole persisted canvas.
    await a.locator('.react-flow__pane').click({ position: { x: 950, y: 730 } });
    await a.getByRole('button', { name: '选择此画布', exact: true }).click(); await a.getByRole('button', { name: '批准所选内容', exact: true }).click();
    await expect(b.getByRole('link', { name: /打开独立画布/ })).toBeVisible();
    const approved = (await api(bc, `/api/collaboration/shares/${workflow.id}`)).share;
    assert.ok(approved.resultProjectKey); assert.equal((await api(ac, `/api/collaboration/shares/${workflow.id}`)).share.resultProjectKey, null);
    await b.getByRole('link', { name: /打开独立画布/ }).click(); await close(b);
    await expect(b.locator('.react-flow__node')).toHaveCount(2, { timeout: 20000 });
    const originalText = await b.getByRole('textbox', { name: '编辑生成文本', exact: true }).inputValue(); assert.equal(originalText, '原作者的独立文案');
    await b.getByRole('textbox', { name: '编辑生成文本', exact: true }).fill('接收者独立编辑后的文案'); await b.locator('.react-flow__pane').click({ position: { x: 950, y: 730 } });
    await expect.poll(async () => (await api(bc, '/api/canvas/text-nodes')).nodes.find(n => n.projectKey === approved.resultProjectKey)?.content).toBe('接收者独立编辑后的文案');
    assert.equal((await api(ac, '/api/canvas/text-nodes')).nodes.find(n => n.id === 'text-e2e').content, '原作者的独立文案');
    await b.reload(); await expect(b.getByRole('textbox', { name: '编辑生成文本', exact: true })).toHaveValue('接收者独立编辑后的文案', { timeout: 25000 });
    await b.screenshot({ path: path.join(out, 'recipient-independent-canvas-reloaded.png') });
    pass('Author chooses owned native project; approval creates independent editable CanvasClient result; recipient edits persist across reload without source changes');
    await a.screenshot({ path: path.join(out, 'author-approved-canvas-chat.png') });

    // Real A -> B -> A logins; a deliberately held real response must not revive A's old generation.
    let release, held = false; const gate = new Promise(r => { release = r; });
    await ac.route('**/api/collaboration/conversations/*/messages?*', async route => { if (route.request().method() !== 'GET' || held) return route.continue(); const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => {}); });
    await a.evaluate(id => { void window.__e2e.client.loadMessages(id).catch(() => {}); }, direct); await expect.poll(() => held).toBe(true);
    const oldGeneration = await a.evaluate(() => window.__e2e.client.generation);
    for (const actor of [info.recipient, info.author]) { const login = await api(ac, '/api/auth/login', { email: actor, password: info.password }); await a.evaluate(user => window.__e2e.auth.applyServerUser(user, true), login.user); await expect.poll(async () => a.evaluate(() => window.__e2e.client.state.account)).toBe(actor); }
    release(); await ac.unroute('**/api/collaboration/conversations/*/messages?*');
    await expect.poll(async () => (await state(a)).status).toBe('ready');
    assert.ok(await a.evaluate(n => window.__e2e.client.generation > n, oldGeneration));
    assert.equal(await a.evaluate(id => window.__e2e.client.state.messages[id], direct), undefined);
    pass('Actual signed A-B-A login fences old fetch continuation and clears account-private state');
    await verifyGeneration();
    const evidence = await fetch(origin + '/__fixture/checks').then(r => r.json());
    assert.equal(evidence.supplierCalls, 0); assert.equal(evidence.ledger, 0); assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await writeFile(path.join(out, 'http-evidence.json'), JSON.stringify(evidence, null, 2));
    log(`COLLABORATION_E2E=PASS checks=${checks.length} full_canvas=1 real_auth=1 real_pg=1 suppliers=0`);
    return { checks, errors, external };
  } finally {
    for (let n = 0; n < pages.length; n++) { await pages[n].screenshot({ path: path.join(out, `final-${n}.png`) }).catch(() => {}); await writeFile(path.join(out, `final-${n}.txt`), await pages[n].locator('body').innerText().catch(() => '')).catch(() => {}); await writeFile(path.join(out, `final-state-${n}.json`), JSON.stringify(await pages[n].evaluate(() => window.__e2e?.client.state).catch(() => null), null, 2)); }
    await writeFile(path.join(out, 'browser-result.json'), JSON.stringify({ checks, errors, external }, null, 2));
    for (const context of contexts) await context.close(); if (browser) await browser.close(); log(`BROWSER_CLEANUP=PASS contexts=${contexts.length} browser_closed=1`);
  }
}
