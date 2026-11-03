import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { getPool } from '@/lib/db';
import { ensureEnterpriseSchema } from '@/lib/enterprise/server';
import { pinnedEnterpriseIds } from '@/lib/enterprise/integration/policy';
import { withCollaborationScope, type CollaborationScope } from '@/lib/enterprise/collaboration-access';
import { TeamError } from '@/lib/teams/server';
import type { CollaborationAttachment, CollaborationBootstrap, CollaborationConversation, CollaborationConversationPage, CollaborationConversationSnapshot, CollaborationMember, CollaborationMessage, CollaborationPage } from './contracts';
import { ensureCollaborationSchema } from './schema';
import { changeSchema, collaborationLimits, createSchema, decodeCursor, encodeCursor, forwardSchema, hash, id, presenceSchema, presenceTtlMs, requireMembers, sendSchema, unique } from './validation';
import { emitCollaborationEventTx, eventCursorTx } from './events';

export type ShareValidator = (tx: PoolClient, actorId: string, enterpriseId: string, conversationMemberIds: string[], shareId: string) => Promise<void>;
export async function collaborationScope<T>(email: string, enterprise: string, run: (tx: PoolClient, scope: CollaborationScope) => Promise<T>) {
  await ensureCollaborationSchema(); return withCollaborationScope(email, enterprise, run);
}
export type ConversationRow = { id: string; enterprise_id: string; kind: 'direct' | 'group'; title: string; owner_id: string;
  last_seq: string; updated_at: Date; joined_seq: string; read_seq: string; pinned: boolean; muted: boolean; };
type MessageRow = { id: string; conversation_id: string; seq: string; sender_id: string; client_id: string; fingerprint: string; body: string;
  reply_to: string | null; attachment_ids: string[]; mention_ids: string[]; share_id: string | null; created_at: Date; withdrawn_at: Date | null };
export async function conversationTx(tx: PoolClient, scope: CollaborationScope, rawId: string, lock = false): Promise<ConversationRow> {
  const conversationId = id.parse(rawId);
  // Lock first, THEN read membership using a fresh READ COMMITTED snapshot.
  // A JOIN evaluated before waiting can retain a removed member's old row.
  const row = (await tx.query(`SELECT * FROM app_collab_conversations
    WHERE id=$1 AND enterprise_id=$2 ${lock ? 'FOR UPDATE' : 'FOR SHARE'}`, [conversationId, scope.enterpriseId])).rows[0];
  if (!row) throw new TeamError('会话不存在或已退出', 404);
  const member = (await tx.query(`SELECT joined_seq,read_seq,pinned,muted FROM app_collab_members
    WHERE conversation_id=$1 AND actor_id=$2 AND left_seq IS NULL`, [conversationId, scope.actorId])).rows[0];
  if (!member) throw new TeamError('会话不存在或已退出', 404);
  return { ...row, ...member };
}
async function participantIdsTx(tx: PoolClient, scope: CollaborationScope, conversation: string) {
  return (await tx.query('SELECT actor_id FROM app_collab_members WHERE conversation_id=$1 AND left_seq IS NULL ORDER BY actor_id', [conversation])).rows
    .map(r => r.actor_id as string).filter(actor => scope.memberIds.has(actor));
}
export function attachmentWire(row: { id: string; name: string; bytes: string | number; mime: string; inline_ok: boolean; enterprise_id: string }): CollaborationAttachment {
  const downloadUrl = `/api/collaboration/attachments/${row.id}?enterpriseId=${row.enterprise_id}`;
  return { id: row.id, name: row.name, bytes: Number(row.bytes), mime: row.mime, downloadUrl,
    ...(row.inline_ok ? { previewUrl: `${downloadUrl}&preview=1` } : {}), availability: 'ready' };
}
async function messagesWireTx(tx: PoolClient, rows: MessageRow[], joinedSeq: string): Promise<CollaborationMessage[]> {
  const ids = unique(rows.filter(r => !r.withdrawn_at).flatMap(r => r.attachment_ids));
  const attachments = ids.length ? (await tx.query("SELECT id,name,bytes,mime,inline_ok,enterprise_id FROM app_collab_uploads WHERE id=ANY($1::uuid[]) AND status='ready'", [ids])).rows : [];
  const map = new Map(attachments.map(a => [a.id, attachmentWire(a)]));
  const replyIds = rows.map(r => r.reply_to).filter(Boolean);
  const replies = replyIds.length ? new Set((await tx.query('SELECT id FROM app_collab_messages WHERE id=ANY($1::uuid[]) AND seq>$2', [replyIds, joinedSeq])).rows.map(r => r.id)) : new Set();
  return rows.map(row => ({ id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, clientId: row.client_id,
    body: row.withdrawn_at ? '' : row.body, createdAt: new Date(row.created_at).toISOString(), withdrawnAt: row.withdrawn_at ? new Date(row.withdrawn_at).toISOString() : null,
    replyTo: !row.withdrawn_at && replies.has(row.reply_to) ? row.reply_to : null,
    attachmentIds: row.withdrawn_at ? [] : row.attachment_ids, attachments: row.withdrawn_at ? [] : row.attachment_ids.flatMap(a => map.has(a) ? [map.get(a)!] : []),
    mentionIds: row.withdrawn_at ? [] : row.mention_ids, shareId: row.withdrawn_at ? null : row.share_id }));
}
async function conversationWireTx(tx: PoolClient, scope: CollaborationScope, row: ConversationRow): Promise<CollaborationConversation> {
  const latest = (await tx.query('SELECT * FROM app_collab_messages WHERE conversation_id=$1 AND seq>$2 ORDER BY seq DESC LIMIT 1', [row.id, row.joined_seq])).rows;
  const unread = (await tx.query(`SELECT count(*)::int AS n FROM app_collab_messages WHERE conversation_id=$1 AND seq>GREATEST($2::bigint,$3::bigint)
    AND sender_id<>$4 AND withdrawn_at IS NULL`, [row.id, row.read_seq, row.joined_seq, scope.actorId])).rows[0].n;
  const lastRead = (await tx.query('SELECT id FROM app_collab_messages WHERE conversation_id=$1 AND seq=$2 AND seq>$3', [row.id, row.read_seq, row.joined_seq])).rows[0];
  return { id: row.id, enterpriseId: row.enterprise_id, kind: row.kind, title: row.title, ownerId: row.owner_id,
    memberIds: await participantIdsTx(tx, scope, row.id), lastMessage: (await messagesWireTx(tx, latest, row.joined_seq))[0] || null,
    unread, lastReadMessageId: lastRead?.id || null, pinned: row.pinned, muted: row.muted, updatedAt: new Date(row.updated_at).toISOString() };
}
export async function membersTx(tx: PoolClient, scope: CollaborationScope, q = '', rawCursor?: string | null): Promise<CollaborationPage<CollaborationMember>> {
  if (q.length > 100) throw new TeamError('搜索内容过长', 400);
  const binding = `members:${scope.enterpriseId}:${q}`, after = decodeCursor(rawCursor, binding);
  const rows = (await tx.query(`SELECT u.email,u.name,COALESCE(r.name,CASE WHEN u.email=$2 THEN '负责人' ELSE '成员' END) AS role_name,
    CASE WHEN EXISTS(SELECT 1 FROM app_collab_presence p WHERE p.enterprise_id=$1 AND p.actor_id=u.email AND p.expires_at>now() AND p.state='online') THEN 'online'
    WHEN EXISTS(SELECT 1 FROM app_collab_presence p WHERE p.enterprise_id=$1 AND p.actor_id=u.email AND p.expires_at>now()) THEN 'away' ELSE 'offline' END AS presence
    FROM app_users u LEFT JOIN app_enterprise_members m ON m.enterprise_id=$1 AND m.email=u.email
    LEFT JOIN app_enterprise_roles r ON r.enterprise_id=m.enterprise_id AND r.id=m.role_id
    WHERE u.email=ANY($3::text[]) AND ($4::text IS NULL OR u.email>$4)
    AND ($5='' OR strpos(lower(u.email||' '||u.name||' '||COALESCE(r.name,'')),lower($5))>0)
    ORDER BY u.email LIMIT 101`, [scope.enterpriseId, scope.ownerId, [...scope.memberIds], after, q])).rows;
  return { items: rows.slice(0, 100).map(r => ({ id: r.email, name: r.name || r.email, roleName: r.role_name, presence: r.presence })),
    nextCursor: rows.length > 100 ? encodeCursor(binding, rows[99].email) : null };
}
/** Uses actor membership + (conversation_id,seq) indexes, not tenant hydration.
 * Never counts old membership history, own messages or withdrawn tombstones. */
async function unreadTotalTx(tx: PoolClient, scope: CollaborationScope): Promise<number> {
  const result = await tx.query(`SELECT count(*)::int AS n
    FROM app_collab_members member JOIN app_collab_conversations c ON c.id=member.conversation_id
    JOIN app_collab_messages message ON message.conversation_id=c.id
      AND message.seq>GREATEST(member.joined_seq,member.read_seq)
    WHERE member.actor_id=$1 AND member.left_seq IS NULL AND c.enterprise_id=$2
      AND c.last_seq>GREATEST(member.joined_seq,member.read_seq)
      AND message.sender_id<>$1 AND message.withdrawn_at IS NULL`, [scope.actorId, scope.enterpriseId]);
  return result.rows[0].n;
}
export async function conversationSnapshotTx(tx: PoolClient, scope: CollaborationScope, conversationId: string): Promise<CollaborationConversationSnapshot> {
  let conversation: CollaborationConversation | null = null;
  try { conversation = await conversationWireTx(tx, scope, await conversationTx(tx, scope, conversationId)); }
  catch (error) { if (!(error instanceof TeamError && error.status === 404)) throw error; }
  return { conversation, unreadTotal: await unreadTotalTx(tx, scope) };
}
export async function conversationsTx(tx: PoolClient, scope: CollaborationScope, rawCursor?: string | null): Promise<CollaborationConversationPage> {
  const binding = `conversations:${scope.enterpriseId}:${scope.actorId}`, after = decodeCursor(rawCursor, binding);
  if (after) id.parse(after);
  // Stable identity pagination; UI sorts returned conversation activity without mutable-cursor skips.
  const rows = (await tx.query(`SELECT c.*,m.joined_seq,m.read_seq,m.pinned,m.muted FROM app_collab_members m JOIN app_collab_conversations c ON c.id=m.conversation_id
    WHERE c.enterprise_id=$1 AND m.actor_id=$2 AND m.left_seq IS NULL AND ($3::uuid IS NULL OR c.id<$3) ORDER BY c.id DESC LIMIT 51`, [scope.enterpriseId, scope.actorId, after])).rows;
  const items: CollaborationConversation[] = [];
  for (const row of rows.slice(0, 50)) items.push(await conversationWireTx(tx, scope, row));
  return { items, nextCursor: rows.length > 50 ? encodeCursor(binding, rows[49].id) : null, unreadTotal: await unreadTotalTx(tx, scope) };
}
export async function bootstrap(email: string, requested?: string | null): Promise<CollaborationBootstrap> {
  await ensureEnterpriseSchema(); await ensureCollaborationSchema();
  const actorId = email.trim().toLowerCase(); const pinned = pinnedEnterpriseIds();
  const rows = (await getPool().query(`SELECT t.id,t.name FROM app_account_teams t JOIN app_enterprise_settings s ON s.team_id=t.id
    WHERE (cardinality($2::uuid[])=0 OR t.id=ANY($2::uuid[])) AND (t.owner_email=$1 OR EXISTS(SELECT 1 FROM app_enterprise_members m
      WHERE m.enterprise_id=t.id AND m.email=$1 AND m.membership_status='active' AND (m.membership_expires_at IS NULL OR m.membership_expires_at>now())))
    ORDER BY t.name,t.id LIMIT 101`, [actorId, pinned])).rows;
  if (rows.length > 100) throw new TeamError('企业目录超过单次范围', 413);
  const enterprises: { id: string; name: string }[] = [];
  for (const row of rows) {
    try { await withCollaborationScope(actorId, row.id, async () => {}); enterprises.push({ id: row.id, name: row.name }); }
    catch (error) { if (!(error instanceof TeamError && [403, 404].includes(error.status))) throw error; }
  }
  const enterpriseId = requested || enterprises[0]?.id || null;
  const base = { actorId, enterprises, enterpriseId, limits: collaborationLimits() };
  if (!enterpriseId) return { ...base, members: [], conversations: [], cursor: null, unreadTotal: 0, membersNextCursor: null, conversationsNextCursor: null };
  return collaborationScope(actorId, enterpriseId, async (tx, scope) => {
    // Read head first: all later arrivals remain replayable after the bootstrap reads.
    const cursor = await eventCursorTx(tx, scope);
    const members = await membersTx(tx, scope), conversations = await conversationsTx(tx, scope);
    return { ...base, members: members.items, conversations: conversations.items, cursor, unreadTotal: conversations.unreadTotal,
      membersNextCursor: members.nextCursor, conversationsNextCursor: conversations.nextCursor };
  });
}
async function operationTx(tx: PoolClient, scope: CollaborationScope, kind: string, clientId: string, fingerprint: string) {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`collab:${scope.enterpriseId}:${scope.actorId}:${kind}:${clientId}`]);
  const old = (await tx.query('SELECT fingerprint,result FROM app_collab_operations WHERE enterprise_id=$1 AND actor_id=$2 AND kind=$3 AND client_id=$4', [scope.enterpriseId, scope.actorId, kind, clientId])).rows[0];
  if (old && old.fingerprint !== fingerprint) throw new TeamError('请求标识已用于其他内容', 409);
  return old?.result;
}
async function saveOperationTx(tx: PoolClient, scope: CollaborationScope, kind: string, clientId: string, fingerprint: string, result: unknown) {
  await tx.query('INSERT INTO app_collab_operations(enterprise_id,actor_id,kind,client_id,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)', [scope.enterpriseId, scope.actorId, kind, clientId, fingerprint, JSON.stringify(result)]);
}
export async function createConversationTx(tx: PoolClient, scope: CollaborationScope, input: unknown) {
  const command = createSchema.parse(input); const members = unique([scope.actorId, ...command.memberIds]); requireMembers(scope.memberIds, members);
  if (command.kind === 'direct' && members.length !== 2) throw new TeamError('私聊请选择另一名成员', 400);
  const fingerprint = hash({ ...command, memberIds: members });
  const replay = await operationTx(tx, scope, 'create', command.clientId, fingerprint);
  if (replay) return conversationWireTx(tx, scope, await conversationTx(tx, scope, replay.id));
  const directKey = command.kind === 'direct' ? hash(members) : null;
  const created = (await tx.query(`INSERT INTO app_collab_conversations(id,enterprise_id,kind,title,owner_id,direct_key) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(enterprise_id,direct_key) DO NOTHING RETURNING id`, [randomUUID(), scope.enterpriseId, command.kind, command.kind === 'group' ? command.title || '' : '', scope.actorId, directKey])).rows[0];
  const conversationId = created?.id || (await tx.query('SELECT id FROM app_collab_conversations WHERE enterprise_id=$1 AND direct_key=$2', [scope.enterpriseId, directKey])).rows[0].id;
  if (created) {
    await tx.query('INSERT INTO app_collab_members(conversation_id,actor_id) SELECT $1,unnest($2::text[])', [conversationId, members]);
    await tx.query('INSERT INTO app_collab_membership_history(conversation_id,actor_id,joined_seq) SELECT $1,unnest($2::text[]),0', [conversationId, members]);
    await emitCollaborationEventTx(tx, scope.enterpriseId, ['conversations'], members, conversationId);
  }
  await saveOperationTx(tx, scope, 'create', command.clientId, fingerprint, { id: conversationId });
  return conversationWireTx(tx, scope, await conversationTx(tx, scope, conversationId));
}
export async function changeConversationTx(tx: PoolClient, scope: CollaborationScope, conversationId: string, input: unknown) {
  const command = changeSchema.parse(input), row = await conversationTx(tx, scope, conversationId, true);
  const before = await participantIdsTx(tx, scope, row.id);
  const modifying = command.title !== undefined || command.addMemberIds?.length || command.removeMemberIds?.length;
  if ((modifying || command.leave) && row.kind !== 'group') throw new TeamError('私聊不支持调整成员', 400);
  if (modifying && row.owner_id !== scope.actorId) throw new TeamError('仅群主可调整群成员或名称', 403);
  const add = unique(command.addMemberIds || []), remove = unique([...(command.removeMemberIds || []), ...(command.leave ? [scope.actorId] : [])]);
  requireMembers(scope.memberIds, add);
  if (add.some(a => remove.includes(a))) throw new TeamError('成员调整冲突', 400);
  if (unique([...before, ...add]).filter(a => !remove.includes(a)).length > 100) throw new TeamError('群成员上限为100', 413);
  if (command.pinned !== undefined || command.muted !== undefined) await tx.query(`UPDATE app_collab_members SET pinned=COALESCE($3,pinned),muted=COALESCE($4,muted)
    WHERE conversation_id=$1 AND actor_id=$2`, [row.id, scope.actorId, command.pinned ?? null, command.muted ?? null]);
  for (const actor of add) {
    const inserted = await tx.query(`INSERT INTO app_collab_members(conversation_id,actor_id,joined_seq,read_seq) VALUES($1,$2,$3,$3)
      ON CONFLICT(conversation_id,actor_id) DO UPDATE SET joined_seq=$3,read_seq=$3,left_seq=NULL
      WHERE app_collab_members.left_seq IS NOT NULL RETURNING actor_id`, [row.id, actor, row.last_seq]);
    if (inserted.rowCount) await tx.query('INSERT INTO app_collab_membership_history(conversation_id,actor_id,joined_seq) VALUES($1,$2,$3)', [row.id, actor, row.last_seq]);
  }
  if (remove.length) {
    await tx.query('UPDATE app_collab_members SET left_seq=$3 WHERE conversation_id=$1 AND actor_id=ANY($2::text[]) AND left_seq IS NULL', [row.id, remove, row.last_seq]);
    await tx.query('UPDATE app_collab_membership_history SET left_seq=$3 WHERE conversation_id=$1 AND actor_id=ANY($2::text[]) AND left_seq IS NULL', [row.id, remove, row.last_seq]);
  }
  const after = await participantIdsTx(tx, scope, row.id);
  const nextOwner = remove.includes(row.owner_id) ? after[0] || row.owner_id : row.owner_id;
  await tx.query('UPDATE app_collab_conversations SET title=COALESCE($2,title),owner_id=$3,updated_at=clock_timestamp() WHERE id=$1', [row.id, command.title ?? null, nextOwner]);
  await emitCollaborationEventTx(tx, scope.enterpriseId, ['conversations', 'messages'], unique([...before, ...after]), row.id);
  if (remove.includes(scope.actorId)) return { id: row.id, enterpriseId: scope.enterpriseId, kind: row.kind, title: command.title ?? row.title,
    ownerId: nextOwner, memberIds: after, lastMessage: null, unread: 0, lastReadMessageId: null, pinned: false, muted: false, updatedAt: new Date().toISOString() } satisfies CollaborationConversation;
  return conversationWireTx(tx, scope, await conversationTx(tx, scope, row.id));
}
export async function messagesTx(tx: PoolClient, scope: CollaborationScope, conversationId: string, params: URLSearchParams): Promise<CollaborationPage<CollaborationMessage>> {
  const row = await conversationTx(tx, scope, conversationId); const q = params.get('q') || '', files = params.get('kind') === 'files';
  if (q.length > 100) throw new TeamError('搜索内容过长', 400);
  const binding = `messages:${scope.enterpriseId}:${scope.actorId}:${row.id}:${row.joined_seq}:${q}:${files}`;
  const after = decodeCursor(params.get('cursor'), binding); if (after && !/^\d{1,19}$/.test(after)) throw new TeamError('游标无效', 400);
  const rows = (await tx.query(`SELECT * FROM app_collab_messages WHERE conversation_id=$1 AND seq>$2 AND ($3::bigint IS NULL OR seq<$3)
    AND ($4='' OR withdrawn_at IS NULL AND strpos(lower(body),lower($4))>0) AND (NOT $5 OR cardinality(attachment_ids)>0 AND withdrawn_at IS NULL)
    ORDER BY seq DESC LIMIT 51`, [row.id, row.joined_seq, after, q, files])).rows;
  return { items: await messagesWireTx(tx, rows.slice(0, 50), row.joined_seq), nextCursor: rows.length > 50 ? encodeCursor(binding, rows[49].seq) : null };
}
async function visibleMessageTx(tx: PoolClient, scope: CollaborationScope, messageId: string, locked?: Map<string, ConversationRow>) {
  id.parse(messageId);
  const row: MessageRow = (await tx.query('SELECT * FROM app_collab_messages WHERE id=$1', [messageId])).rows[0];
  if (!row) throw new TeamError('消息不存在', 404);
  const conversation = locked?.get(row.conversation_id) || await conversationTx(tx, scope, row.conversation_id);
  if (BigInt(row.seq) <= BigInt(conversation.joined_seq)) throw new TeamError('消息不在可读区间', 404);
  return { row, conversation };
}
async function sendTx(tx: PoolClient, scope: CollaborationScope, conversationId: string, input: unknown, validateShare: ShareValidator,
  forwarded?: MessageRow, locked?: ConversationRow): Promise<CollaborationMessage> {
  const command = sendSchema.parse(input); const row = locked || await conversationTx(tx, scope, conversationId, true);
  command.attachmentIds = unique(command.attachmentIds); command.mentionIds = unique(command.mentionIds);
  const fingerprint = hash({ ...command, forwarded: forwarded?.id || null });
  const old = (await tx.query('SELECT * FROM app_collab_messages WHERE conversation_id=$1 AND sender_id=$2 AND client_id=$3', [row.id, scope.actorId, command.clientId])).rows[0];
  if (old) {
    if (old.fingerprint !== fingerprint) throw new TeamError('请求标识已用于其他内容', 409);
    if (BigInt(old.seq) <= BigInt(row.joined_seq)) throw new TeamError('原消息不在当前成员区间', 409);
    return (await messagesWireTx(tx, [old], row.joined_seq))[0];
  }
  const participants = await participantIdsTx(tx, scope, row.id);
  if (row.kind === 'direct' && participants.length !== 2) throw new TeamError('对方已离职或停用', 403);
  requireMembers(new Set(participants), command.mentionIds);
  if (!command.body.trim() && !command.attachmentIds.length && !command.shareId) throw new TeamError('消息内容为空', 400);
  if (command.replyTo) {
    const reply = await visibleMessageTx(tx, scope, command.replyTo, new Map([[row.id, row]]));
    if (reply.row.conversation_id !== row.id || reply.row.withdrawn_at) throw new TeamError('引用消息已失效', 409);
  }
  if (command.shareId) {
    if (row.kind !== 'direct') throw new TeamError('共享卡片仅支持双方私聊', 403);
    await validateShare(tx, scope.actorId, scope.enterpriseId, participants, command.shareId);
  }
  if (command.attachmentIds.length) {
    const attachments = (await tx.query(`SELECT * FROM app_collab_uploads WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [command.attachmentIds])).rows;
    if (attachments.length !== command.attachmentIds.length || attachments.some(a => a.enterprise_id !== scope.enterpriseId || a.status !== 'ready'
      || (forwarded ? !forwarded.attachment_ids.includes(a.id) : a.owner_id !== scope.actorId || a.conversation_id !== row.id || a.published_at)))
      throw new TeamError('附件未完成或无权引用', 403);
    await tx.query('UPDATE app_collab_uploads SET published_at=COALESCE(published_at,clock_timestamp()) WHERE id=ANY($1::uuid[])', [command.attachmentIds]);
  }
  const next = (await tx.query('UPDATE app_collab_conversations SET last_seq=last_seq+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING last_seq', [row.id])).rows[0].last_seq;
  const message = (await tx.query(`INSERT INTO app_collab_messages(id,conversation_id,seq,sender_id,client_id,fingerprint,body,reply_to,attachment_ids,mention_ids,share_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [randomUUID(), row.id, next, scope.actorId, command.clientId, fingerprint,
    command.body, command.replyTo || null, command.attachmentIds, command.mentionIds, command.shareId || null])).rows[0];
  if (!forwarded) await emitCollaborationEventTx(tx, scope.enterpriseId, ['conversations', 'messages'], participants, row.id);
  return (await messagesWireTx(tx, [message], row.joined_seq))[0];
}
export const sendMessageTx = sendTx;
export async function readMessageTx(tx: PoolClient, scope: CollaborationScope, conversationId: string, input: unknown) {
  const command = z.object({ messageId: id }).strict().parse(input);
  const conversation = await conversationTx(tx, scope, conversationId, true);
  const { row } = await visibleMessageTx(tx, scope, command.messageId, new Map([[conversationId, conversation]]));
  if (row.conversation_id !== conversationId) throw new TeamError('消息不属于当前会话', 400);
  await tx.query('UPDATE app_collab_members SET read_seq=GREATEST(read_seq,$3::bigint) WHERE conversation_id=$1 AND actor_id=$2', [conversationId, scope.actorId, row.seq]);
  await emitCollaborationEventTx(tx, scope.enterpriseId, ['conversations'], [scope.actorId], conversationId);
  return { ok: true };
}
export async function withdrawMessageTx(tx: PoolClient, scope: CollaborationScope, messageId: string) {
  const peek = (await tx.query('SELECT conversation_id FROM app_collab_messages WHERE id=$1', [id.parse(messageId)])).rows[0];
  if (!peek) throw new TeamError('消息不存在', 404);
  const conversation = await conversationTx(tx, scope, peek.conversation_id, true);
  const { row } = await visibleMessageTx(tx, scope, messageId, new Map([[conversation.id, conversation]]));
  if (row.sender_id !== scope.actorId) throw new TeamError('仅能撤回自己的消息', 403);
  const updated = (await tx.query(`UPDATE app_collab_messages SET withdrawn_at=COALESCE(withdrawn_at,clock_timestamp()),body='',attachment_ids='{}',mention_ids='{}',reply_to=NULL,share_id=NULL WHERE id=$1 RETURNING *`, [messageId])).rows[0];
  await emitCollaborationEventTx(tx, scope.enterpriseId, ['conversations', 'messages'], await participantIdsTx(tx, scope, conversation.id), conversation.id);
  return (await messagesWireTx(tx, [updated], conversation.joined_seq))[0];
}
export async function forwardMessagesTx(tx: PoolClient, scope: CollaborationScope, input: unknown, validateShare: ShareValidator) {
  const command = forwardSchema.parse(input); command.messageIds = unique(command.messageIds); command.conversationIds = unique(command.conversationIds);
  const fingerprint = hash(command), replay = await operationTx(tx, scope, 'forward', command.clientId, fingerprint);
  if (replay) {
    const result: CollaborationMessage[] = [];
    for (const messageId of replay.ids) { const { row, conversation } = await visibleMessageTx(tx, scope, messageId); result.push((await messagesWireTx(tx, [row], conversation.joined_seq))[0]); }
    return result;
  }
  // Lock all source/target conversations in deterministic order before reading sources.
  const sourceConversations = (await tx.query('SELECT DISTINCT conversation_id FROM app_collab_messages WHERE id=ANY($1::uuid[])', [command.messageIds])).rows.map(r => r.conversation_id);
  const locked = new Map<string, ConversationRow>();
  for (const conversationId of unique([...sourceConversations, ...command.conversationIds])) locked.set(conversationId, await conversationTx(tx, scope, conversationId, true));
  const sources: MessageRow[] = [];
  for (const messageId of command.messageIds) { const { row } = await visibleMessageTx(tx, scope, messageId, locked); if (row.withdrawn_at) throw new TeamError('撤回的消息不可转发', 409); sources.push(row); }
  const result: CollaborationMessage[] = [];
  for (const target of command.conversationIds) for (const source of sources) result.push(await sendTx(tx, scope, target,
    { clientId: `forward:${hash([command.clientId, source.id, target])}`, body: source.body, attachmentIds: source.attachment_ids,
      ...(source.share_id ? { shareId: source.share_id } : {}) }, validateShare, source, locked.get(target)));
  for (const target of command.conversationIds) await emitCollaborationEventTx(tx, scope.enterpriseId, ['conversations', 'messages'], await participantIdsTx(tx, scope, target), target);
  await saveOperationTx(tx, scope, 'forward', command.clientId, fingerprint, { ids: result.map(m => m.id) }); return result;
}
export async function presenceTx(tx: PoolClient, scope: CollaborationScope, input: unknown) {
  const command = presenceSchema.parse(input);
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`presence:${scope.enterpriseId}:${scope.actorId}`]);
  const effective = async () => (await tx.query(`SELECT COALESCE(max(CASE WHEN state='online' THEN 2 ELSE 1 END),0)::int AS state
    FROM app_collab_presence WHERE enterprise_id=$1 AND actor_id=$2 AND expires_at>now()`, [scope.enterpriseId, scope.actorId])).rows[0].state;
  const before = await effective();
  if (command.state === 'offline') await tx.query('DELETE FROM app_collab_presence WHERE enterprise_id=$1 AND actor_id=$2 AND session_id=$3', [scope.enterpriseId, scope.actorId, command.sessionId]);
  else {
    // Bound expired/crashed tab accumulation for this account, without deleting another live session.
    await tx.query('DELETE FROM app_collab_presence WHERE enterprise_id=$1 AND actor_id=$2 AND expires_at<=now()', [scope.enterpriseId, scope.actorId]);
    await tx.query(`INSERT INTO app_collab_presence(enterprise_id,actor_id,session_id,state,expires_at) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(enterprise_id,actor_id,session_id) DO UPDATE SET state=excluded.state,expires_at=excluded.expires_at`,
      [scope.enterpriseId, scope.actorId, command.sessionId, command.state, new Date(Date.now() + presenceTtlMs())]);
  }
  if (before !== await effective()) await emitCollaborationEventTx(tx, scope.enterpriseId, ['members']);
  return { ok: true };
}
