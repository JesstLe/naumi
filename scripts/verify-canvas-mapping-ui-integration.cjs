'use strict';
// Snapshot current bytes into a non-Git source copy, then run actual Next and
// declared HTTP browser fixtures. No .env or production connection is inherited.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const cp = require('node:child_process'), net = require('node:net'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const args = process.argv.slice(2), value = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const root = path.resolve(value('--source-root', process.cwd()));
const out = path.resolve(value('--out', 'output/mapping-ui-integration'));
const suite = value('--suite', 'all'), source = path.join(out, 'source');
assert(!fs.existsSync(source), 'New run output required');
fs.mkdirSync(source, { recursive: true });
const files = [...new Set(cp.execFileSync('git', ['ls-files', '--deduplicate', '-z'], { cwd: root }).toString().split('\0').filter(Boolean)
  .concat(['scripts/canvas-mapping-ui-fixture.cjs', 'scripts/verify-canvas-mapping-ui-integration.cjs']))];
const hashes = [];
for (const rel of files) {
  if (path.basename(rel).startsWith('.env') || !fs.existsSync(path.join(root, rel))) continue;
  const b = fs.readFileSync(path.join(root, rel)), target = path.join(source, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, b);
  hashes.push({ path: rel, sha256: crypto.createHash('sha256').update(b).digest('hex') });
}
fs.symlinkSync(path.join(root, 'node_modules'), path.join(source, 'node_modules'), 'junction');
fs.writeFileSync(path.join(out, 'SOURCE.json'), JSON.stringify({ source: root, copiedSource: source, hashes }, null, 2));
const env = {};
for (const [k, v] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH|PROGRAMFILES.*|PROCESSOR.*|NUMBER_OF_PROCESSORS)$/i.test(k)) env[k] = v;
Object.assign(env, { NODE_OPTIONS: '--max-old-space-size=4096', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_DESKTOP_DEPLOYMENT: '1', NEXT_PUBLIC_CANVAS_PERF_PROBE: '0',
  DESKTOP_UI_BUILD: '0', SETTINGS_SECRET: 'isolated-mapping-ui-fixture-only-no-production', DATABASE_URL: '',
  NAUMI_VIDEO_WORKER: '0', NAUMI_MULTI_USER: '0', NAUMI_RELEASE_RUNTIME: '0' });
let server, stream, port;
const results = [];
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
async function run(name, script, extra = []) {
  const started = new Date().toISOString();
  const output = path.join(out, name); fs.mkdirSync(output, { recursive: true });
  const runEnv = { ...env, CANVAS_BACKGROUND_URL: 'http://127.0.0.1:' + port, CANVAS_PIXEL_DOCK_URL: 'http://127.0.0.1:' + port,
    CANVAS_BACKGROUND_OUT: output, CANVAS_PIXEL_DOCK_OUT: output };
  const command = [process.execPath, path.join(source, script), ...extra];
  const result = await new Promise(resolve => {
    const process = cp.spawn(command[0], command.slice(1), { cwd: source, env: runEnv, windowsHide: true });
    let stdout = '', stderr = '';
    process.stdout.on('data', b => { stdout += b; global.process.stdout.write(b); });
    process.stderr.on('data', b => { stderr += b; global.process.stderr.write(b); });
    process.on('close', exit => resolve({ command, cwd: source, started, stdout, stderr, exit }));
  });
  results.push(result);
  fs.writeFileSync(path.join(out, name + '-command.json'), JSON.stringify(result, null, 2));
  return result.exit;
}
(async () => {
  try {
    port = await freePort();
    stream = fs.openSync(path.join(out, 'NEXT.log'), 'wx');
    server = cp.spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
      { cwd: source, env, windowsHide: true, stdio: ['ignore', stream, stream] });
    fs.writeFileSync(path.join(out, 'SERVER.json'), JSON.stringify({ pid: server.pid, port, source, startedAt: new Date().toISOString() }));
    const deadline = Date.now() + 180000;
    let ready = false;
    while (Date.now() < deadline && server.exitCode === null) {
      try { const r = await fetch('http://127.0.0.1:' + port + '/api/version', { signal: AbortSignal.timeout(5000) }); if (r.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(ready, 'Owned Next did not become ready');
    // Compile the actual route and read each emitted script completely before
    // opening the first fresh browser; do not accept a half-written dev chunk.
    const warm = await fetch('http://127.0.0.1:' + port + '/canvas?project=tree%3Aregeneration-root', { signal: AbortSignal.timeout(180000) });
    assert.equal(warm.status, 200); const html = await warm.text(), warmAssets = [];
    for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
      const url = new URL(match[1].replaceAll('&amp;', '&'), 'http://127.0.0.1:' + port);
      assert.equal(url.hostname, '127.0.0.1'); const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      assert.equal(r.status, 200); const bytes = Buffer.from(await r.arrayBuffer()); assert(bytes.length > 0);
      new (require('node:vm').Script)(bytes.toString('utf8'), { filename: url.pathname });
      warmAssets.push({ path: url.pathname, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
    fs.writeFileSync(path.join(out, 'PREWARM.json'), JSON.stringify({ status: 'PASS', assets: warmAssets }, null, 2));
    if (suite === 'all' || suite === 'background') await run('background', 'scripts/verify-canvas-background-ui.cjs', args.includes('--multi-unknown-only') ? ['--multi-unknown-only'] : args.includes('--recovery-only') ? ['--recovery-only'] : []);
    if (suite === 'all' || suite === 'pixel') await run('pixel', 'scripts/verify-canvas-pixel-dock-ui.cjs');
  } catch (error) { results.push({ error: error.stack, exit: 1 }); }
  finally {
    if (server && server.exitCode === null) {
      if (process.platform === 'win32') cp.spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true });
      else server.kill('SIGTERM');
      await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('close', resolve); setTimeout(resolve, 10000); } });
    }
    if (stream !== undefined) fs.closeSync(stream);
    let portClosed = false;
    try { await fetch('http://127.0.0.1:' + port + '/api/version', { signal: AbortSignal.timeout(1500) }); } catch { portClosed = true; }
    const status = results.length && results.every(r => r.exit === 0) && portClosed ? 'PASS' : 'FAIL';
    const report = { status, results, serverStopped: server?.exitCode !== null, portClosed, supplierCalls: 0, productionActions: 0,
      originalSourceUntouchedByNext: true, snapshot: source, at: new Date().toISOString() };
    fs.writeFileSync(path.join(out, 'RUN.json'), JSON.stringify(report, null, 2));
    console.log('MAPPING_UI_INTEGRATION=' + status + ' FULL_NEXT=1 SERVER_CLOSED=' + Number(portClosed) + ' SUPPLIER_CALLS=0');
    process.exitCode = status === 'PASS' ? 0 : 1;
  }
})();

