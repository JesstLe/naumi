"""47 canvas-only immutable asset overlay; no App/Worker replacement or DB writes."""
import pathlib, subprocess, json, hashlib, os, fcntl, time, re, shutil, urllib.request, sys, traceback
from nginx_syntax import check_gateway_syntax
E = pathlib.Path('/opt/naumi-staging/evidence/canvas-credits47-20261015')
G = pathlib.Path('/etc/nginx/sites-available/reference-workbench')
sha = lambda b: hashlib.sha256(b).hexdigest()
def run(args, **kw): return subprocess.check_output(args, stderr=subprocess.PIPE, **kw)
def read(url, headers=None):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=30) as r: return r.status, r.read()
locks = []; sandbox = None
try:
    for p in ['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']:
        h = open(p, 'a'); fcntl.flock(h, fcntl.LOCK_EX | fcntl.LOCK_NB); locks.append(h)
    (E/'lock-owner.json').write_text(json.dumps({'pid':os.getpid(),'locks':[h.name for h in locks]}))
    before = G.read_bytes()
    assert sha(before) == '36d0616498b620a20a2c6c44c7d2969702c01720f1010f4966fcd7870730d160', 'Gateway changed; refresh baseline'
    (E/'gateway.before').write_bytes(before)
    original = (E/'BASELINE_FILE.js').read_bytes(); modified = (E/'MODIFIED_FILE.js').read_bytes()
    meta = json.loads((E/'patch-metadata.json').read_text())
    assert sha(original)==meta['originalSha256'] and sha(modified)==meta['modifiedSha256'] and original!=modified
    live = run(['docker','exec','naumi47-r2-image-main-20261015','cat','/app/.next/static/chunks/'+meta['originalName']])
    assert live==original
    # A tiny static overlay avoids another Next process on this memory-constrained host.
    assert os.statvfs(E).f_bavail*os.statvfs(E).f_frsize>10*1024**3
    # Public JS only: never open traversal permissions on protected config/evidence parents.
    assets = pathlib.Path('/var/www/naumi-canvas-credits47')/meta['modifiedSha256'][:12];assets.mkdir(parents=True,exist_ok=True);assets.chmod(0o755)
    asset = assets/meta['modifiedName'];asset.write_bytes(modified);asset.chmod(0o644)
    db=json.loads(run(['docker','inspect','naumi-staging-db-1']))[0];env=dict(x.split('=',1)for x in db['Config']['Env']if '='in x)
    cmd=['docker','exec','naumi-staging-db-1','pg_dump','-U',env['POSTGRES_USER'],'-d',env['POSTGRES_DB'],'-Fc']
    if not (E/'database.backup').exists():
        with (E/'database.backup').open('xb') as f: subprocess.run(cmd,stdout=f,check=True)
    (E/'database.backup').chmod(0o600)
    with (E/'database.backup').open('rb') as f: subprocess.run(['docker','exec','-i','naumi-staging-db-1','pg_restore','--list'],stdin=f,stdout=subprocess.DEVNULL,check=True)
    old_assets=run(['docker','exec','naumi47-r2-image-main-20261015','sh','-c','find /app/.next/static -type f -exec sha256sum {} +'])
    (E/'old-assets.sha256').write_bytes(old_assets)
    headers='proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header Connection ""; proxy_buffering off; proxy_read_timeout 1900s;'
    page='location = /canvas { proxy_pass http://127.0.0.1:13068; '+headers+' proxy_set_header Accept-Encoding ""; sub_filter_once off; sub_filter_types text/x-component; sub_filter "'+meta['originalName']+'" "'+meta['modifiedName']+'"; add_header X-Naumi-Canvas-Credits "'+meta['modifiedSha256'][:16]+'" always; }\n'
    static='location = /_next/static/chunks/'+meta['modifiedName']+' { alias '+str(asset)+'; default_type application/javascript; add_header Cache-Control "public, max-age=31536000, immutable"; }\n'
    anchor=' location = / { return 302 /dashboard$is_args$args; }'
    assert before.decode().count(anchor)==1 and 'location = /canvas {' not in before.decode()
    after=before.decode().replace(anchor,page+static+anchor)
    (E/'gateway.after').write_text(after)
    check_gateway_syntax(E,'credits-candidate',after);check_gateway_syntax(E,'credits-rollback',before.decode())
    # Isolated loopback candidate shares the real APIs, but has no public listener.
    sandbox=E/'sandbox';sandbox.mkdir(exist_ok=True);sandbox.chmod(0o755)
    for name in ['client_body','proxy','fastcgi','uwsgi','scgi']:(sandbox/name).mkdir(exist_ok=True)
    config='pid '+str(sandbox/'nginx.pid')+'; error_log '+str(sandbox/'error.log')+'; events {} http { access_log off; '+''.join(n+'_temp_path '+str(sandbox/n)+'; ' for n in ['client_body','proxy','fastcgi','uwsgi','scgi'])+'server {listen 127.0.0.1:13170;'+page+static+'location / {proxy_pass http://127.0.0.1:13068;'+headers+'}}}'
    (sandbox/'nginx.conf').write_text(config)
    run(['nginx','-t','-c',str(sandbox/'nginx.conf'),'-p',str(sandbox)])
    run(['nginx','-c',str(sandbox/'nginx.conf'),'-p',str(sandbox)])
    status,body=read('http://127.0.0.1:13170/canvas');assert status==200 and meta['modifiedName'].encode()in body and meta['originalName'].encode()not in body
    status,body=read('http://127.0.0.1:13170/_next/static/chunks/'+meta['modifiedName']);assert status==200 and sha(body)==meta['modifiedSha256']
    status,body=read('http://127.0.0.1:13170/canvas?_rsc=credits47',{'RSC':'1'});assert status==200 and meta['modifiedName'].encode()in body
    (E/'CANDIDATE_READY').write_text(meta['modifiedSha256'])
    print('CANDIDATE_READY=PASS HTML=NEW_HASH RSC=NEW_HASH STATIC_SHA=EXACT PUBLIC=UNCHANGED LOCKS=HELD',flush=True)
    deadline=time.time()+1800
    while not(E/'APPROVE_CUTOVER').exists():
        if time.time()>deadline:raise RuntimeError('Candidate expired without cutover receipt')
        time.sleep(2)
    assert G.read_bytes()==before, 'Peer changed gateway; no overwrite'
    assert run(['docker','exec','naumi47-r2-image-main-20261015','cat','/app/.next/static/chunks/'+meta['originalName']])==original
    check_gateway_syntax(E,'credits-cutover',after)
    G.write_text(after);run(['systemctl','reload','nginx'])
    status,body=read('https://47.105.59.142/canvas');assert status==200 and meta['modifiedName'].encode()in body
    status,body=read('https://47.105.59.142/_next/static/chunks/'+meta['modifiedName']);assert status==200 and sha(body)==meta['modifiedSha256']
    (E/'CUTOVER_READY').write_text(sha(after.encode()))
    print('CUTOVER=PASS PUBLIC_CANVAS=200 IMMUTABLE_ASSET_SHA=EXACT APIS_WORKERS=UNCHANGED',flush=True)
    while not(E/'FINAL_ACCEPTED').exists():
        if time.time()>deadline:raise RuntimeError('Final acceptance receipt missing; inspect before releasing')
        time.sleep(2)
    assert G.read_text()==after
    assert run(['docker','exec','naumi47-r2-image-main-20261015','sh','-c','find /app/.next/static -type f -exec sha256sum {} +'])==old_assets
    result={'gatewayBeforeSha256':sha(before),'gatewayAfterSha256':sha(after.encode()),'asset':str(asset),'modifiedSha256':meta['modifiedSha256'],'oldAssets':'EXACT','apiWorkerChanges':0,'databaseRestore':False,'backupReadable':True}
    (E/'release-result.json').write_text(json.dumps(result,indent=2))
    print('FINAL=PASS OLD_ASSETS=EXACT DATABASE_RESTORE=NONE BILLING_CHANGES=NONE',flush=True)
except Exception:
    traceback.print_exc();(E/'FAILED').write_text('Inspect controller.log; no automatic DB restore or peer gateway overwrite.\n');sys.exit(1)
finally:
    if sandbox and (sandbox/'nginx.pid').exists():
        subprocess.run(['nginx','-s','quit','-c',str(sandbox/'nginx.conf'),'-p',str(sandbox)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    for h in reversed(locks):fcntl.flock(h,fcntl.LOCK_UN);h.close()
    (E/'LOCKS_RELEASED').write_text('released\n')
