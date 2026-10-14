#!/usr/bin/env python3
"""Root-local 103 fleet sidecar preparation only. Never changes public gateway or business DB."""
import argparse,hashlib,json,os,pathlib,re,subprocess,tarfile,urllib.request,urllib.error,urllib.parse,time
try:import fcntl
except ImportError:fcntl=None  # Archive validators can be tested on Windows; preparation stays root/Linux-only.

def require(ok):
    if not ok:raise RuntimeError('PORTAL_PREPARE_GATE')

def cmd(args,timeout=120):
    return subprocess.run(args,check=True,capture_output=True,timeout=timeout).stdout

def filehash(file):
    h=hashlib.sha256()
    with open(file,'rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def save(file,value,mode=0o600):
    file=pathlib.Path(file);require(not file.is_symlink());file.write_text(json.dumps(value,indent=2)+'\n');file.chmod(mode)

def archive_ids(file,tag,expected):
    """Bind config, manifest and nested OCI index IDs without extracting archive files."""
    with tarfile.open(file,'r:*') as tar:
        def read(name):
            member=tar.getmember(name);require(member.isfile() and member.size<=2*1024*1024)
            return tar.extractfile(member).read()
        manifests=json.loads(read('manifest.json'));require(len(manifests)==1 and manifests[0].get('RepoTags')==[tag])
        config=manifests[0]['Config'];require(re.fullmatch(r'blobs/sha256/[a-f0-9]{64}|[a-f0-9]{64}\.json',config))
        data=read(config);config_id='sha256:'+hashlib.sha256(data).hexdigest();require(config.replace('blobs/sha256/','').replace('.json','')==config_id[7:])
        result={config_id}
        def walk(desc,depth=0):
            require(depth<=3);digest=desc['digest'];require(re.fullmatch('sha256:[a-f0-9]{64}',digest))
            data=read('blobs/sha256/'+digest[7:]);require('sha256:'+hashlib.sha256(data).hexdigest()==digest);obj=json.loads(data)
            matched=obj.get('config',{}).get('digest')==config_id
            if obj.get('manifests'):matched=any([walk(child,depth+1) for child in obj['manifests']])
            if matched:result.add(digest)
            return matched
        if 'index.json' in tar.getnames():
            for descriptor in json.loads(read('index.json')).get('manifests',[]):walk(descriptor)
        require(expected in result);return result

def request(port,path,method='GET'):
    req=urllib.request.Request(f'http://127.0.0.1:{port}{path}',data=b'{}' if method=='POST' else None,headers={'Content-Type':'application/json','Host':'naumi.top','X-Forwarded-Proto':'https'},method=method)
    try:
        with urllib.request.urlopen(req,timeout=8) as r:return r.status,r.read(2000)
    except urllib.error.HTTPError as error:return error.code,error.read(2000)

def main(args):
    require(os.name=='posix' and fcntl is not None and os.geteuid()==0 and len(args.source)==40 and all(c in '0123456789abcdef' for c in args.source))
    archive=pathlib.Path(args.archive);require(archive.is_absolute() and archive.is_file() and not archive.is_symlink() and filehash(archive)==args.archive_sha)
    identities=archive_ids(archive,args.image,args.image_id)
    evidence=pathlib.Path(args.evidence);require(evidence.is_absolute() and not evidence.exists());evidence.mkdir(mode=0o700,parents=True)
    handles=[]
    try:
        for file in ['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock']:
            fd=os.open(file,os.O_CREAT|os.O_WRONLY|os.O_NOFOLLOW,0o600);handle=os.fdopen(fd,'a');handles.append(handle);fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
        free=os.statvfs(evidence);require(free.f_bavail*free.f_frsize>10*1024**3 and free.f_bavail/free.f_blocks>0.2)
        mem={line.split(':')[0]:int(line.split()[1]) for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:')};require(mem['MemAvailable']>768*1024)
        require(request(13039,'/api/version')[0]==200)
        site=json.loads(request(13039,'/api/version')[1]);require(site['commit']==args.expected_site)
        names=cmd(['docker','ps','--format','{{.Names}}']).decode().splitlines();before=json.loads(cmd(['docker','inspect',*names]));core=next(x for x in before if x['Name']=='/naumi-staging-app-1')
        env=dict(x.split('=',1) for x in core['Config']['Env'] if '=' in x);require(env.get('DATABASE_URL') and len(env.get('SETTINGS_SECRET',''))>=32)
        require('naumi-staging_default' in core['NetworkSettings']['Networks'])
        gateway=pathlib.Path('/etc/nginx/sites-available/default');gateway_hash=filehash(gateway);(evidence/'gateway.before').write_bytes(gateway.read_bytes());(evidence/'gateway.before').chmod(0o600)
        save(evidence/'runtime.before.json',[{'name':x['Name'],'id':x['Id'],'image':x['Image'],'started':x['State']['StartedAt']} for x in before])
        minimal={k:env[k] for k in ['DATABASE_URL','SETTINGS_SECRET','VIDEO_WORKER_SECRET','NAUMI_MULTI_USER','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','ADMIN_EMAIL'] if env.get(k)}
        require(not any('\n' in value or '\r' in value for value in minimal.values()))
        envfile=evidence/'portal.env';envfile.write_text(''.join(key+'='+value+'\n' for key,value in minimal.items()));envfile.chmod(0o600)
        dsn=urllib.parse.urlsplit(env['DATABASE_URL']);database=urllib.parse.unquote(dsn.path.lstrip('/'));user=urllib.parse.unquote(dsn.username or 'naumi');require(database and user)
        dump=evidence/'database.backup'
        with open(dump,'xb') as output:subprocess.run(['docker','exec','naumi-staging-db-1','pg_dump','-U',user,'-d',database,'-Fc'],stdout=output,stderr=subprocess.PIPE,check=True,timeout=300)
        dump.chmod(0o600);require(dump.stat().st_size>0)
        with open(dump,'rb') as data:subprocess.run(['docker','exec','-i','naumi-staging-db-1','pg_restore','--list'],stdin=data,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,check=True,timeout=60)
        require(filehash(gateway)==gateway_hash and json.loads(request(13039,'/api/version')[1])==site)
        cmd(['docker','load','-i',str(archive)],timeout=600)
        image=json.loads(cmd(['docker','image','inspect',args.image]))[0];image_env=dict(x.split('=',1) for x in image['Config']['Env'] if '=' in x)
        require(image['Id'] in identities and image['Os']=='linux' and image['Architecture']=='amd64' and image_env.get('SOURCE_COMMIT')==args.source and image_env.get('FLEET_PORTAL_ONLY')=='1' and image['Config']['User']=='node')
        name='naumi-fleet-portal-'+args.source[:12]
        # Binding failure is a preparation failure; never stop another slot to free the port.
        cmd(['docker','run','-d','--name',name,'--network','naumi-staging_default','--env-file',str(envfile),'-e','FLEET_CONTROL_ENABLED=1','-e','FLEET_PORTAL_ONLY=1','-e','FLEET_RELEASE_DISPATCH_ENABLED=0','-e','FLEET_SCHEDULER_ENABLED=0','-e','NAUMI_VIDEO_WORKER=0','--label','io.naumi.runtime=fleet-portal','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=64m','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','384m','--cpus','0.5','--restart','unless-stopped','-p','127.0.0.1:13062:3000',args.image],timeout=30)
        ready=False
        for _ in range(60):
            try:
                status,body=request(13062,'/api/version');ready=status==200 and json.loads(body)['commit']==args.source
                if ready:break
            except (OSError,ValueError):pass
            time.sleep(0.5)
        require(ready)
        for method,path,status in [('GET','/api/admin/fleet',401),('POST','/api/fleet/poll',400),('POST','/api/generate-image',404),('POST','/api/imagegen',404),('POST','/api/auth/register',404),('GET','/canvas',404)]:require(request(13062,path,method)[0]==status)
        after=json.loads(cmd(['docker','inspect',*names]));require([(x['Id'],x['Image'],x['State']['StartedAt'],x['State']['Running']) for x in after]==[(x['Id'],x['Image'],x['State']['StartedAt'],True) for x in before])
        require(filehash(gateway)==gateway_hash and json.loads(request(13039,'/api/version')[1])==site)
        save(evidence/'prepared.json',{'source':args.source,'imageId':image['Id'],'container':name,'port':13062,'gatewayHash':gateway_hash,'businessSite':site,'archiveSha':args.archive_sha,'databaseBackupSha':filehash(dump),'publicChanged':False,'workerRestarted':False,'credentialsPrinted':False,'dispatchEnabled':False,'adminAcceptance':'pending'})
        print('FLEET_PORTAL_PREPARED=PASS LOOPBACK_ONLY=1 BACKUP_READABLE=1 OLD_CONTAINERS_UNCHANGED=1 GENERATION_DENIED=1 PUBLIC_GATEWAY_UNCHANGED=1 DISPATCH_OFF=1 ADMIN_ACCEPTANCE=PENDING')
    finally:
        for handle in reversed(handles):handle.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--expected-site',required=True);p.add_argument('--archive',required=True);p.add_argument('--archive-sha',required=True);p.add_argument('--image',required=True);p.add_argument('--image-id',required=True);p.add_argument('--evidence',required=True)
    try:main(p.parse_args())
    except Exception as error:raise SystemExit('FLEET_PORTAL_PREPARED=FAILED TYPE='+type(error).__name__) from None
