import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

/** Stateful local-only contract fixture. This is NOT the collaboration backend. */
export async function startFixture(assets) {
  const A = 'a@fixture.test', B = 'b@fixture.test', C = 'c@fixture.test';
  const members = [{ id: A, name: '林夏', roleName: '视觉设计', presence: 'online' }, { id: B, name: '陈舟', roleName: '产品经理', presence: 'online' }, { id: C, name: '周然', roleName: '品牌运营', presence: 'away' }];
  const conversations = new Map(), messages = new Map(), uploads = new Map(), attachments = new Map(), shares = new Map(), operations = new Map();
  const streams = new Set(), events = [], calls = [], counters = { messagePosts: [], connections: 0, maxConcurrent: 0, chunks: [], cancellations: 0, copies: 0 };
  const flags = { loseAck: false, slowPart: false, denyAttachment: false, badJson: false, malformedStream: false, delayMembers: 0 };
  let sequence = 0, eventSequence = 0;
  const now = () => new Date(Date.UTC(2026, 10, 2, 2, 0, sequence++)).toISOString();
  const makeConversation = (id, kind, ids, title, ownerId = A) => ({ id, enterpriseId: 'enterprise-fixture', kind, title, memberIds: ids, ownerId, lastMessage: null, unread: 0, lastReadMessageId: null, pinned: false, muted: false, updatedAt: now(), read: {}, preferences: {} });
  conversations.set('direct-ab', makeConversation('direct-ab', 'direct', [A, B], '产品设计'));
  conversations.set('group-abc', makeConversation('group-abc', 'group', [A, B, C], '春日产品小组'));
  function publicConversation(c, actor) { const all = messages.get(c.id) || [], lastRead = c.read[actor] || null, readIndex = all.findIndex(m => m.id === lastRead); const { read, preferences, ...wire } = c; return { ...wire, ...preferences[actor], lastMessage: all.at(-1) || null, lastReadMessageId: lastRead, unread: all.slice(readIndex + 1).filter(m => m.senderId !== actor && !m.withdrawnAt).length }; }
  const visibleConversations = actor => [...conversations.values()].filter(c => c.memberIds.includes(actor));
  const unreadTotal = actor => visibleConversations(actor).reduce((total, c) => total + publicConversation(c, actor).unread, 0);
  const conversationPage = (actor, cursor) => ({ ...paginate(visibleConversations(actor).map(c => publicConversation(c, actor)).sort((a, b) => b.id.localeCompare(a.id)), cursor, 50), unreadTotal: unreadTotal(actor) });
  function pushMessage(conversationId, senderId, body, extra = {}) {
    const createdAt = now(), id = `message-${String(sequence).padStart(4, '0')}`;
    const message = { id, conversationId, senderId, clientId: `seed-${id}`, body, createdAt, withdrawnAt: null, replyTo: null, attachmentIds: [], attachments: [], mentionIds: [], shareId: null, ...extra };
    const list = messages.get(conversationId) || []; list.push(message); messages.set(conversationId, list); conversations.get(conversationId).updatedAt = createdAt; return message;
  }
  for (let i = 0; i < 7; i++) pushMessage('direct-ab', i % 2 ? A : B, `历史设计记录 ${i + 1}`);
  pushMessage('direct-ab', B, '新版产品方案已整理好。\n\n**柔和的自然光**，搭配浅色背景，大家看看这个方向。');
  pushMessage('direct-ab', A, '收到，我来补充商品细节与包装质感 👍');
  pushMessage('direct-ab', B, '好，我们把素材放在这里，方便一起查看。');
  pushMessage('group-abc', C, '欢迎加入春日产品小组 🎉');
  function emit(topics = ['conversations', 'messages'], conversationId, actor) {
    const event = { id: String(++eventSequence), type: 'invalidate', topics, ...(conversationId ? { conversationId } : {}) };
    const record = { event, actor }; events.push(record);
    for (const stream of streams) if ((!actor || actor === stream.actor) && (!conversationId || conversations.get(conversationId)?.memberIds.includes(stream.actor))) stream.res.write(`event: update\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
    return event;
  }
  const json = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }); res.end(JSON.stringify(data)); };
  const fail = (res, error, status) => json(res, { error }, status);
  const body = async req => { const chunks = []; for await (const part of req) chunks.push(part); return Buffer.concat(chunks); };
  const paginate = (items, cursor, size = 5) => { const offset = Number(cursor || 0); return { items: items.slice(offset, offset + size), nextCursor: offset + size < items.length ? String(offset + size) : null }; };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1'), pathname = url.pathname.replace(/^\/desktop\/api\//, '/api/');
    if (!pathname.startsWith('/api/')) { const file = assets.get(pathname) || assets.get('/'); res.writeHead(200, { 'Content-Type': file.type }); res.end(file.body); return; }
    const actor = req.headers.authorization?.replace('Bearer ', '');
    calls.push({ actor, method: req.method, path: pathname, query: Object.fromEntries(url.searchParams), time: Date.now() });
    try {
      if (![A, B, C].includes(actor)) return fail(res, '请登录', 401);
      if (pathname === '/api/account') return json(res, { user: { email: actor }, artworks: [{ id: 'artwork-a', image: '/fixture-product.svg', title: '春日产品视觉', status: 'completed', origin: 'canvas', groupId: 'source-a', createdAt: '2026-11-02T01:00:00Z' }, { id: 'artwork-old', image: '/fixture-product.svg', title: '旧项目', status: 'completed', origin: 'canvas', groupId: 'old', createdAt: '2026-10-01T01:00:00Z' }] });
      if (pathname === '/api/canvas/text-nodes') return json(res, { nodes: [{ id: 'text-a', projectKey: 'tree:source-a', title: '春日产品', updatedAt: '2026-11-02T02:00:00Z' }] });
      if (pathname === '/api/projects') return json(res, { names: { 'tree:old': '旧项目', 'tree:source-a': '春日产品方案' } });
      const path = pathname.slice('/api/collaboration'.length), enterprise = url.searchParams.get('enterpriseId') || 'enterprise-fixture';
      if (path !== '/bootstrap' && !url.searchParams.has('enterpriseId')) return fail(res, '缺少企业', 400);
      if (flags.badJson && path === '/members') { flags.badJson = false; res.writeHead(503, { 'Content-Type': 'text/html' }); return res.end('<html>fixture failure</html>'); }
      if (path === '/bootstrap') {
        const memberPage = paginate(members, undefined, 100), page = conversationPage(actor);
        return json(res, { actorId: actor, enterpriseId: enterprise, enterprises: [{ id: 'enterprise-fixture', name: 'Naumi 创意团队' }, { id: 'enterprise-second', name: '另一企业' }], members: memberPage.items, membersNextCursor: memberPage.nextCursor, conversations: page.items, conversationsNextCursor: page.nextCursor, unreadTotal: page.unreadTotal, cursor: String(eventSequence), limits: { attachmentBytes: 20 * 1024 * 1024, chunkBytes: 16 * 1024 } });
      }
      if (path === '/members') { if (flags.delayMembers) await new Promise(r => setTimeout(r, flags.delayMembers)); const q = url.searchParams.get('q') || ''; return json(res, paginate(members.filter(m => (m.name + m.roleName).includes(q)), url.searchParams.get('cursor'), 100)); }
      if (path === '/presence') { const value = JSON.parse((await body(req)).toString()); const member = members.find(m => m.id === actor); member.presence = value.state; return json(res, { ok: true }); }
      if (path === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        const stream = { actor, res }; streams.add(stream); counters.connections++; counters.maxConcurrent = Math.max(counters.maxConcurrent, streams.size);
        if (flags.malformedStream) { flags.malformedStream = false; res.write('event: update\ndata: broken-json\n\n'); res.end(); }
        else {
          const cursor = Number(url.searchParams.get('cursor') || 0);
          for (const record of events.filter(e => Number(e.event.id) > cursor)) if ((!record.actor || record.actor === actor) && (!record.event.conversationId || conversations.get(record.event.conversationId)?.memberIds.includes(actor))) res.write(`event: update\ndata: ${JSON.stringify(record.event)}\n\n`);
          res.write('event: heartbeat\ndata: {}\n\n');
        }
        const timer = setInterval(() => { if (!res.destroyed) res.write('event: heartbeat\ndata: {}\n\n'); }, 5000);
        res.on('close', () => { clearInterval(timer); streams.delete(stream); }); return;
      }
      if (path === '/conversations' && req.method === 'GET') return json(res, conversationPage(actor, url.searchParams.get('cursor')));
      if (path === '/conversations' && req.method === 'POST') {
        const input = JSON.parse((await body(req)).toString()), ids = [...new Set([actor, ...input.memberIds])].sort();
        let c = input.kind === 'direct' ? [...conversations.values()].find(c => c.kind === 'direct' && c.memberIds.slice().sort().join() === ids.join()) : [...conversations.values()].find(c => c.createId === input.clientId);
        if (!c) { c = makeConversation(`conversation-${sequence++}`, input.kind, ids, input.title || members.find(m => m.id === input.memberIds[0])?.name || '私聊', actor); c.createId = input.clientId; conversations.set(c.id, c); }
        json(res, { conversation: publicConversation(c, actor) }); emit(['conversations']); return;
      }
      const convMatch = /^\/conversations\/([^/]+)(?:\/(messages|read))?$/.exec(path);
      if (convMatch) {
        const c = conversations.get(decodeURIComponent(convMatch[1]));
        // Native GET returns an authorized row or null plus the global unread
        // count. It never parses an empty GET body as a PATCH mutation.
        if (!convMatch[2] && req.method === 'GET') return json(res, { conversation: c?.memberIds.includes(actor) ? publicConversation(c, actor) : null, unreadTotal: unreadTotal(actor) });
        if (!c || !c.memberIds.includes(actor)) return fail(res, '会话不存在或已退出', 404);
        if (!convMatch[2]) {
          const patch = JSON.parse((await body(req)).toString());
          if (patch.title || patch.addMemberIds || patch.removeMemberIds) if (c.ownerId !== actor) return fail(res, '仅群主可操作', 403);
          if (patch.title) c.title = patch.title;
          if (patch.addMemberIds) c.memberIds = [...new Set([...c.memberIds, ...patch.addMemberIds])];
          if (patch.removeMemberIds) c.memberIds = c.memberIds.filter(id => !patch.removeMemberIds.includes(id));
          if (patch.leave) c.memberIds = c.memberIds.filter(id => id !== actor);
          c.preferences[actor] = { ...c.preferences[actor], ...(patch.pinned === undefined ? {} : { pinned: patch.pinned }), ...(patch.muted === undefined ? {} : { muted: patch.muted }) };
          json(res, { conversation: publicConversation(c, actor) }); emit(['conversations']); return;
        }
        if (convMatch[2] === 'read') { const data = JSON.parse((await body(req)).toString()); c.read[actor] = data.messageId; json(res, { ok: true }); emit(['conversations'], c.id, actor); return; }
        if (req.method === 'GET') {
          let list = (messages.get(c.id) || []).slice().reverse();
          if (url.searchParams.get('q')) list = list.filter(m => m.body.includes(url.searchParams.get('q')));
          if (url.searchParams.get('kind') === 'files') list = list.filter(m => m.attachments.length && !m.withdrawnAt);
          return json(res, paginate(list, url.searchParams.get('cursor')));
        }
        const data = JSON.parse((await body(req)).toString()); counters.messagePosts.push({ actor, conversationId: c.id, ...data });
        const old = (messages.get(c.id) || []).find(m => m.clientId === data.clientId && m.senderId === actor);
        if (old) { if (old.signature !== JSON.stringify(data)) return fail(res, '消息冲突', 409); return json(res, { message: old }); }
        const m = pushMessage(c.id, actor, data.body, { ...data, attachmentIds: data.attachmentIds || [], attachments: (data.attachmentIds || []).map(id => attachments.get(id)?.wire).filter(Boolean), mentionIds: data.mentionIds || [], replyTo: data.replyTo || null, shareId: data.shareId || null, signature: JSON.stringify(data) });
        if (flags.loseAck) { flags.loseAck = false; res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '10000' }); res.write('{'); setTimeout(() => res.destroy(), 30); } else json(res, { message: m });
        emit(['conversations', 'messages'], c.id); return;
      }
      const withdraw = /^\/messages\/([^/]+)\/withdraw$/.exec(path);
      if (withdraw) { const m = [...messages.values()].flat().find(m => m.id === withdraw[1]); if (!m || m.senderId !== actor) return fail(res, '无权撤回', 403); m.withdrawnAt = now(); m.body = ''; m.attachments = []; m.attachmentIds = []; json(res, { message: m }); emit(['messages', 'conversations'], m.conversationId); return; }
      if (path === '/forward') { const data = JSON.parse((await body(req)).toString()), key = `forward:${actor}:${data.clientId}`; if (operations.has(key)) return json(res, operations.get(key)); const result = []; for (const target of data.conversationIds) for (const id of data.messageIds) { const old = [...messages.values()].flat().find(m => m.id === id); if (old.shareId && conversations.get(target).kind !== 'direct') return fail(res, '分享授权不扩展到群聊', 403); result.push(pushMessage(target, actor, old.body, { attachments: old.attachments, attachmentIds: old.attachmentIds })); } const dataOut = { messages: result }; operations.set(key, dataOut); json(res, dataOut); emit(); return; }
      if (path === '/uploads' && req.method === 'POST') {
        const data = JSON.parse((await body(req)).toString()); let stored = [...uploads.values()].find(u => u.actor === actor && u.clientId === data.clientId);
        if (!stored) { const id = `upload-${sequence++}`; stored = { actor, ...data, chunks: new Map(), wire: { id, name: data.name, bytes: data.bytes, chunkBytes: 16 * 1024, uploadedParts: [], expiresAt: '2026-12-01T00:00:00Z', attachment: null } }; uploads.set(id, stored); }
        return json(res, { upload: stored.wire });
      }
      const uploadMatch = /^\/uploads\/([^/]+)(\/complete)?$/.exec(path);
      if (uploadMatch) {
        const stored = uploads.get(uploadMatch[1]); if (!stored || stored.actor !== actor) return fail(res, '上传不存在', 404);
        if (req.method === 'DELETE') { uploads.delete(uploadMatch[1]); counters.cancellations++; return json(res, { ok: true }); }
        if (uploadMatch[2]) { if (!stored.wire.attachment) { const data = Buffer.concat([...stored.chunks.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])); if (data.length !== stored.bytes) return fail(res, '分块不完整', 409); const id = `attachment-${sequence++}`; const wire = { id, name: stored.name, mime: stored.mime, bytes: stored.bytes, downloadUrl: `/api/collaboration/attachments/${id}`, availability: 'ready' }; stored.wire.attachment = wire; attachments.set(id, { wire, data, actor, conversationId: stored.conversationId, hash: createHash('sha256').update(data).digest('hex') }); } return json(res, { attachment: stored.wire.attachment }); }
        if (req.method === 'PUT') { const part = Number(url.searchParams.get('part')), data = await body(req); counters.chunks.push({ id: stored.wire.id, part, bytes: data.length }); if (stored.chunks.has(part) && !stored.chunks.get(part).equals(data)) return fail(res, '分块内容冲突', 409); stored.chunks.set(part, data); stored.wire.uploadedParts = [...stored.chunks.keys()]; if (flags.slowPart) await new Promise(r => setTimeout(r, 600)); }
        return json(res, { upload: stored.wire });
      }
      const attachmentMatch = /^\/attachments\/([^/]+)$/.exec(path);
      if (attachmentMatch) { const file = attachments.get(attachmentMatch[1]); if (!file || flags.denyAttachment || !conversations.get(file.conversationId)?.memberIds.includes(actor)) return fail(res, '文件访问已失效', 403); res.writeHead(200, { 'Content-Type': file.wire.mime || 'application/octet-stream', 'Content-Disposition': `${url.searchParams.has('preview') ? 'inline' : 'attachment'}; filename="fixture.bin"`, 'X-Content-Type-Options': 'nosniff' }); return res.end(file.data); }
      if (path === '/shares' && req.method === 'GET') return json(res, paginate([...shares.values()].filter(s => s.authorId === actor || s.requesterId === actor), url.searchParams.get('cursor')));
      if (path === '/shares' && req.method === 'POST') { const data = JSON.parse((await body(req)).toString()), key = `share:${data.operationId}`; if (operations.has(key)) return json(res, operations.get(key)); const s = { id: `share-${sequence++}`, enterpriseId: enterprise, authorId: data.action === 'offer' ? actor : data.authorId, requesterId: data.action === 'offer' ? data.requesterId : actor, title: data.action === 'offer' ? '春日产品方案' : '画布复用申请', kind: data.source?.kind || 'workflow', status: data.action === 'offer' ? 'offered' : 'requested', createdAt: now(), updatedAt: now(), version: 1, previewUrl: null, resultProjectKey: null }; s.previewUrl=`/api/collaboration/shares/${s.id}/preview?enterpriseId=${enterprise}`; shares.set(s.id, s); operations.set(key, { share: s }); json(res, { share: s }); emit(['shares']); return; }
      const shareMatch = /^\/shares\/([^/]+)(\/preview)?$/.exec(path);
      if (shareMatch) { const s = shares.get(shareMatch[1]); if (!s || ![s.authorId, s.requesterId].includes(actor)) return fail(res, '分享访问已失效', 403); if (shareMatch[2]) {res.writeHead(200,{'Content-Type':'image/png'});return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZAAAAABJRU5ErkJggg==','base64'));} if (req.method === 'GET') return json(res, { share: s }); const data = JSON.parse((await body(req)).toString()), key = `share-change:${data.operationId}`; if (operations.has(key)) return json(res, operations.get(key)); if (s.version !== data.expectedVersion) return fail(res, '版本冲突', 409); if (data.action === 'approve') { if (actor !== s.authorId || data.source?.projectKey !== 'tree:source-a') return fail(res, '请选择作者自己的来源', 403); s.resultProjectKey = `tree:copy-${s.id}`; counters.copies++; } s.status = ({ request: 'requested', approve: 'approved', reject: 'rejected', revoke: 'revoked' })[data.action]; s.version++; s.updatedAt = now(); operations.set(key, { share: s }); json(res, { share: s }); emit(['shares']); return; }
      return fail(res, 'fixture endpoint not implemented', 404);
    } catch (error) { if (!res.headersSent && !res.destroyed) fail(res, String(error), 500); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, calls, counters, flags, members, conversations, messages, uploads, attachments, shares, emit, pushMessage, streams, events, closeStreams() { for (const s of streams) s.res.end(); }, async close() { for (const s of streams) s.res.end(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
