// Isolated A15 harness: real rate limiter/pool and real route exports. Only
// unrelated authentication, mail, canvas and agent execution are fixture I/O.
import { rateLimit } from '../src/lib/rate-limit';
import { checkRateLimit } from '../src/lib/rate-limit-http';
import { getPool, closeDatabasePools } from '../src/lib/db/connection';
import * as forgot from '../src/app/api/auth/forgot/route';
import * as admin from '../src/app/api/admin/login/route';
import * as agent from '../src/app/api/agent/route';
import * as canvas from '../src/app/api/canvas/workflow-import/asset/route';
import type { PoolClient } from 'pg';

const effects: Record<string, number> = { mail: 0, password: 0, prompt: 0, canvas: 0, session: 0 };
const session = () => {
  effects.session++;
  return { running: false, events: [] as any[], harness: { sanitize: (v: unknown) => v, publicText: (v: unknown) => v },
    agent: { state: { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'fixture reply' }] }] },
      prompt: async () => { effects.prompt++; }, abort() {} } };
};
class HarnessError extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }
// Virtual modules emitted by verify-distributed-rate-limit.mjs read this object
// when called, not at import time. They never contact a supplier or production.
(globalThis as any).__a15 = {
  dbEnabled: true, supabaseEnabled: false, ADMIN_COOKIE: 'a15-admin', SESSION_TTL_MS: 60000, MODEL_ID: 'fixture',
  SkillError: class extends Error {}, HarnessError,
  multiUserEnabled: async () => true, userExists: async () => true, signResetToken: () => 'fixture',
  sendMail: async () => { effects.mail++; }, getRuntimeBrand: async () => ({ name: 'fixture' }),
  clientIp: () => '127.0.0.1',
  adminPasswordState: async () => ({ configured: true, authenticated: true }),
  authenticateAdminPassword: async (password: string) => { effects.password++; return password === 'fixture' ? 'fixture-session' : null; },
  activeNativeUserEmail: async () => null, getUserRole: async () => 'admin',
  authenticatedEmail: async (req: Request) => req.headers.get('x-fixture-user'),
  resolveUserEmail: async (req: Request) => req.headers.get('x-fixture-user'),
  fillWorkflowAsset: async () => { effects.canvas++; return { image: 'fixture.png' }; },
  releaseRuntimeEnabled: () => false, forwardLegacyAgentSession: async () => null,
  withBiRequest: (_r: Request, fn: () => unknown) => fn(),
  withCreationRoute: (_r: Request, fn: () => unknown) => fn(),
  readHarnessBody: (req: Request) => req.json(), assertHarnessSessionId: () => {},
  harnessErrorResponse: (e: HarnessError) => Response.json({ error: e.code }, { status: e.status }),
  resolveImageSkill: async () => undefined, requestedTextModel: () => 'fixture', agentVisionEnabled: () => false,
  getOpenAISettings: async () => ({ apiKey: 'fixture' }), getOrCreateSession: async () => session(),
  primeAgentSystemPrompt: () => {}, persistAgentSession: async () => {},
  appendSessionEvent: (s: any, type: string, data: unknown) => s.events.push({ type, data }), buildTaskPlan: () => [],
};
const held: PoolClient[] = [];
const nativeNow = Date.now;
async function invoke(input: any) {
  if (input.op === 'stats') { const pool = getPool(); return { pid: process.pid, total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }; }
  if (input.op === 'hold') { for (let i = 0; i < input.count; i++) held.push(await getPool().connect()); return held.length; }
  if (input.op === 'release') { for (const client of held.splice(0)) client.release(); return true; }
  if (input.op === 'close') { await closeDatabasePools(); return true; }
  if (input.op === 'effects') return effects;
  if (input.op === 'calls') {
    const results: unknown[] = []; let index = 0;
    await Promise.all(Array.from({ length: input.concurrency || 1 }, async () => {
      for (;;) { const i = index++; if (i >= input.calls.length) return;
        const call = input.calls[i]; if (call.now !== undefined) Date.now = () => call.now;
        try { results[i] = await rateLimit(call.key, call.limit, call.window); }
        catch (error) { results[i] = { code: (error as any).code || 'ERROR' }; }
      }
    }));
    Date.now = nativeNow; return results;
  }
  if (input.op === 'check') { const result = await checkRateLimit(input.key, input.limit, input.window); return result instanceof Response ? { status: result.status, body: await result.json() } : result; }
  if (input.op === 'route') {
    const headers: Record<string, string> = { host: 'localhost', origin: input.crossSite ? 'http://other.test' : 'http://localhost', ...input.headers };
    if (input.user !== null) headers['x-fixture-user'] = input.user || 'fixture@example.test';
    let body: BodyInit;
    if (input.route === 'canvas') { const form = new FormData(); form.set('image', new File([new Uint8Array([1,2,3])], 'fixture.png', { type: 'image/png' })); form.set('id', 'fixture'); body = form; }
    else { headers['content-type'] = 'application/json'; body = JSON.stringify(input.body || (input.route === 'forgot' ? { email: 'fixture@example.test' } : input.route === 'admin' ? { password: 'fixture' } : { message: 'fixture', sessionId: 'ag-fixture' })); }
    const method = input.method || 'POST';
    const request = new Request('http://localhost/api/' + input.route, { method, headers, body });
    const modules: Record<string, any> = { forgot, admin, agent, canvas };
    const response: Response = await modules[input.route][method](request);
    const text = await response.text();
    return { status: response.status, text, contentType: response.headers.get('content-type'), cookie: response.headers.has('set-cookie'), effects: { ...effects } };
  }
  throw new Error('UNKNOWN_FIXTURE_OPERATION');
}
process.on('message', async (input: any) => {
  try { process.send?.({ id: input.id, result: await invoke(input) }); }
  catch (error) { process.send?.({ id: input.id, failure: error instanceof Error ? error.stack : String(error) }); }
});
