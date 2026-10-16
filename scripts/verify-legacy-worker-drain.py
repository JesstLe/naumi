#!/usr/bin/env python3
"""Real Docker pause + unchanged c05 Worker; wholly isolated HTTP fixture.

Run in Linux with Docker socket and --pid=host; no production containers,
database, accounts, media, secrets or suppliers are used.
"""
import concurrent.futures, fcntl, hashlib, http.server, importlib.util, io, json, os, pathlib, socket, tarfile, threading, time, urllib.error, urllib.request, uuid

root = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('drain', root / 'drain-legacy-worker.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
docker = module.Docker(); label = 'naumi-legacy-drain-fixture-' + uuid.uuid4().hex[:12]
secret = 'fixture-only-legacy-drain-control-20261014'
for fd, path in [(8, '/opt/naumi-reverse-hub/releases/deploy.lock'), (9, '/opt/naumi-staging/releases/deploy.lock')]:
    # Only the helper container's own filesystem, not the real server locks.
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    opened = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
    if opened != fd: os.dup2(opened, fd); os.close(opened)
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)

APP = r'''
import http from 'node:http';
let ticks=0,completed=0,aborted=0,leases=0,replies=[],bad=false;
const counts=()=>({imageJobs:leases,canvasImages:0,videoPolls:0,supplierCosts:0,imagegenItems:0});
const server=http.createServer((req,res)=>{
 if(req.headers['x-video-worker-secret']!==process.env.VIDEO_WORKER_SECRET){res.writeHead(401);res.end();return;}
 const send=body=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(body));};
 if(req.url==='/api/video/worker/tick'&&req.method==='POST'){
  ticks++;leases++;replies.push(res);res.on('close',()=>{if(!res.writableEnded)aborted++;});return;
 }
 if(req.url==='/api/video/worker/drain-status')return send(bad?{schema:1,scope:'shared-database',drained:true,counts:{},activeFences:0,activeTransactions:0,advisoryLocks:0}:{schema:1,scope:'shared-database',drained:leases===0,counts:counts(),activeFences:leases,activeTransactions:0,advisoryLocks:0,absentTables:[]});
 if(req.url==='/fixture/status')return send({ticks,completed,aborted,leases});
 if(req.url==='/fixture/release-tick'){const response=replies.shift();if(response){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({processed:1,at:'fixture'}));completed++;}return send({ok:true});}
 if(req.url==='/fixture/release-background'){leases=Math.max(0,leases-1);return send({ok:true});}
 if(req.url==='/fixture/bad-status'){bad=true;return send({ok:true});}
 if(req.url==='/fixture/good-status'){bad=false;return send({ok:true});}
 res.writeHead(404);res.end();
});server.keepAliveTimeout=200;server.listen(3000,'0.0.0.0');
'''


def api(method, path, payload=None, archive=None):
    connection = module.UnixConnection('localhost', timeout=30)
    try:
        body = archive if archive is not None else json.dumps(payload).encode() if payload is not None else None
        headers = {'content-type': 'application/x-tar' if archive is not None else 'application/json'}
        connection.request(method, '/v1.45' + path, body=body, headers=headers)
        response = connection.getresponse(); raw = response.read()
        assert response.status < 400, (method, path, response.status, raw[:120])
        return json.loads(raw) if raw else None
    finally: connection.close()


def tar(files):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        directory = tarfile.TarInfo('scripts'); directory.type = tarfile.DIRTYPE; directory.mode = 0o755; archive.addfile(directory)
        for path, data in files.items():
            item = tarfile.TarInfo(path); item.size = len(data); item.mode = 0o644; archive.addfile(item, io.BytesIO(data))
    return output.getvalue()


def wait(predicate, timeout=8):
    until = time.monotonic() + timeout
    while True:
        try:
            if predicate(): return
        except urllib.error.URLError: pass  # app startup, not a restarted process
        assert time.monotonic() < until, 'fixture deadline'
        time.sleep(.05)


legacy_path = pathlib.Path(os.environ['LEGACY_WORKER_FIXTURE_SOURCE'])
legacy = legacy_path.read_bytes(); assert hashlib.sha256(legacy).hexdigest() == os.environ['LEGACY_WORKER_FIXTURE_SHA256']
image = api('GET', '/images/node:24-bookworm-slim/json')['Id']
network = api('POST', '/networks/create', {'Name': label, 'Internal': True})['Id']
helper = docker.inspect(os.environ['HOSTNAME'])['Id']
api('POST', '/networks/' + network + '/connect', {'Container': helper})
created = []; proxy = None; app_id = None; worker_id = None
evidence = pathlib.Path(os.environ.get('LEGACY_WORKER_FIXTURE_EVIDENCE', '/tmp/drain-fixture-evidence'))
evidence.mkdir(parents=True, exist_ok=True)


def container(kind, command, files, extra=None):
    env = ['VIDEO_WORKER_SECRET=' + secret, 'NAUMI_VIDEO_WORKER=0'] + (extra or [])
    cid = api('POST', '/containers/create?name=' + label + '-' + kind, {'Image': image, 'Cmd': command, 'WorkingDir': '/fixture', 'Env': env,
        'HostConfig': {'NetworkMode': network}, 'NetworkingConfig': {'EndpointsConfig': {network: {'Aliases': ['app'] if kind == 'app' else []}}}})['Id']
    created.append(cid); api('PUT', '/containers/' + cid + '/archive?path=/fixture', archive=tar(files)); api('POST', '/containers/' + cid + '/start'); return cid


try:
    app_id = container('app', ['node', 'app.mjs'], {'app.mjs': APP.encode()})
    app_ip = docker.inspect(app_id)['NetworkSettings']['Networks'][label]['IPAddress']
    def request(path):
        with urllib.request.urlopen(urllib.request.Request('http://' + app_ip + ':3000' + path, headers={'x-video-worker-secret': secret}), timeout=3) as response:
            return json.load(response)
    wait(lambda: request('/fixture/status')['ticks'] == 0)
    class Proxy(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            with urllib.request.urlopen(urllib.request.Request('http://' + app_ip + ':3000' + self.path,
                headers={'x-video-worker-secret': self.headers.get('x-video-worker-secret', '')}), timeout=3) as response:
                data = response.read(); self.send_response(response.status); self.send_header('content-type', 'application/json'); self.end_headers(); self.wfile.write(data)
    proxy = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Proxy)
    threading.Thread(target=proxy.serve_forever, daemon=True).start()
    status_url = 'http://127.0.0.1:' + str(proxy.server_port) + '/api/video/worker/drain-status'
    worker_id = container('old-worker', ['node', 'scripts/video-worker.mjs'], {'scripts/video-worker.mjs': legacy}, ['NAUMI_APP_ORIGIN=http://app:3000', 'VIDEO_WORKER_INTERVAL_MS=5000'])
    wait(lambda: request('/fixture/status')['ticks'] == 1)
    request('/fixture/release-tick'); request('/fixture/release-background')
    wait(lambda: request('/fixture/status')['ticks'] == 2)
    # The old script installs its interval only AFTER its first await tick().
    # All checks below therefore run with the interval actually installed.
    # Failure path must undo only the pause it owns, not stop either container.
    for case in ['timeout', 'bad-shape', 'success']:
        directory = evidence / case; directory.mkdir(parents=True, exist_ok=True)
        (directory / 'lock-owner.json').write_text(json.dumps({'pid': os.getpid()}))
    try: module.drain(docker, worker_id, app_id, image, status_url, evidence / 'timeout', deadline=1)
    except TimeoutError: pass
    else: raise AssertionError('active tick must prevent drain')
    assert not docker.inspect(worker_id)['State']['Paused']; assert request('/fixture/status')['aborted'] == 0
    # Error/forged counter shape must likewise resume the original worker.
    request('/fixture/bad-status')
    try: module.drain(docker, worker_id, app_id, image, status_url, evidence / 'bad-shape', deadline=1)
    except RuntimeError as error: assert 'Incomplete drain fence coverage' in str(error)
    else: raise AssertionError('incomplete counters must not accept drain')
    request('/fixture/good-status'); assert not docker.inspect(worker_id)['State']['Paused']
    with concurrent.futures.ThreadPoolExecutor() as pool:
        future = pool.submit(module.drain, docker, worker_id, app_id, image, status_url, evidence / 'success', 15)
        wait(lambda: docker.inspect(worker_id)['State']['Paused'])
        time.sleep(5.25); assert request('/fixture/status')['ticks'] == 2, 'pause spans the real old 5-second interval'
        request('/fixture/release-tick'); wait(lambda: request('/fixture/status')['completed'] == 2)
        time.sleep(.6); assert not future.done(), 'old HTTP reply completed but asynchronous job fence is still held'
        assert request('/fixture/status')['aborted'] == 0; assert docker.inspect(app_id)['State']['Running']
        request('/fixture/release-background'); result = future.result(timeout=8)
    assert result['pausedForHandoff']; assert docker.inspect(worker_id)['State']['Paused']; assert request('/fixture/status')['ticks'] == 2
    # Reversible rollback resumes the exact same c05 process, not a replacement.
    old_pid = docker.inspect(worker_id)['State']['Pid']; api('POST', '/containers/' + worker_id + '/unpause')
    wait(lambda: request('/fixture/status')['ticks'] == 3); assert docker.inspect(worker_id)['State']['Pid'] == old_pid
    request('/fixture/release-tick'); request('/fixture/release-background'); assert request('/fixture/status')['aborted'] == 0
    print('LEGACY_WORKER_BOOTSTRAP=PASS UNCHANGED_C05_REAL_DOCKER_PAUSE INTERVAL_NO_NEW_TICKS ACTIVE_HTTP_FINISHES_ASYNC_FENCE_WAITS APP_NEVER_STOPPED TIMEOUT_BAD_SHAPE_UNPAUSE SAME_PID_ROLLBACK NO_PROVIDER_CALLS')
finally:
    if proxy: proxy.shutdown(); proxy.server_close()
    for cid in reversed(created):
        current = docker.inspect(cid); assert current['Name'].startswith('/' + label + '-')
        if current['State']['Paused']: api('POST', '/containers/' + cid + '/unpause')
        api('POST', '/containers/' + cid + '/stop?t=2'); api('DELETE', '/containers/' + cid + '?v=true')
    api('POST', '/networks/' + network + '/disconnect', {'Container': helper}); api('DELETE', '/networks/' + network)
