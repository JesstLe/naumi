/* Process-wide HTTP accounting loaded before Next bundles. No task cancellation,
 * supplier requests, routing, or admission changes are performed by this module. */
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const KEY = Symbol.for('naumi.release.http-observer.v1');

function install(options = {}) {
  if (globalThis[KEY]) return globalThis[KEY];
  const env = options.env || process.env;
  if (env.NAUMI_RELEASE_RUNTIME !== '1') return null;
  const secret = String(env.RELEASE_CONTROL_SECRET || '');
  const instanceId = String(env.NAUMI_INSTANCE_ID || env.NAUMI_RELEASE_INSTANCE_ID || '');
  const commit = String(env.SOURCE_COMMIT || env.NAUMI_RELEASE_COMMIT || '');
  if (secret.trim().length < 32 || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(instanceId) || !/^[a-f0-9]{40}$/.test(commit)) {
    throw Error('RELEASE_HTTP_FIXED_IDENTITY_AND_SECRET_REQUIRED');
  }
  if (env.NAUMI_RELEASE_INSTANCE_ID && env.NAUMI_RELEASE_INSTANCE_ID !== instanceId ||
      env.NAUMI_RELEASE_COMMIT && env.NAUMI_RELEASE_COMMIT !== commit) throw Error('RELEASE_HTTP_IDENTITY_CONFLICT');
  // Generated once by the process preload, never reused from a Docker environment.
  const bootId = crypto.randomUUID();
  env.NAUMI_RELEASE_BOOT_ID = bootId;
  env.NAUMI_RELEASE_BOOT_SOURCE = 'preload';
  const targetPort = Number(env.PORT || 3000);
  const controlPort = Number(env.NAUMI_RELEASE_HTTP_CONTROL_PORT || 3002);
  if (![targetPort, controlPort].every(n => Number.isInteger(n) && n >= 0 && n <= 65535) || targetPort === controlPort) {
    throw Error('RELEASE_HTTP_INVALID_PORTS');
  }
  const startedAt = new Date().toISOString(), active = new Map();
  let seen = 0, ended = 0, accountingFault = false, control;
  const priorEmit = http.Server.prototype.emit;
  const ignored = path => /^\/api\/internal\/release\/(?:status|control)(?:\?|$)/.test(path);
  const snapshot = () => ({schemaVersion: 1, identity: {instanceId, bootId, commit, startedAt},
    observedAt: new Date().toISOString(), transport: {activeRequests: active.size, startedRequests: seen,
      finishedRequests: ended, accountingFault, completeFromProcessStart: true,
      coverage: 'http-request-response-lifetime-only', upgrades: 'not-supported',
      backgroundTasks: null, agentSessions: null, workerLeases: null},
    oldestActiveAt: active.size ? [...active.values()].reduce((a, b) => a < b ? a : b) : null});
  function releaseEmit(event, ...args) {
    if (event !== 'request' || this === control) return priorEmit.call(this, event, ...args);
    const [request, response] = args;
    if (request.socket?.localPort !== targetPort || ignored(String(request.url || ''))) return priorEmit.call(this, event, ...args);
    const id = ++seen;
    active.set(id, new Date().toISOString());
    let closed = false;
    const finish = () => {if (!closed) {closed = true; active.delete(id); ended++;}};
    response.once('finish', finish); response.once('close', finish);
    try { return priorEmit.call(this, event, ...args); }
    catch (error) {accountingFault = true; finish(); throw error;}
  }
  http.Server.prototype.emit = releaseEmit;
  const expected = crypto.createHash('sha256').update(secret).digest();
  control = http.createServer((request, response) => {
    const supplied = crypto.createHash('sha256').update(String(request.headers['x-release-control-secret'] || '')).digest();
    const send = (status, data) => {response.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'}); response.end(JSON.stringify(data));};
    if (!crypto.timingSafeEqual(expected, supplied)) return send(401, {error: 'UNAUTHORIZED'});
    if (request.method !== 'GET' || request.url !== '/status') return send(404, {error: 'NOT_FOUND'});
    send(200, snapshot());
  });
  control.requestTimeout = 5000; control.headersTimeout = 5000;
  const ready = new Promise((resolve, reject) => {control.once('error', reject); control.listen(controlPort, '127.0.0.1', resolve);});
  const api = {snapshot, ready, control, async close() {
    if (http.Server.prototype.emit === releaseEmit) http.Server.prototype.emit = priorEmit;
    await new Promise(resolve => control.close(resolve)); delete globalThis[KEY];
  }};
  globalThis[KEY] = api;
  return api;
}

module.exports = {install};
if (process.env.NAUMI_RELEASE_RUNTIME === '1') {
  const installed = install();
  installed.ready.catch(() => {console.error('RELEASE_HTTP_OBSERVER_START_FAILED'); process.exitCode = 78; process.kill(process.pid, 'SIGTERM');});
}
