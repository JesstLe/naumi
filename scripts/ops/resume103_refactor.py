"""Resume only the original, pre-candidate capacity abort; no gate bypass."""
import base64, copy, fcntl, json, pathlib, time
from release103_refactor import Release, TARGET, MACHINE, CANON, validate_config, now
from release47_host import HostTransaction, require, sha, public_identity
import release47_task_snapshot as tasks

def main(config,review):
    config_path=pathlib.Path(config);c=json.loads(config_path.read_bytes());validate_config(c)
    check=json.loads(pathlib.Path(review).read_bytes())
    require(check['configSha256']==sha(config_path.read_bytes()) and check['releaseId']==c['releaseId'],'ORIGINAL_CONFIG_REVIEW_REQUIRED')
    with HostTransaction(TARGET,MACHINE,c['evidenceRoot'])as tx:
        with open(CANON.parent/'.lifecycle.lock','a+')as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            raw=CANON.read_bytes();state=json.loads(raw)
            require(sha(raw)==check['canonicalSha256'] and state['revision']==check['revision'],'RESUME_CANONICAL_CAS_CHANGED')
            record=state['blueGreen103Releases'][c['releaseId']]
            local_preflight=check.get('mode')=='local-startup-context'
            require(record['phase']==('CLEANUP_PENDING'if local_preflight else'ABORTED') and record['commit']==c['commit'] and record['image']==c['image'],'ONLY_ORIGINAL_PRE_CANDIDATE_ABORT')
            expected={'database-backup','image-load'}|({'create-media','create-web'}if local_preflight else set())
            require(set(record['operations'])==expected and all(o['phase']==('UNKNOWN'if local_preflight and name=='create-web'else'ACKNOWLEDGED')for name,o in record['operations'].items()),'UNKNOWN_OR_LATER_OPERATION_BLOCKS_RESUME')
            failure=json.loads((tx.folder/'FAILURE.json').read_bytes())
            require(failure.get('phase')=='BACKED_UP' and failure.get('error')=='DUAL_SLOT_PEAK_CAPACITY_GATE','ONLY_TRANSIENT_CAPACITY_ABORT')
            if local_preflight:
                log=tx.folder/'resume-controller.private.log'
                require(sha(log.read_bytes())==check.get('failureLogSha256') and log.read_text().rstrip().endswith('release47_host.Hold: FIXED_RUNTIME_RECOVERY_CONTEXT_REQUIRED'),'EXACT_LOCAL_PREFLIGHT_FAILURE_REQUIRED')
            rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]))
            require(sorted(r['Id']for r in rows if r['State']['Running'])==sorted(c['runningIds']),'RESUME_RUNNING_BASELINE_CHANGED')
            candidates={role:r for r in rows for role,name in c['newNames'].items()if r['Name'].lstrip('/')==name}
            require(set(candidates)==({'media'}if local_preflight else set()),'CANDIDATE_ALREADY_EXISTS_RECONCILE')
            if local_preflight:
                require(public_identity(candidates['media'])==record['operations']['create-media']['receipt'] and not candidates['media']['State']['Running'],'PREVIOUS_MEDIA_CREATE_CHANGED')
                folder=pathlib.Path('/opt/naumi-staging/releases')/c['releaseId']/'web'
                require(folder.is_dir()and not folder.is_symlink()and not list(folder.iterdir()),'LOCAL_PREFLIGHT_STATE_NOT_EMPTY')
            original=json.loads((tx.folder/'containers-before.private.json').read_bytes());byname={r['Name'].lstrip('/'):r for r in original}
            release=Release.__new__(Release);release.tx=tx;release.c=c;release.root=tx.folder;release.disk=sha(raw);release.state=state;release.record=record;release.rows=original;release.byname=byname
            release.old={k:byname[v]for k,v in c['oldNames'].items()}
            for row in release.old.values():tx.pin(public_identity(row))
            release.db=byname['naumi-staging-db-1'];release.de=dict(v.split('=',1)for v in release.db['Config']['Env']);tx.pin(public_identity(release.db))
            release.new=candidates;release.switched=False;release.old_stopped=False;release.worker_paused=False;release.app_drained=False
            release.configuration=json.loads((tx.folder/'configuration-before.json').read_bytes());require(release.config()==release.configuration,'RESUME_CONFIGURATION_CHANGED')
            release.cookie=(tx.folder/'cookie.private').read_text();release.dump=(tx.folder/'nginx-before.private.txt').read_text()
            require(sha(tx.run(['nginx','-T']))==sha(release.dump.encode())==c['nginxSha256'],'RESUME_GATEWAY_CHANGED')
            release.before={k:base64.b64decode(v)for k,v in json.loads((tx.folder/'nginx-files-before.private.json').read_bytes()).items()};release.real={p:str(pathlib.Path(p).resolve())for p in release.before}
            snapshots=list(tx.folder.glob('task-snapshot-*.json'));require(len(snapshots)==1,'ORIGINAL_TASK_SNAPSHOT_REQUIRED');private=json.loads(snapshots[0].read_bytes());release.task_before=tasks.Snapshot(public=tasks.summarize(private,row_limit=5000),private=private)
            base_op=release.op
            def original_op(name,fn):
                if name=='image-load' or local_preflight and name=='create-media':return record['operations'][name]['receipt']
                if local_preflight and name=='create-web':
                    op=record['operations'][name]
                    op.setdefault('attempts',[]).append({'phase':'UNKNOWN','resolution':'LOCAL_PREFLIGHT_BEFORE_DOCKER_CREATE','dockerCreateSent':False,'failureLogSha256':check['failureLogSha256'],'at':now()})
                    op['phase']='INTENT_RECORDED';release.persist()
                    try:receipt=fn(op['operationId'])
                    except BaseException:op['phase']='UNKNOWN';release.persist();raise
                    op.update(phase='ACKNOWLEDGED',receipt=receipt);release.persist();return receipt
                return base_op(name,fn)
            release.op=original_op
            if local_preflight:
                clone=release.clone;release.clone=lambda role:clone(role,reuse_empty_state=role=='web')
            memory=release.memory
            release.memory=lambda:release.wait(memory,'UNCHANGED_CAPACITY_GATE',seconds=90)
            record.setdefault('resumeHistory',[]).append({'at':now(),'originalAbort':copy.deepcopy(failure),'canonicalReviewSha256':sha(raw),'backupRepeated':False,'imageReloaded':False,'capacityGateUnchanged':True})
            release.phase('BACKED_UP')
            try:
                release.candidates();release.acceptance();release.assets();release.switch();release.finish()
            except BaseException:
                try:release.rollback()
                except BaseException:release.phase('ROLLBACK_FAILED')
                raise
