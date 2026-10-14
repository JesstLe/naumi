#!/usr/bin/env python3
"""Gated 103 portal-only cutover. Old applications/workers and business data stay untouched."""
import argparse,hashlib,http.client,importlib.util,json,pathlib,re,socket,ssl,urllib.request,urllib.error,time
spec=importlib.util.spec_from_file_location('release_executor',pathlib.Path(__file__).with_name('fleet-release-executor.py'))
executor=importlib.util.module_from_spec(spec);spec.loader.exec_module(executor)
syntax_spec=importlib.util.spec_from_file_location('nginx_syntax',pathlib.Path(__file__).with_name('nginx_syntax.py'))
syntax=importlib.util.module_from_spec(syntax_spec);syntax_spec.loader.exec_module(syntax)

def render_gateway(before,port):
    executor.require(type(port) is int and 1024<=port<=65535)
    executor.require(len(re.findall(r'\bserver\s*\{',before))==1 and 'fleet-assets' not in before and '/admin/deployments' not in before)
    headers='proxy_http_version 1.1; proxy_set_header Host $http_host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header CF-Connecting-IP ""; proxy_set_header Connection ""; proxy_read_timeout 35s; proxy_buffering off;'
    routes=['/admin/deployments','/api/admin/fleet','/api/admin/fleet/status','/api/admin/fleet/releases','/api/fleet/poll','/api/fleet/ack','/api/fleet/releases/poll','/api/fleet/releases/ack']
    block='\n# BEGIN NAUMI FLEET PORTAL\n'+''.join(f'location = {path} {{ proxy_pass http://127.0.0.1:{port}; {headers} }}\n' for path in routes)
    block+=f'location ^~ /fleet-assets/_next/ {{ proxy_pass http://127.0.0.1:{port}/_next/; {headers} }}\n# END NAUMI FLEET PORTAL\n'
    match=re.search(r'\bserver\s*\{',before);return before[:match.end()]+block+before[match.end():]

def fetch(port,path,cookie=None,host='naumi.top'):
    headers={'Host':host,'X-Forwarded-Proto':'https'}
    if cookie:headers['Cookie']=cookie
    try:
        with urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}'+path,headers=headers),timeout=10) as response:return response.status,response.read(20000)
    except urllib.error.HTTPError as error:return error.code,error.read(20000)

def current_state(prepared):
    inspector=json.loads(executor.command(['docker','inspect',prepared['container']]))[0]
    executor.require(inspector['Image']==prepared['imageId'] and inspector['State']['Running'] and inspector['HostConfig']['ReadonlyRootfs'])
    env=dict(row.split('=',1) for row in inspector['Config'].get('Env',[]) if '=' in row)
    executor.require(inspector['Config']['User']=='node' and env.get('FLEET_PORTAL_ONLY')=='1' and env.get('NAUMI_VIDEO_WORKER')=='0' and env.get('FLEET_RELEASE_DISPATCH_ENABLED')=='0' and env.get('FLEET_SCHEDULER_ENABLED')=='0')
    code,body=fetch(prepared['port'],'/api/version');executor.require(code==200 and json.loads(body)['commit']==prepared['source'])
    code,body=fetch(13039,'/api/version');executor.require(code==200 and json.loads(body)==prepared['businessSite'],'BASELINE_CHANGED')
    return inspector

def public_fetch(path,ca_file,cookie=None):
    ca=executor.protected_path(ca_file);executor.require(hashlib.sha256(ca.read_bytes()).hexdigest()=='91a8a5567efa6bf941162aa806b3ba476aaddf7867640e53053b35fb225a5dae')
    context=ssl.create_default_context();context.load_verify_locations(cafile=str(ca))
    connection=http.client.HTTPSConnection('naumi.top',context=context,timeout=10)
    connection._create_connection=lambda _address,timeout=10,source_address=None:socket.create_connection(('103.30.76.93',443),timeout,source_address)
    try:
        headers={'Host':'naumi.top'}
        if cookie:headers['Cookie']=cookie
        connection.request('GET',path,headers=headers);response=connection.getresponse();return response.status,response.read(50000)
    finally:connection.close()

def await_public_admin(ca_file,cookie,attempts=20):
    # Nginx reload signals a graceful transition; old workers can briefly answer 404.
    # Wait only for known transition responses. Authentication failures never retry.
    for attempt in range(attempts):
        code,body=public_fetch('/api/admin/fleet/status',ca_file,cookie)
        if code==200:
            executor.require(json.loads(body)=={'enabled':True,'root':True});return
        executor.require(code in [404,502,503])
        if attempt+1<attempts:time.sleep(.2)
    executor.require(False,'CHECK_FAILED')

def execute(evidence,cookie_file,dry_run=True,rollback=False,ca_file=None):
    evidence=executor.protected_path(evidence,file=False);prepared=executor.read_json(executor.protected_path(evidence/'prepared.json'))
    gateway=executor.protected_path('/etc/nginx/sites-available/default');before=executor.protected_path(evidence/'gateway.before').read_bytes()
    executor.require(hashlib.sha256(before).hexdigest()==prepared['gatewayHash'])
    with executor.locks(['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock']):
        current_state(prepared)
        if not dry_run:
            executor.require(ca_file is not None)
            code,body=public_fetch('/api/version',ca_file);executor.require(code==200 and json.loads(body)==prepared['businessSite'],'BASELINE_CHANGED')
        if rollback:
            record=executor.read_json(executor.protected_path(evidence/'cutover.json'))
            executor.require(hashlib.sha256(gateway.read_bytes()).hexdigest()==record['gatewayAfter'],'BASELINE_CHANGED')
            syntax.check_gateway_syntax(evidence,'fleet-rollback',before.decode())
            if dry_run:print('FLEET_PORTAL_ROLLBACK_CHECK=PASS');return
            gateway.write_bytes(before);executor.command(['nginx','-t']);executor.command(['nginx','-s','reload'])
            code,body=public_fetch('/api/version',ca_file);executor.require(code==200 and json.loads(body)==prepared['businessSite'])
            executor.atomic_json(evidence/'rollback.json',{'at':int(time.time()),'gatewayRestored':True,'oldServicesRetained':True,'businessDataRestored':False})
            print('FLEET_PORTAL_ROLLBACK=PASS BUSINESS_DATA_UNCHANGED=1');return
        executor.require(hashlib.sha256(gateway.read_bytes()).hexdigest()==prepared['gatewayHash'],'BASELINE_CHANGED')
        candidate=render_gateway(before.decode(),prepared['port']);syntax.check_gateway_syntax(evidence,'fleet-candidate',candidate)
        (evidence/'gateway.candidate').write_text(candidate);(evidence/'gateway.candidate').chmod(0o600)
        if not cookie_file:
            print('FLEET_PORTAL_CHECK=ROUTES_READY ADMIN_ACCEPTANCE=PENDING NO_PUBLIC_CUTOVER=1')
            executor.require(dry_run,'GATE_MISSING');return
        secret_file=executor.protected_path(cookie_file);executor.require(not secret_file.stat().st_mode & 0o077)
        cookie=secret_file.read_text().strip();executor.require(len(cookie.encode())<=4000 and re.fullmatch(r'(?:nv_admin|nv_user)=[A-Za-z0-9_.-]+(?:; ?(?:nv_admin|nv_user)=[A-Za-z0-9_.-]+)?',cookie))
        code,body=fetch(prepared['port'],'/api/admin/fleet/status',cookie);executor.require(code==200 and json.loads(body)=={'enabled':True,'root':True})
        code,body=fetch(prepared['port'],'/api/admin/fleet',cookie);executor.require(code==200 and json.loads(body).get('root') is True)
        (evidence/'admin-acceptance.json').write_text(json.dumps({'at':int(time.time()),'root':True,'source':prepared['source'],'cookieStoredInEvidence':False}));(evidence/'admin-acceptance.json').chmod(0o600)
        if dry_run:print('FLEET_PORTAL_CHECK=PASS AUTHENTICATED_ADMIN=1 NO_PUBLIC_CUTOVER=1');return
        changed=False
        try:
            current_state(prepared);executor.require(hashlib.sha256(gateway.read_bytes()).hexdigest()==prepared['gatewayHash'],'BASELINE_CHANGED')
            changed=True;gateway.write_text(candidate);executor.command(['nginx','-t']);executor.command(['nginx','-s','reload'])
            await_public_admin(ca_file,cookie)
            code,_=public_fetch('/admin/deployments',ca_file,cookie);executor.require(code==200)
            code,body=public_fetch('/api/version',ca_file);executor.require(code==200 and json.loads(body)==prepared['businessSite'])
            executor.atomic_json(evidence/'cutover.json',{'at':int(time.time()),'source':prepared['source'],'gatewayAfter':hashlib.sha256(gateway.read_bytes()).hexdigest(),'oldServicesRetained':True,'businessDataRestored':False,'dispatchEnabled':False})
            print('FLEET_PORTAL_CUTOVER=PASS AUTHENTICATED_ADMIN=1 OLD_SERVICES_RETAINED=1 DISPATCH_OFF=1')
        except BaseException:
            if changed:
                gateway.write_bytes(before);executor.command(['nginx','-t']);executor.command(['nginx','-s','reload'])
            raise

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--evidence',required=True);parser.add_argument('--admin-cookie-file');parser.add_argument('--ca-file');parser.add_argument('--execute',action='store_true');parser.add_argument('--rollback',action='store_true');args=parser.parse_args()
    try:execute(args.evidence,args.admin_cookie_file,dry_run=not args.execute,rollback=args.rollback,ca_file=args.ca_file)
    except Exception as error:raise SystemExit('FLEET_PORTAL_CUTOVER=REJECTED TYPE='+type(error).__name__) from None
