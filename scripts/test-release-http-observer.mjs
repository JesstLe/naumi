import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {install} = require('./release-http-observer.cjs');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const secret = 'release-http-fixture-secret-0123456789abcdef';

test('disabled observer does not patch HTTP or generate an identity', () => {
  const emit = http.Server.prototype.emit, env = {};
  assert.equal(install({env}), null); assert.equal(http.Server.prototype.emit, emit); assert.equal(env.NAUMI_RELEASE_BOOT_ID, undefined);
});
test('configured observer requires fixed identity and distinct ports', () => {
  assert.throws(() => install({env: {NAUMI_RELEASE_RUNTIME: '1'}}), /IDENTITY_AND_SECRET/);
  assert.throws(() => install({env: {NAUMI_RELEASE_RUNTIME: '1', RELEASE_CONTROL_SECRET: secret, NAUMI_INSTANCE_ID: 'fixture', SOURCE_COMMIT: 'a'.repeat(40), PORT: '3000', NAUMI_RELEASE_HTTP_CONTROL_PORT: '3000'}}), /INVALID_PORTS/);
});
test('actual streaming HTTP lifetime, control auth, ignored control, process boot and partial background coverage', async () => {
  let release;
  const app = http.createServer((request, response) => {
    if (request.url === '/stream') {response.writeHead(200, {'content-type': 'text/event-stream'}); response.write('event: open\ndata: {}\n\n'); release = () => response.end('event: final\ndata: {}\n\n');}
    else response.end('ok');
  });
  const port = await listen(app);
  const env = {NAUMI_RELEASE_RUNTIME: '1', RELEASE_CONTROL_SECRET: secret, NAUMI_INSTANCE_ID: 'fixture-web', SOURCE_COMMIT: 'a'.repeat(40), PORT: String(port), NAUMI_RELEASE_HTTP_CONTROL_PORT: '0', NAUMI_RELEASE_BOOT_ID: 'old-reused-boot'};
  const observer = install({env}); await observer.ready;
  const control = `http://127.0.0.1:${observer.control.address().port}`;
  const state = async () => (await fetch(control + '/status', {headers: {'x-release-control-secret': secret}})).json();
  let stream;
  try {
    assert.notEqual(env.NAUMI_RELEASE_BOOT_ID, 'old-reused-boot'); assert.equal(install({env}), observer);
    assert.equal((await fetch(control + '/status')).status, 401);
    assert.equal((await fetch(control + '/control', {method: 'POST', headers: {'x-release-control-secret': secret}})).status, 404);
    assert.equal((await state()).transport.startedRequests, 0);
    stream = await fetch(`http://127.0.0.1:${port}/stream`);
    assert.equal((await state()).transport.activeRequests, 1);
    await fetch(`http://127.0.0.1:${port}/api/internal/release/status`);
    assert.equal((await state()).transport.startedRequests, 1);
    release(); await stream.text();
    let current = await state(); assert.equal(current.transport.activeRequests, 0); assert.equal(current.transport.finishedRequests, 1);
    assert.equal(current.transport.backgroundTasks, null); assert.equal(current.transport.agentSessions, null); assert.equal(current.transport.workerLeases, null);
    assert.equal(current.transport.coverage, 'http-request-response-lifetime-only'); assert.equal(current.transport.completeFromProcessStart, true);
    const oldBoot = current.identity.bootId; await observer.close();
    const next = install({env}); await next.ready; assert.notEqual(next.snapshot().identity.bootId, oldBoot); await next.close();
  } finally {release?.(); await observer.close().catch(() => {}); app.closeAllConnections(); await new Promise(resolve => app.close(resolve));}
});
