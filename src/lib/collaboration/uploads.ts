import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import type { CollaborationScope } from '@/lib/enterprise/collaboration-access';
import { TeamError } from '@/lib/teams/server';
import { PRIVATE_HEADERS } from '@/lib/teams/access';
import type { CollaborationUpload } from './contracts';
import { attachmentWire, collaborationScope, conversationTx } from './service';
import { collaborationLimits, fileName, hash, id, uploadSchema, uploadTtlMs } from './validation';
import { attachmentRange, collaborationStorage, detectedMedia, disposition, readBoundedBody } from './private-storage';
import { ensureCollaborationSchema } from './schema';

type UploadRow = { id: string; enterprise_id: string; conversation_id: string; owner_id: string; name: string; bytes: string;
  chunk_bytes: number; mime: string; inline_ok: boolean; status: string; backend: string; expires_at: Date; published_at: Date | null; fingerprint: string };
type PartRow = { upload_id: string; part: number; bytes: number; sha256: string; object_key: string; ready: boolean };
const totalParts = (row: UploadRow) => Math.ceil(Number(row.bytes) / row.chunk_bytes);
async function uploadTx(tx: PoolClient, scope: CollaborationScope, uploadId: string, lock = false) {
  const peek = (await tx.query('SELECT conversation_id FROM app_collab_uploads WHERE id=$1 AND enterprise_id=$2 AND owner_id=$3', [id.parse(uploadId), scope.enterpriseId, scope.actorId])).rows[0];
  if (!peek) throw new TeamError('上传不存在', 404);
  await conversationTx(tx, scope, peek.conversation_id); // consistent conversation -> upload lock order
  const row: UploadRow = (await tx.query(`SELECT * FROM app_collab_uploads WHERE id=$1 ${lock ? 'FOR UPDATE' : 'FOR SHARE'}`, [uploadId])).rows[0];
  return row;
}
function requireUploading(row: UploadRow) {
  if (row.status !== 'uploading') throw new TeamError('上传已完成或取消', 409);
  if (new Date(row.expires_at).getTime() <= Date.now()) throw new TeamError('上传已过期，请重新上传', 410);
}
async function uploadWireTx(tx: PoolClient, row: UploadRow): Promise<CollaborationUpload> {
  return { id: row.id, name: row.name, bytes: Number(row.bytes), chunkBytes: row.chunk_bytes,
    uploadedParts: (await tx.query('SELECT part FROM app_collab_parts WHERE upload_id=$1 AND ready ORDER BY part', [row.id])).rows.map(r => r.part),
    expiresAt: new Date(row.expires_at).toISOString(), attachment: row.status === 'ready' ? attachmentWire(row) : null };
}
export async function beginUploadTx(tx: PoolClient, scope: CollaborationScope, input: unknown) {
  const command = uploadSchema.parse(input); fileName(command.name); const limits = collaborationLimits();
  if (command.bytes > limits.attachmentBytes || Math.ceil(command.bytes / limits.chunkBytes) > 16384) throw new TeamError('文件超过上传上限', 413);
  await conversationTx(tx, scope, command.conversationId);
  const fingerprint = hash(command); const storage = collaborationStorage();
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`upload:${scope.enterpriseId}:${scope.actorId}:${command.clientId}`]);
  const old = (await tx.query('SELECT * FROM app_collab_uploads WHERE enterprise_id=$1 AND owner_id=$2 AND client_id=$3 FOR UPDATE', [scope.enterpriseId, scope.actorId, command.clientId])).rows[0];
  if (old) { if (old.fingerprint !== fingerprint) throw new TeamError('上传标识已用于其他文件', 409);
    if (['cancelled', 'expired'].includes(old.status)) throw new TeamError('上传已取消或过期', 410); return uploadWireTx(tx, old); }
  const row = (await tx.query(`INSERT INTO app_collab_uploads(id,enterprise_id,conversation_id,owner_id,client_id,fingerprint,name,bytes,chunk_bytes,claimed_mime,backend,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [randomUUID(), scope.enterpriseId, command.conversationId, scope.actorId, command.clientId,
    fingerprint, command.name, command.bytes, limits.chunkBytes, command.mime, storage.selected, new Date(Date.now() + uploadTtlMs())])).rows[0];
  return uploadWireTx(tx, row);
}
export async function getUploadTx(tx: PoolClient, scope: CollaborationScope, uploadId: string) {
  const row = await uploadTx(tx, scope, uploadId);
  if (['cancelled', 'expired'].includes(row.status)) throw new TeamError('上传已取消或过期', 410);
  if (row.status === 'uploading') requireUploading(row);
  return uploadWireTx(tx, row);
}
/** Reserve immutable part identity/hash, release DB, write bounded bytes, then confirm.
 * A request/ACK loss retries the exact part/key. Conflicting bytes never overwrite it.
 */
export async function putUploadPart(email: string, enterprise: string, uploadId: string, partText: string | null, request: Request) {
  if (!partText || !/^\d{1,5}$/.test(partText)) throw new TeamError('分块编号无效', 400);
  const part = Number(partText);
  const snapshot = await collaborationScope(email, enterprise, (tx, scope) => uploadTx(tx, scope, uploadId)); requireUploading(snapshot);
  if (part >= totalParts(snapshot)) throw new TeamError('分块编号越界', 400);
  const expected = Math.min(snapshot.chunk_bytes, Number(snapshot.bytes) - part * snapshot.chunk_bytes);
  const bytes = await readBoundedBody(request, expected);
  if (bytes.byteLength !== expected) throw new TeamError('分块不完整，请重试本块', 400);
  const digest = createHash('sha256').update(bytes).digest('hex'); const storage = collaborationStorage();
  const reserved = await collaborationScope(email, enterprise, async (tx, scope) => {
    const row = await uploadTx(tx, scope, uploadId, true); requireUploading(row);
    let entry: PartRow = (await tx.query('SELECT * FROM app_collab_parts WHERE upload_id=$1 AND part=$2', [uploadId, part])).rows[0];
    if (entry && (entry.sha256 !== digest || entry.bytes !== bytes.byteLength)) throw new TeamError('该分块已提交不同内容', 409);
    if (!entry) entry = (await tx.query('INSERT INTO app_collab_parts(upload_id,part,bytes,sha256,object_key) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [uploadId, part, bytes.byteLength, digest, storage.key(uploadId, randomUUID())])).rows[0];
    return { row, entry };
  });
  if (!reserved.entry.ready) await storage.backend(reserved.row.backend).put(reserved.entry.object_key, bytes, 'application/octet-stream', 'private, no-store');
  try {
    return await collaborationScope(email, enterprise, async (tx, scope) => {
      const row = await uploadTx(tx, scope, uploadId, true); requireUploading(row);
      await tx.query('UPDATE app_collab_parts SET ready=true WHERE upload_id=$1 AND part=$2 AND sha256=$3', [uploadId, part, digest]);
      return uploadWireTx(tx, row);
    });
  } catch (error) {
    // A late PUT may finish after cancellation/expiry cleanup. Only a durable
    // tombstone proves it is disposable; lost DB ACK is never evidence of absence.
    const cancelled = await getPool().query("SELECT 1 FROM app_collab_uploads WHERE id=$1 AND status IN ('cancelled','expired') AND published_at IS NULL", [uploadId]).catch(() => null);
    if (cancelled?.rowCount) await storage.backend(reserved.row.backend).delete(reserved.entry.object_key).catch(() => {});
    throw error;
  }
}
export async function completeUpload(email: string, enterprise: string, uploadId: string) {
  const snapshot = await collaborationScope(email, enterprise, async (tx, scope) => {
    const row = await uploadTx(tx, scope, uploadId);
    if (row.status !== 'ready') requireUploading(row);
    const parts: PartRow[] = (await tx.query('SELECT * FROM app_collab_parts WHERE upload_id=$1 ORDER BY part', [uploadId])).rows;
    if (parts.length !== totalParts(row) || parts.some((p, i) => !p.ready || p.part !== i)) throw new TeamError('文件分块尚未完成', 409);
    return { row, parts };
  });
  if (snapshot.row.status === 'ready') return attachmentWire(snapshot.row);
  let bytes = Buffer.alloc(0);
  if (snapshot.parts[0]) {
    const response = await collaborationStorage().backend(snapshot.row.backend).get(snapshot.parts[0].object_key, 'bytes=0-255');
    try { if (!response.ok) throw new TeamError('文件存储读取失败', 503); bytes = await readBoundedBody(new Request('http://local/part', { method: 'POST', body: response.body, duplex: 'half' } as RequestInit), 256); }
    finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
  }
  const media = detectedMedia(bytes, snapshot.row.name);
  // Completion is metadata-only; the immutable chunk manifest is the file. Never concatenate a big Buffer.
  return collaborationScope(email, enterprise, async (tx, scope) => {
    const row = await uploadTx(tx, scope, uploadId, true); if (row.status === 'ready') return attachmentWire(row); requireUploading(row);
    const complete = (await tx.query('SELECT count(*)::int AS n,COALESCE(sum(bytes),0)::text AS bytes FROM app_collab_parts WHERE upload_id=$1 AND ready', [uploadId])).rows[0];
    if (complete.n !== totalParts(row) || Number(complete.bytes) !== Number(row.bytes)) throw new TeamError('文件分块不完整', 409);
    const updated = (await tx.query("UPDATE app_collab_uploads SET status='ready',mime=$2,inline_ok=$3 WHERE id=$1 RETURNING *", [uploadId, media.mime, media.inline])).rows[0];
    return attachmentWire(updated);
  });
}
export async function cancelUploadTx(tx: PoolClient, scope: CollaborationScope, uploadId: string) {
  const row = await uploadTx(tx, scope, uploadId, true);
  if (row.published_at || (await tx.query('SELECT 1 FROM app_collab_messages WHERE $1::uuid=ANY(attachment_ids) LIMIT 1', [uploadId])).rowCount)
    throw new TeamError('文件已被消息引用，请撤回对应消息', 409);
  // Grace lets in-flight writes finish before the reaper; tombstones retain all reserved keys until deletion succeeds.
  await tx.query("UPDATE app_collab_uploads SET status='cancelled',expires_at=clock_timestamp()+interval '10 minutes' WHERE id=$1 AND status NOT IN ('cancelled','expired')", [uploadId]);
  return { ok: true };
}
export async function attachmentSnapshotTx(tx: PoolClient, scope: CollaborationScope, attachmentId: string) {
  let row: UploadRow = (await tx.query(`SELECT * FROM app_collab_uploads WHERE id=$1 AND enterprise_id=$2 AND status='ready'`, [id.parse(attachmentId), scope.enterpriseId])).rows[0];
  if (!row) throw new TeamError('文件不存在', 404);
  // A completed but never published upload is visible only to its uploader while still in that conversation.
  // After first publication the ONLY authority is a current, non-withdrawn message grant (including forwards).
  const grant = (await tx.query(`SELECT x.id,x.conversation_id FROM app_collab_messages x JOIN app_collab_members m ON m.conversation_id=x.conversation_id
    JOIN app_collab_conversations c ON c.id=x.conversation_id WHERE c.enterprise_id=$2 AND m.actor_id=$3 AND m.left_seq IS NULL
    AND x.seq>m.joined_seq AND x.withdrawn_at IS NULL AND $1::uuid=ANY(x.attachment_ids) ORDER BY x.conversation_id,x.seq LIMIT 1`, [row.id, scope.enterpriseId, scope.actorId])).rows[0];
  // All mutation/read paths acquire conversation before upload, including withdrawal.
  // Recheck the grant after waiting for the lock; never use a stale pre-lock snapshot.
  if (grant) {
    const conversation = await conversationTx(tx, scope, grant.conversation_id);
    const valid = (await tx.query(`SELECT 1 FROM app_collab_messages WHERE id=$1 AND seq>$2 AND withdrawn_at IS NULL AND $3::uuid=ANY(attachment_ids)`, [grant.id, conversation.joined_seq, row.id])).rowCount;
    if (!valid) throw new TeamError('文件授权已撤回', 404);
  } else {
    if (row.published_at || row.owner_id !== scope.actorId) throw new TeamError('文件不存在或授权已撤回', 404);
    await conversationTx(tx, scope, row.conversation_id);
  }
  row = (await tx.query("SELECT * FROM app_collab_uploads WHERE id=$1 AND status='ready' FOR SHARE", [row.id])).rows[0];
  if (!row || !grant && row.published_at) throw new TeamError('文件状态已改变，请重试', 409);
  const parts: PartRow[] = (await tx.query('SELECT * FROM app_collab_parts WHERE upload_id=$1 AND ready ORDER BY part', [row.id])).rows;
  if (parts.length !== totalParts(row)) throw new TeamError('文件清单不完整', 503);
  return { row, parts };
}
export async function downloadAttachment(email: string, enterprise: string, attachmentId: string, request: Request) {
  const { row, parts } = await collaborationScope(email, enterprise, (tx, scope) => attachmentSnapshotTx(tx, scope, attachmentId));
  // DB client has been released before any file/network read starts.
  const size = Number(row.bytes); let range: ReturnType<typeof attachmentRange>;
  const headers = new Headers({ ...PRIVATE_HEADERS, 'accept-ranges': 'bytes', 'content-type': row.mime,
    'content-disposition': disposition(row.name, new URL(request.url).searchParams.get('preview') === '1' && row.inline_ok),
    'content-security-policy': "sandbox; default-src 'none'", 'cross-origin-resource-policy': 'same-origin', 'referrer-policy': 'no-referrer' });
  try { range = attachmentRange(request.headers.get('range'), size); }
  catch { headers.set('content-range', `bytes */${size}`); return new Response(null, { status: 416, headers }); }
  headers.set('content-length', String(Math.max(0, range.end - range.start + 1)));
  if (range.partial) headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`);
  if (!size) return new Response(null, { headers });
  const backend = collaborationStorage().backend(row.backend); const abort = new AbortController();
  let index = Math.floor(range.start / row.chunk_bytes), reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let closed = false, remaining = 0;
  const finish = async () => { if (closed) return; closed = true; abort.abort(); request.signal.removeEventListener('abort', onAbort);
    const r = reader; reader = undefined; if (r) { await r.cancel().catch(() => {}); r.releaseLock(); } };
  const onAbort = () => { void finish(); }; request.signal.addEventListener('abort', onAbort, { once: true });
  if (request.signal.aborted) await finish();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (closed) { controller.close(); return; }
        for (;;) {
          if (!reader) {
            if (index >= parts.length || index * row.chunk_bytes > range.end) { await finish(); controller.close(); return; }
            const part = parts[index++], offset = part.part * row.chunk_bytes;
            const start = Math.max(0, range.start - offset), end = Math.min(part.bytes - 1, range.end - offset); remaining = end - start + 1;
            const response = await backend.get(part.object_key, `bytes=${start}-${end}`, abort.signal);
            if (response.status !== 206 || Number(response.headers.get('content-length')) !== remaining || !response.body) {
              await response.body?.cancel().catch(() => {}); throw new Error('文件分块读取失败');
            }
            reader = response.body.getReader();
          }
          const next = await reader.read();
          if (next.done) { reader.releaseLock(); reader = undefined; if (remaining) throw new Error('文件分块截断'); continue; }
          remaining -= next.value.byteLength; if (remaining < 0) throw new Error('文件分块超过清单长度');
          controller.enqueue(next.value); return;
        }
      } catch (error) { await finish(); controller.error(error); }
    }, cancel() { return finish(); },
  }, { highWaterMark: 1 });
  return new Response(body, { status: range.partial ? 206 : 200, headers });
}

/** Module-owned bounded reaper. Never deletes ready files or an existing message reference.
 * No storage I/O while a transaction/client is held. Cancelled/expired tombstones are retained;
 * failed DELETE is retried on the next sweep. Call from active upload traffic at most once/minute.
 */
export async function cleanupCollaborationUploads(batch = 8) {
  await ensureCollaborationSchema(); const limit = Math.max(1, Math.min(32, batch));
  const tx = await getPool().connect(); let discard = false; let candidates: Array<{ row: UploadRow; parts: PartRow[] }> = [];
  try {
    await tx.query('BEGIN'); await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'");
    const rows: UploadRow[] = (await tx.query(`SELECT u.* FROM app_collab_uploads u WHERE u.status IN ('uploading','cancelled','expired') AND u.expires_at<now()
      AND (u.status='uploading' OR EXISTS(SELECT 1 FROM app_collab_parts p WHERE p.upload_id=u.id))
      AND u.published_at IS NULL AND NOT EXISTS(SELECT 1 FROM app_collab_messages m WHERE u.id=ANY(m.attachment_ids))
      ORDER BY u.expires_at,u.id LIMIT $1 FOR UPDATE OF u SKIP LOCKED`, [limit])).rows;
    for (const row of rows) {
      await tx.query("UPDATE app_collab_uploads SET status='expired',expires_at=clock_timestamp()+interval '10 minutes' WHERE id=$1", [row.id]);
      // Only delete previously fenced uploads, not a part that may still be in flight at initial expiry.
      if (row.status !== 'uploading') candidates.push({ row, parts: (await tx.query('SELECT * FROM app_collab_parts WHERE upload_id=$1 ORDER BY part LIMIT 128', [row.id])).rows });
    }
    await tx.query('COMMIT');
  } catch (error) { try { await tx.query('ROLLBACK'); } catch { discard = true; } throw error; }
  finally { tx.release(discard); }
  let deletedParts = 0;
  for (const { row, parts } of candidates) {
    for (const part of parts) {
      await collaborationStorage().backend(row.backend).delete(part.object_key);
      await getPool().query(`DELETE FROM app_collab_parts p USING app_collab_uploads u WHERE p.upload_id=u.id AND u.id=$1 AND p.part=$2
        AND u.status='expired' AND u.published_at IS NULL`, [row.id, part.part]); deletedParts++;
    }
  }
  return { uploads: candidates.length, deletedParts };
}
let nextCleanup = 0; let cleanup: Promise<unknown> | undefined;
export async function maybeCleanupUploads() {
  if (cleanup || Date.now() < nextCleanup) return;
  nextCleanup = Date.now() + 60_000; cleanup = cleanupCollaborationUploads().catch(() => {}).finally(() => { cleanup = undefined; });
  await cleanup;
}
