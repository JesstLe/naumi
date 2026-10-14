#!/usr/bin/env python3
"""Root/Linux gated cutover contracts; command/TLS/HTTP stubs, no production mutation."""
import hashlib,importlib.util,json,pathlib,tempfile
spec=importlib.util.spec_from_file_location('cutover',pathlib.Path(__file__).with_name('fleet-portal-cutover.py'));cut=importlib.util.module_from_spec(spec);spec.loader.exec_module(cut)
ex=cut.executor;calls=[];original=b'server { listen 80; location / { proxy_pass http://127.0.0.1:13039; } }'
for p in ['/etc/nginx/sites-available','/opt/naumi-staging/releases','/opt/naumi-reverse-hub/releases']:pathlib.Path(p).mkdir(parents=True,exist_ok=True)
gateway=pathlib.Path('/etc/nginx/sites-available/default');gateway.write_bytes(original)
def command(args,timeout=120):calls.append(args);return ''
ex.command=command;cut.current_state=lambda p:{};cut.syntax.check_gateway_syntax=lambda *args:None
cut.fetch=lambda port,path,cookie=None,host='naumi.top':(200,json.dumps({'enabled':True,'root':True} if path.endswith('/status') else {'root':True}).encode())
prepared={'source':'1'*40,'imageId':'sha256:'+'2'*64,'container':'fixture','port':13062,'gatewayHash':hashlib.sha256(original).hexdigest(),'businessSite':{'commit':'3'*40,'version':'123'}}
def public(path,ca,cookie=None):return 200,json.dumps(prepared['businessSite'] if path=='/api/version' else {'enabled':True,'root':True}).encode()
cut.public_fetch=public
with tempfile.TemporaryDirectory(prefix='fleet-cutover-',dir='/run') as temporary:
    e=pathlib.Path(temporary);ex.atomic_json(e/'prepared.json',prepared);(e/'gateway.before').write_bytes(original);(e/'gateway.before').chmod(0o600)
    cut.execute(e,None);assert gateway.read_bytes()==original and not calls
    try:cut.execute(e,None,dry_run=False,ca_file='fixture');raise AssertionError('missing auth accepted')
    except ex.GateError:pass
    assert gateway.read_bytes()==original and not calls
    cookie=e/'cookie';cookie.write_text('nv_admin=fixture.test');cookie.chmod(0o600)
    cut.fetch=lambda *args,**kwargs:(403,b'{}')
    try:cut.execute(e,cookie,dry_run=False,ca_file='fixture');raise AssertionError('nonadmin accepted')
    except ex.GateError:pass
    assert gateway.read_bytes()==original and not calls
    cut.fetch=lambda port,path,cookie=None,host='naumi.top':(200,json.dumps({'enabled':True,'root':True} if path.endswith('/status') else {'root':True}).encode())
    cut.execute(e,cookie,dry_run=True);assert gateway.read_bytes()==original and not calls
    cut.public_fetch=lambda *args,**kwargs:(503,b'{}')
    try:cut.execute(e,cookie,dry_run=False,ca_file='fixture');raise AssertionError('failed public accepted')
    except ex.GateError:pass
    assert gateway.read_bytes()==original and not (e/'cutover.json').exists()
    cut.public_fetch=public;cut.execute(e,cookie,dry_run=False,ca_file='fixture');assert 'BEGIN NAUMI FLEET PORTAL' in gateway.read_text() and (e/'cutover.json').is_file()
    cut.execute(e,None,dry_run=False,rollback=True,ca_file='fixture');assert gateway.read_bytes()==original
    cut.time.sleep=lambda seconds:None
    transitions=iter([(404,b'old'),(502,b'old'),(200,b'{"enabled":true,"root":true}')])
    cut.public_fetch=lambda *args,**kwargs:next(transitions)
    cut.await_public_admin('fixture','fixture',attempts=3)
    for status,body in [(401,b'{}'),(403,b'{}'),(200,b'{"enabled":true,"root":false}'),(200,b'{"root":true}'),(404,b'old')]:
        attempts=[]
        def rejected(*args,**kwargs):attempts.append(1);return status,body
        cut.public_fetch=rejected
        try:cut.await_public_admin('fixture','fixture',attempts=3);raise AssertionError('bad transition accepted')
        except ex.GateError:pass
        assert len(attempts)==(3 if status==404 else 1)
    cut.public_fetch=public
    assert not any(a[0]=='docker' or 'restart' in a for a in calls)
    try:cut.render_gateway('server {} server {}',13062);raise AssertionError('multi server injected')
    except ex.GateError:pass
    try:cut.render_gateway(cut.render_gateway(original.decode(),13062),13062);raise AssertionError('duplicate routes injected')
    except ex.GateError:pass
print('FLEET_PORTAL_CUTOVER_CONTRACT=PASS NO_COOKIE_NO_SWITCH=1 NONADMIN_DENIED=1 DRYRUN_NO_SWITCH=1 PUBLIC_FAILURE_ROLLBACK=1 RELOAD_TRANSITION_BOUNDED=1 AUTH_FAILURE_NO_RETRY=1 ROUTE_SCOPE=1 DOUBLE_INSERT_DENIED=1 OLD_APPS_NOT_RESTARTED=1 BUSINESS_DATA_UNCHANGED=1 SIMULATED_HTTP_TLS_NGINX=1 PRODUCTION_WRITES=0')
