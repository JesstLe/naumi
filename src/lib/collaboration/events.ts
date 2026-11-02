import 'server-only';
import type { PoolClient } from 'pg';
import { getPool } from '@/lib/db';
import type { CollaborationEvent } from './contracts';
import { decodeCursor, encodeCursor } from './validation';
import { activeCollaborationLeases, type CollaborationScope } from '@/lib/enterprise/collaboration-access';
import { emitCollaborationEventTx } from '@/lib/enterprise/collaboration-events';
export { emitCollaborationEventTx } from '@/lib/enterprise/collaboration-events';

export async function eventCursorTx(tx: PoolClient, scope: CollaborationScope) {
  const row = (await tx.query('SELECT seq FROM app_collab_event_heads WHERE enterprise_id=$1', [scope.enterpriseId])).rows[0];
  return cursor(scope.enterpriseId, scope.actorId, String(row?.seq || '0'));
}
const cursor = (enterprise: string, actor: string, seq: string) => encodeCursor(`events:${enterprise}:${actor}`, seq);
type Subscription = { enterprise: string; actor: string; seq: bigint; enqueue: (event: CollaborationEvent) => void; close: () => void };
type Head = { seq: bigint; listeners: Set<Subscription> };

/** One bounded incremental poll per process (not per user). No listener connection,
 * new Pool, tick-pool, idle checkout, or per-user message scan. Durable rows bridge instances.
 */
export class CollaborationEventHub {
  private heads = new Map<string, Head>();
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private lastMaintenance = 0;
  get size() { return [...this.heads.values()].reduce((n, h) => n + h.listeners.size, 0); }
  subscribe(sub: Subscription) {
    let head = this.heads.get(sub.enterprise);
    if (!head) this.heads.set(sub.enterprise, head = { seq: sub.seq, listeners: new Set() });
    head.seq = head.seq < sub.seq ? head.seq : sub.seq;
    head.listeners.add(sub);
    this.schedule(0);
    return () => { head!.listeners.delete(sub); if (!head!.listeners.size) this.heads.delete(sub.enterprise);
      if (!this.heads.size && this.timer) { clearTimeout(this.timer); this.timer = undefined; } };
  }
  private schedule(ms: number) {
    if (!this.timer && !this.running && this.heads.size) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.poll(); }, ms); this.timer.unref?.();
    }
  }
  async poll() {
    if (this.running || !this.heads.size) return;
    this.running = true;
    try {
      if (Date.now() - this.lastMaintenance > 15_000) { this.lastMaintenance = Date.now(); await this.maintain(); }
      // Fix the audience and cursor used for this particular SQL snapshot. A new
      // subscriber with an older cursor must catch up on the next poll, not jump
      // forward when a query already in flight returns only newer events.
      const entries = [...this.heads].map(([enterprise, head]) => ({ enterprise, head, after: head.seq, listeners: new Set(head.listeners) }));
      const batches = new Map(entries.map(entry => [entry.enterprise, entry]));
      if (!entries.length) return;
      // Tenant and sequence indexes bound the query; 256 events/tenant per page.
      const rows = (await getPool().query(`SELECT q.enterprise_id,h.seq AS high,e.seq,e.topics,e.audience,e.conversation_id
        FROM unnest($1::uuid[],$2::bigint[]) q(enterprise_id,after_seq)
        LEFT JOIN app_collab_event_heads h USING(enterprise_id)
        LEFT JOIN LATERAL(SELECT * FROM app_collab_events e WHERE e.enterprise_id=q.enterprise_id
          AND e.seq>q.after_seq ORDER BY e.seq LIMIT 256)e ON true ORDER BY q.enterprise_id,e.seq`, [entries.map(e => e.enterprise), entries.map(e => String(e.after))])).rows;
      for (const row of rows) {
        const head = this.heads.get(row.enterprise_id), batch = batches.get(row.enterprise_id); if (!head || head !== batch?.head) continue;
        const high = BigInt(row.high || 0);
        for (const sub of batch.listeners) {
          if (!head.listeners.has(sub)) continue;
          if (sub.seq > high || high - sub.seq > BigInt(10000) || row.seq === null && sub.seq < high) {
            sub.seq = high; sub.enqueue({ id: cursor(sub.enterprise, sub.actor, String(high)), type: 'reset', topics: ['members','conversations','messages','shares'] });
          } else if (row.seq !== null && BigInt(row.seq) > sub.seq) {
            sub.seq = BigInt(row.seq);
            if (!row.audience || row.audience.includes(sub.actor)) sub.enqueue({ id: cursor(sub.enterprise, sub.actor, row.seq),
              type: 'invalidate', topics: row.topics, ...(row.conversation_id ? { conversationId: row.conversation_id } : {}) });
          }
        }
        if (head.listeners.size) head.seq = [...head.listeners].reduce((min, sub) => sub.seq < min ? sub.seq : min, high);
      }
    } catch {
      // End transport rather than quietly leaving a stream apparently live after DB failure.
      for (const head of [...this.heads.values()]) for (const sub of [...head.listeners]) sub.close();
    } finally { this.running = false; this.schedule(1000); }
  }
  private async maintain() {
    const subscriptions = [...this.heads.values()].flatMap(h => [...h.listeners]);
    if (!subscriptions.length) return;
    const allowed = await activeCollaborationLeases(subscriptions.map(s => ({ enterpriseId: s.enterprise, actorId: s.actor })));
    for (const sub of subscriptions) if (!allowed.has(`${sub.enterprise}:${sub.actor}`)) sub.close();
    const tx = await getPool().connect(); let discard = false;
    try {
      await tx.query('BEGIN'); await tx.query("SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'");
      const expired = (await tx.query(`DELETE FROM app_collab_presence WHERE ctid IN
        (SELECT ctid FROM app_collab_presence WHERE expires_at<=now() ORDER BY expires_at LIMIT 200 FOR UPDATE SKIP LOCKED) RETURNING enterprise_id`)).rows;
      for (const enterprise of [...new Set<string>(expired.map(r => r.enterprise_id))].sort()) await emitCollaborationEventTx(tx, enterprise, ['members']);
      await tx.query(`DELETE FROM app_collab_events WHERE (enterprise_id,seq) IN
        (SELECT e.enterprise_id,e.seq FROM app_collab_event_heads h JOIN app_collab_events e ON e.enterprise_id=h.enterprise_id
        AND e.seq<h.seq-10000 ORDER BY e.enterprise_id,e.seq LIMIT 500)`);
      await tx.query('COMMIT');
    } catch (error) { try { await tx.query('ROLLBACK'); } catch { discard = true; } throw error; }
    finally { tx.release(discard); }
  }
  close() { for (const h of [...this.heads.values()]) for (const s of [...h.listeners]) s.close(); if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}
const hubKey = Symbol.for('naumi.collaboration.events.v1');
const holder = process as typeof process & { [hubKey]?: CollaborationEventHub };
export const collaborationEventHub = holder[hubKey] ||= new CollaborationEventHub();

export function collaborationEventStream(request: Request, scope: CollaborationScope, initialCursor: string, hub = collaborationEventHub) {
  const raw = new URL(request.url).searchParams.get('cursor') || request.headers.get('last-event-id') || initialCursor;
  const seq = decodeCursor(raw, `events:${scope.enterpriseId}:${scope.actorId}`)!;
  if (!/^\d{1,19}$/.test(seq)) throw Object.assign(new Error('事件游标无效'), { status: 400 });
  const encoder = new TextEncoder(); let cleanup = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false; let detach = () => {}; let heartbeat: ReturnType<typeof setInterval> | undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined;
      const close = () => { if (closed) return; closed = true; detach(); clearInterval(heartbeat); clearTimeout(lifetime);
        request.signal.removeEventListener('abort', close); try { controller.close(); } catch {} };
      const write = (text: string) => { if (closed) return;
        if ((controller.desiredSize ?? 0) < 0) { close(); return; } controller.enqueue(encoder.encode(text)); };
      detach = hub.subscribe({ enterprise: scope.enterpriseId, actor: scope.actorId, seq: BigInt(seq), close,
        enqueue: event => write(`id: ${event.id}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`) });
      heartbeat = setInterval(() => write('event: heartbeat\ndata: {}\n\n'), 15_000); heartbeat.unref?.();
      // Bounded auth-session lifetime as well as batched membership leases.
      lifetime = setTimeout(close, 5 * 60_000); lifetime.unref?.();
      cleanup = close; request.signal.addEventListener('abort', close, { once: true });
      if (request.signal.aborted) close(); else write(': connected\n\n');
    }, cancel() { cleanup(); },
  }, { highWaterMark: 64 });
  return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'private, no-store',
    'x-accel-buffering': 'no', 'vary': 'Cookie, Authorization', 'x-content-type-options': 'nosniff' } });
}
