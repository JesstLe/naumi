import 'server-only';
import { createHash } from 'node:crypto';
import { authenticatedEmail } from '../request-auth';
import { readHarnessBody, assertHarnessSessionId, harnessErrorResponse } from './harness';
import { getSession } from './runtime';

const paths = new Set(['/api/agent', '/api/agent/session', '/api/canvas/assistant', '/api/canvas/assistant/control']);
const privateHeaders = { 'cache-control': 'private, no-store', vary: 'Cookie, Authorization' };
function unavailable() { return Response.json({ error: '原会话连接尚未核实，请稍后继续，勿重复提交' }, { status: 503, headers: privateHeaders }); }
function endToEndHeaders(input: Headers) {
  const headers = new Headers(input);
  const nominated = (headers.get('connection') || '').split(',').map(name => name.trim()).filter(Boolean);
  for (const name of [...nominated, 'connection', 'keep-alive', 'proxy-connection', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding']) headers.delete(name);
  return headers;
}

/** Existing process-owned conversations remain on the legacy process. This is
 * discovery against the original authenticated endpoint, NOT a client-selected
 * backend or an auth bypass. New/missing sessions use the current handler.
 * Old services and their in-flight SSE connections must remain running. */
export async function forwardLegacyAgentSession(request: Request): Promise<Response | null> {
  const configured = process.env.NAUMI_AGENT_LEGACY_ORIGIN;
  if (!configured) return null;
  let origin: URL;
  try {
    origin = new URL(configured);
    const loopback = origin.hostname === '127.0.0.1';
    if (origin.protocol !== 'http:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
        !(loopback || origin.hostname === 'naumi-staging-app-1' && origin.port === '3000') ||
        origin.origin === new URL(process.env.INTERNAL_APP_ORIGIN || 'http://127.0.0.1:3000').origin) return unavailable();
  } catch { return unavailable(); }
  const url = new URL(request.url);
  if (!paths.has(url.pathname)) return null;
  const email = await authenticatedEmail(request);
  if (!email) return Response.json({ error: '请先登录' }, { status: 401, headers: privateHeaders });
  let body: Record<string, unknown> = {};
  try { if (!['GET', 'HEAD', 'DELETE'].includes(request.method)) body = await readHarnessBody(request.clone()); }
  catch (error) { return harnessErrorResponse(error); }
  const canvas = url.pathname.startsWith('/api/canvas/');
  if (canvas && url.pathname === '/api/canvas/assistant' && request.method === 'POST' && body.mode !== 'agent') return null;
  let sessionId = String(body.sessionId || body.id || url.searchParams.get('sessionId') || url.searchParams.get('id') || '');
  if (!sessionId) return null;
  const projectKey = String(body.projectKey || url.searchParams.get('projectKey') || '').trim().slice(0, 200);
  const anchorId = String(body.anchorId || url.searchParams.get('anchorId') || '').trim();
  if (canvas && !sessionId.startsWith('cv-')) {
    if (!/^[\w-]{8,80}$/.test(sessionId) || !projectKey && !anchorId) return null;
    const scope = projectKey ? 'project:' + projectKey : anchorId;
    sessionId = 'cv-' + createHash('sha256').update(scope).digest('hex').slice(0,12) + '-' + createHash('sha256').update(sessionId).digest('hex').slice(0,32);
  }
  try { assertHarnessSessionId(sessionId, canvas ? 'canvas' : 'workbench'); }
  catch (error) { return harnessErrorResponse(error); }
  // A session already owned by this process uses its existing project/account
  // checks. Legacy downtime must not break new conversations on the new slot.
  if (getSession(email, sessionId)) return null;
  const headers = endToEndHeaders(request.headers);
  // These original handlers enforce both owner account and canvas project/anchor.
  // A random legacy session ID can never access another account's state.
  const probeUrl = new URL(canvas ? '/api/canvas/assistant/control' : '/api/agent', origin);
  const probeHeaders = new Headers(headers); probeHeaders.set('content-type', 'application/json');
  if (!canvas) { probeUrl.searchParams.set('sessionId', sessionId); probeUrl.searchParams.set('since', String(Number.MAX_SAFE_INTEGER)); }
  try {
    const probe = await fetch(probeUrl, { method: canvas ? 'POST' : 'GET', headers: probeHeaders,
      ...(canvas ? { body: JSON.stringify({ action: 'poll', sessionId, ...(projectKey ? { projectKey } : {}), ...(anchorId ? { anchorId } : {}) }) } : {}),
      redirect: 'error', cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]) });
    const exists = probe.status === 200 && probe.headers.get('content-type')?.includes('application/json');
    // On c05 the literal endpoint returns 200 only for a live owner-scoped Map
    // entry. Do not buffer its potentially large event history just for discovery.
    await probe.body?.cancel();
    if (probe.status === 404) return null;
    if (!exists) return unavailable();
    const target = new URL(url.pathname + url.search, origin);
    const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers, redirect: 'error', cache: 'no-store', signal: request.signal };
    if (!['GET', 'HEAD'].includes(request.method)) { init.body = request.body; init.duplex = 'half'; }
    // Exactly one mutation/stream forward. Never retry/fall back to a second
    // execution after an ambiguous network error or an upstream rejection.
    const response = await fetch(target, init);
    const returned = endToEndHeaders(response.headers);
    for (const name of ['content-encoding','set-cookie']) returned.delete(name);
    returned.set('cache-control','private, no-store'); returned.set('x-naumi-runtime','legacy');
    return new Response(response.body, { status: response.status, headers: returned });
  } catch { return unavailable(); }
}
