#!/usr/bin/env python3
"""Root-local signed enterprise rollout. Remote jobs contain no shell, paths or URLs.

Disabled by default. Local, hash-pinned acceptance hooks implement host-specific
DB/storage/worker contracts; absence is a hard gate, never a simulated success.
"""
import argparse, contextlib, fcntl, hashlib, importlib.util, json, os
import pathlib, re, socket, subprocess, tempfile, time, urllib.request, uuid


class GateError(Exception):
    def __init__(self, code):
        self.code = code


def require(condition, code='GATE_MISSING'):
    if not condition:
        raise GateError(code)


def read_json(file, limit=20000):
    with open(file,'rb') as stream:
        data = stream.read(limit+1)
    require(len(data) <= limit)
    return json.loads(data)


def atomic_json(file, value, mode=0o600, gid=None):
    file = pathlib.Path(file)
    file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = file.with_name(file.name + '.' + uuid.uuid4().hex + '.tmp')
    with open(temp, 'x', encoding='utf-8') as output:
        os.chmod(temp, mode)
        if gid is not None:
            os.chown(temp,0,gid)
        json.dump(value, output, separators=(',', ':'))
        output.flush()
        os.fsync(output.fileno())
    os.replace(temp, file)


def command(args, timeout=120):
    try:
        result = subprocess.run(args, capture_output=True, timeout=timeout, check=True)
        return result.stdout.decode().strip()
    except (subprocess.SubprocessError, OSError):
        raise GateError('CHECK_FAILED') from None


def protected_path(raw, file=True):
    path = pathlib.Path(raw)
    require(path.is_absolute())
    info = path.lstat()
    require(not path.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    require(path.is_file() if file else path.is_dir())
    for parent in path.parents:
        parent_info=parent.lstat()
        require(not parent.is_symlink() and parent_info.st_uid==0 and not parent_info.st_mode & 0o022)
    return path


def verified_job(envelope, public_key, instance, allow_expired=False):
    require(set(envelope) == {'payload', 'signature'})
    payload = envelope['payload']
    require(isinstance(payload, str) and len(payload.encode()) <= 16000)
    require(isinstance(envelope['signature'], str) and re.fullmatch('[a-f0-9]{128}',envelope['signature']))
    protected_path(public_key)
    require('ED25519' in command(['openssl','pkey','-pubin','-in',str(public_key),'-text','-noout']))
    with tempfile.TemporaryDirectory(prefix='naumi-release-signature-',dir='/run') as temporary:
        message=pathlib.Path(temporary)/'message';signature=pathlib.Path(temporary)/'signature'
        message.write_bytes(payload.encode());signature.write_bytes(bytes.fromhex(envelope['signature']))
        command(['openssl','pkeyutl','-verify','-rawin','-pubin','-inkey',str(public_key),'-sigfile',str(signature),'-in',str(message)])
    job = json.loads(payload)
    require(set(job) == {'id','instanceId','leaseId','expiresAt','baseSource','baseVersion','manifest'})
    for name in ['id','instanceId','leaseId']:
        require(str(uuid.UUID(job[name])) == job[name])
    now = int(time.time() * 1000)
    require(job['instanceId'] == instance and job['expiresAt'] <= now + 360000 and (allow_expired or now <= job['expiresAt']))
    require(re.fullmatch('[0-9a-f]{40}', job['baseSource']) and re.fullmatch('[0-9]+', job['baseVersion']))
    spec = importlib.util.spec_from_file_location('github_manifest', pathlib.Path(__file__).with_name('github-release-manifest.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.validate(job['manifest'], flavors=['ui','desktop','enterprise'])
    return job


@contextlib.contextmanager
def locks(paths):
    handles = []
    try:
        for raw in paths:
            path = pathlib.Path(raw)
            require(path.is_absolute() and not path.is_symlink())
            protected_path(path.parent,file=False)
            fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_NOFOLLOW,0o600)
            handle=os.fdopen(fd,'a')
            info=os.fstat(fd)
            if info.st_uid != 0 or info.st_mode & 0o022:
                handle.close()
                raise GateError('GATE_MISSING')
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                handle.close()
                raise GateError('LOCK_BUSY') from None
            handles.append(handle)
        yield
    finally:
        for handle in reversed(handles):
            handle.close()


def hook(config, name, evidence, job_file):
    entry = config.get('hooks', {}).get(name)
    require(isinstance(entry, dict) and set(entry) == {'path','sha256'})
    file = protected_path(entry['path'])
    require(hashlib.sha256(file.read_bytes()).hexdigest() == entry['sha256'])
    raw = command([str(file), str(evidence), str(job_file)], timeout=600)
    require(len(raw.encode()) <= 16000)
    try:
        result = json.loads(raw)
    except ValueError:
        raise GateError('CHECK_FAILED') from None
    require(result.get('ok') is True, 'CHECK_FAILED')
    atomic_json(evidence / (name + '.json'), result)
    return result


def validate_hooks(config):
    for name in ['backup','compatibility','preaccept','gatewaytest','postaccept','workers','rollbackcheck']:
        entry=config.get('hooks',{}).get(name)
        require(isinstance(entry,dict) and set(entry)=={'path','sha256'})
        file=protected_path(entry['path'])
        require(hashlib.sha256(file.read_bytes()).hexdigest()==entry['sha256'])


def check_active(config, job):
    state = read_json(protected_path(config['activeState']))
    require(state['sourceCommit'] == job['baseSource'] and str(state['buildVersion']) == job['baseVersion'], 'BASELINE_CHANGED')
    for flavor in ['ui','desktop','enterprise']:
        slot = state['slots'][flavor]
        inspect = json.loads(command(['docker','inspect',slot['container']]))[0]
        require(inspect['Id'] == slot['containerId'] and inspect['Image'] == slot['imageId'], 'BASELINE_CHANGED')
    return state


def version(port, manifest, timeout=90):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        try:
            with urllib.request.urlopen('http://127.0.0.1:' + str(port) + '/api/version', timeout=3) as response:
                data = json.load(response)
            source = data.get('sourceCommit') or data.get('commit')
            build = data.get('buildVersion') or data.get('version')
            if source == manifest['sourceCommit'] and str(build) == str(manifest['buildVersion']):
                return
        except (ValueError, OSError):
            pass
        time.sleep(0.25)
    raise GateError('CHECK_FAILED')


def ensure_gateway(template, ports, old_ports):
    text = template
    for flavor in ['ui','desktop','enterprise']:
        require('{{' + flavor.upper() + '}}' in text and '{{OLD_' + flavor.upper() + '}}' in text)
        text = text.replace('{{' + flavor.upper() + '}}', str(ports[flavor]))
        text = text.replace('{{OLD_' + flavor.upper() + '}}', str(old_ports[flavor]))
    require('{{' not in text)
    return text


def candidate_ports(config, state):
    """Choose host-local free ports; retained old slots must not block the next day."""
    bounds=config.get('candidatePortRange')
    require(isinstance(bounds,list) and len(bounds)==2)
    low,high=bounds
    require(type(low) is int and type(high) is int and 1024<=low<high<=65535 and high-low<=1000)
    excluded={slot['port'] for slot in state['slots'].values()}
    chosen=[]
    for port in range(low,high+1):
        if port in excluded:
            continue
        try:
            with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as probe:
                probe.bind(('127.0.0.1',port))
                chosen.append(port)
        except OSError:
            continue
        if len(chosen)==3:
            return dict(zip(['ui','desktop','enterprise'],chosen))
    raise GateError('GATE_MISSING')


def publish_local_status(config, state):
    """Root-only writes; relay reads ports then checks each real /api/version."""
    file=pathlib.Path(config['statusFile'])
    parent=protected_path(file.parent,file=False)
    require(parent == pathlib.Path(config['outbox']))
    if file.exists():
        protected_path(file)
    value={'schemaVersion':1,'ports':{name:state['slots'][name]['port'] for name in ['ui','desktop','enterprise']}}
    atomic_json(file,value,mode=0o640,gid=parent.stat().st_gid)


def storage_gate(config):
    """Root-local policy, never inferred from a remote job or leftover credentials."""
    modern = 'storageDriver' in config or 'storageAccepted' in config
    if not modern:
        # Existing NAS deployments retain their original, stricter contract.
        require(config.get('nasAccepted') is True)
        return None
    driver = config.get('storageDriver')
    require(driver in ['local', 'r2', 's3'] and config.get('storageAccepted') is True)
    env_file = protected_path(config['envFile'])
    require(env_file.stat().st_size <= 128 * 1024)
    env = {}
    for line in env_file.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        require('=' in line)
        key, value = line.split('=', 1)
        require(key not in env)
        env[key] = value
    require(env.get('STORAGE_DRIVER') == driver and env.get('MEDIA_PRIVATE') == '1')
    media = env.get('MEDIA_DIR', '')
    require(media.startswith('/data/') and '..' not in pathlib.PurePosixPath(media).parts
            and str(pathlib.PurePosixPath(media)) == media)
    mounts = config.get('mounts', [])
    matches = [m for m in mounts if isinstance(m, dict) and m.get('target') == media]
    require(len(matches) == 1)
    mount = matches[0]
    require(set(mount) == {'source', 'target', 'readOnly'} and mount['readOnly'] is False)
    source = pathlib.Path(mount['source'])
    require(source.is_absolute() and source.is_dir() and source.resolve() == source)
    # Parent /data scratch binds are normal; a deeper media mount would shadow objects.
    require(all(isinstance(m, dict) and isinstance(m.get('target'), str)
                and (m is mount or not m['target'].startswith(media + '/'))
                for m in mounts))
    return driver


def execute(config, job, evidence):
    require(config.get('enabled') is True)
    storage_driver = storage_gate(config)
    validate_hooks(config)
    space=os.statvfs(evidence)
    require(space.f_bavail*space.f_frsize>=10*1024**3 and space.f_bavail/max(1,space.f_blocks)>=0.2)
    require(len(config['locks']) == 2 and len(set(config['locks'])) == 2)
    protected_path(config['envFile'])
    protected_path(config['gatewayFile'])
    protected_path(config['gatewayTemplate'])
    status_file=pathlib.Path(config['statusFile'])
    require(status_file.parent==pathlib.Path(config['outbox']))
    protected_path(status_file.parent,file=False)
    if status_file.exists():
        protected_path(status_file)
    require(all(re.fullmatch('[a-zA-Z0-9_.-]{1,80}', str(config[key])) for key in ['network','containerPrefix']))
    token_config = {'inbox','outbox','stateDir','activeState','envFile','gatewayFile','gatewayTemplate','statusFile'}
    require(all(pathlib.Path(config[k]).is_absolute() for k in token_config))
    with locks(config['locks']):
        state = check_active(config, job)
        ports = candidate_ports(config,state)
        require(set(ports.values()).isdisjoint(slot['port'] for slot in state['slots'].values()))
        protected = {key: hashlib.sha256(pathlib.Path(config[key]).read_bytes()).hexdigest() for key in ['envFile','gatewayFile']}
        job_file = evidence / 'verified-job.json'
        atomic_json(job_file, job)
        backup = hook(config, 'backup', evidence, job_file)
        dump = pathlib.Path(backup.get('databaseDump', ''))
        require(dump.is_absolute() and dump.is_file() and dump.stat().st_size > 0)
        require(str(dump.resolve()).startswith(str(evidence.resolve()) + '/'))
        command(['pg_restore','--list',str(dump)])
        require(hook(config,'compatibility',evidence,job_file).get('backwardCompatible') is True)
        gateway = pathlib.Path(config['gatewayFile'])
        gateway_before = gateway.read_bytes()
        candidates = {}
        switched = False
        gateway_attempted = False
        try:
            for flavor, image in job['manifest']['images'].items():
                command(['docker','pull',image['reference']], timeout=600)
                inspect = json.loads(command(['docker','image','inspect',image['reference']]))[0]
                env = dict(row.split('=',1) for row in inspect['Config'].get('Env',[]) if '=' in row)
                labels = inspect['Config'].get('Labels',{}) or {}
                require(image['reference'] in inspect.get('RepoDigests',[]) and inspect['Os']=='linux' and inspect['Architecture']=='amd64')
                require(env.get('SOURCE_COMMIT')==job['manifest']['sourceCommit'] and env.get('BUILD_VERSION')==str(job['manifest']['buildVersion']))
                require(labels.get('io.naumi.build.flavor')==flavor and labels.get('org.opencontainers.image.revision')==job['manifest']['sourceCommit'])
                name = config['containerPrefix'] + '-' + job['id'][:8] + '-' + flavor
                candidates[flavor] = {'container':name,'port':ports[flavor],'imageId':inspect['Id']}
                args = ['docker','run','-d','--name',name,'--network',config['network'],'--env-file',config['envFile'],'-e','NAUMI_VIDEO_WORKER=0','-e','FLEET_CONTROL_ENABLED=0','--restart','unless-stopped','-p','127.0.0.1:'+str(ports[flavor])+':3000']
                for mount in config.get('mounts',[]):
                    require(isinstance(mount,dict) and set(mount)=={'source','target','readOnly'})
                    target = str(mount['target'])
                    require(pathlib.Path(mount['source']).is_absolute() and (target == '/data' or target.startswith('/data/'))
                            and str(pathlib.PurePosixPath(target)) == target and '..' not in pathlib.PurePosixPath(target).parts
                            and type(mount['readOnly']) is bool)
                    args += ['--mount','type=bind,source='+mount['source']+',target='+mount['target']+(',readonly' if mount['readOnly'] else '')]
                args += [image['reference']]
                command(args)
                info = json.loads(command(['docker','inspect',name]))[0]
                candidates[flavor]['containerId'] = info['Id']
                version(ports[flavor], job['manifest'])
            atomic_json(evidence/'candidate-slots.json',candidates)
            storage_evidence = hook(config,'preaccept',evidence,job_file)
            if storage_driver is None:
                require(storage_evidence.get('nasE2E') is True)
            else:
                require(storage_evidence.get('storageE2E') is True
                        and storage_evidence.get('storageDriver') == storage_driver)
            check_active(config,job)
            require(hashlib.sha256(pathlib.Path(config['envFile']).read_bytes()).hexdigest()==protected['envFile'],'BASELINE_CHANGED')
            require(hashlib.sha256(gateway.read_bytes()).hexdigest()==protected['gatewayFile'],'BASELINE_CHANGED')
            rendered = ensure_gateway(pathlib.Path(config['gatewayTemplate']).read_text(), ports, {k:v['port'] for k,v in state['slots'].items()})
            # Full Nginx test configuration must be host-local, not derived from a remote job.
            candidate_config = evidence/'gateway.candidate.conf'
            candidate_config.write_text(rendered)
            require(hook(config,'gatewaytest',evidence,job_file).get('nginxSyntax') is True)
            gateway_attempted = True
            gateway.write_text(rendered)
            try:
                command(['nginx','-t'])
            except GateError:
                gateway.write_bytes(gateway_before)
                raise
            switched = True
            command(['nginx','-s','reload'])
            require(hook(config,'postaccept',evidence,job_file).get('publicE2E') is True)
            require(hook(config,'workers',evidence,job_file).get('inflightPreserved') is True)
            new_state = {'sourceCommit':job['manifest']['sourceCommit'],'buildVersion':job['manifest']['buildVersion'],'slots':candidates,'previous':state,'planId':job['id']}
            atomic_json(config['activeState'],new_state)
            publish_local_status(config,new_state)
            atomic_json(evidence/'accepted.json',{'source':new_state['sourceCommit'],'version':str(new_state['buildVersion']),'envHash':protected['envFile'],'rollbackGateway':hashlib.sha256(gateway_before).hexdigest(),'oldSlotsRetained':True})
            # Old containers remain for in-flight work and static resource fallback.
            return {'planId':job['id'],'leaseId':job['leaseId'],'state':'accepted','code':'OK','source':new_state['sourceCommit'],'version':str(new_state['buildVersion']),'evidenceSha':hashlib.sha256((evidence/'accepted.json').read_bytes()).hexdigest()}
        except BaseException:
            if switched or gateway_attempted:
                try:
                    gateway.write_bytes(gateway_before)
                    command(['nginx','-t'])
                    command(['nginx','-s','reload'])
                    atomic_json(config['activeState'],state)
                    publish_local_status(config,state)
                    require(hook(config,'rollbackcheck',evidence,job_file).get('oldVersionServing') is True)
                except BaseException:
                    raise GateError('ROLLBACK_FAILED') from None
            # Never stop old services or restore business DB/media/credits.
            raise


def run(config_file, envelope_file):
    config = read_json(protected_path(config_file), limit=12000)
    public_key=protected_path(config['publicKeyFile'])
    protected_path(config['stateDir'],file=False)
    protected_path(config['outbox'],file=False)
    envelope_file = pathlib.Path(envelope_file).resolve()
    require(envelope_file.parent == pathlib.Path(config['inbox']).resolve())
    raw = read_json(envelope_file)
    # A root-owned saved result can be re-published after a lost network ack.
    candidate = json.loads(raw.get('payload','{}'))
    prior = pathlib.Path(config['stateDir']) / str(candidate.get('id','')) / 'result.json'
    allow_expired = bool(re.fullmatch('[a-f0-9-]{36}',str(candidate.get('id',''))) and prior.exists())
    if allow_expired:
        protected_path(prior)
    job = verified_job(raw, public_key, config['instanceId'], allow_expired=allow_expired)
    evidence = pathlib.Path(config['stateDir']) / job['id']
    evidence.mkdir(parents=True,exist_ok=True,mode=0o700)
    protected_path(evidence,file=False)
    with locks([str(evidence/'executor.lock')]):
        return run_once(config,job,evidence)


def assert_no_unconfirmed(config,current_id):
    """A compromised relay cannot clear root-local uncertainty by faking a central ack."""
    directory=protected_path(config['stateDir'],file=False)
    for previous in directory.iterdir():
        if previous.name==current_id or not re.fullmatch('[a-f0-9-]{36}',previous.name):
            continue
        protected_path(previous,file=False)
        started=previous/'started.json'
        if not started.exists():
            continue
        protected_path(started)
        receipt=previous/'result.json'
        require(receipt.exists(),'UNKNOWN')
        result=read_json(protected_path(receipt))
        require(not(result.get('state')=='blocked' and result.get('code') in ['UNKNOWN','ROLLBACK_FAILED']),'UNKNOWN')


def run_once(config,job,evidence):
    receipt = evidence/'result.json'
    if receipt.exists():
        result = read_json(receipt)
        require(result.get('planId')==job['id'] and result.get('leaseId')==job['leaseId'])
    else:
        started = evidence/'started.json'
        if started.exists():
            # An interrupted root executor needs reconciliation, never blindly repeat cutover.
            result = {'planId':job['id'],'leaseId':job['leaseId'],'state':'blocked','code':'UNKNOWN'}
        else:
            try:
                assert_no_unconfirmed(config,job['id'])
                atomic_json(started,{'planId':job['id'],'leaseId':job['leaseId']})
                result = execute(config,job,evidence)
            except GateError as error:
                result = {'planId':job['id'],'leaseId':job['leaseId'],'state':'blocked' if error.code in ['LOCK_BUSY','ROLLBACK_FAILED','UNKNOWN'] else 'failed','code':error.code}
            except BaseException:
                result = {'planId':job['id'],'leaseId':job['leaseId'],'state':'blocked','code':'UNKNOWN'}
        atomic_json(receipt,result)
    atomic_json(pathlib.Path(config['outbox'])/(job['id']+'.json'),result,mode=0o640,gid=pathlib.Path(config['outbox']).stat().st_gid)
    print('FLEET_RELEASE='+result['state']+' CODE='+result['code'])
    return 0 if result['state']=='accepted' else 2


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--config',required=True)
    parser.add_argument('--envelope',required=True)
    args=parser.parse_args()
    try:
        raise SystemExit(run(args.config,args.envelope))
    except (GateError,ValueError,OSError,KeyError,TypeError):
        raise SystemExit('FLEET_RELEASE=REJECTED_INVALID_INPUT') from None
