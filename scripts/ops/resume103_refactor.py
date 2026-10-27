"""Resume only the original, pre-candidate capacity abort; no gate bypass."""
import base64, copy, fcntl, json, pathlib, time,hashlib,hmac
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
            after_rollback=check.get('mode')=='after-verified-entry-rollback'
            admin_session=check.get('mode')=='candidate-admin-session' or after_rollback
            candidate_ready=check.get('mode')in['candidate-native-session','candidate-admin-session'] or after_rollback
            require(record['phase']==('CLEANUP_PENDING'if admin_session else'ROLLBACK_FAILED'if candidate_ready else'CLEANUP_PENDING'if local_preflight else'ABORTED') and record['commit']==c['commit'] and record['image']==c['image'],'ONLY_ORIGINAL_PRE_CANDIDATE_ABORT')
            expected={'database-backup','image-load'}|({'create-media','create-web','create-worker','start-media','start-web','start-worker'}if candidate_ready else{'create-media','create-web'}if local_preflight else set())
            if after_rollback:expected|={'gateway-switch','pause-old-worker','drain-old-web','drain-old-media','retire-worker','retire-media','retire-web','resume-new-worker'}
            require(set(record['operations'])==expected and all(o['phase']==('UNKNOWN'if local_preflight and name=='create-web'else'ACKNOWLEDGED')for name,o in record['operations'].items()),'UNKNOWN_OR_LATER_OPERATION_BLOCKS_RESUME')
            failure=json.loads((tx.folder/'FAILURE.json').read_bytes())
            require(failure.get('phase')=='BACKED_UP' and failure.get('error')=='DUAL_SLOT_PEAK_CAPACITY_GATE','ONLY_TRANSIENT_CAPACITY_ABORT')
            if local_preflight:
                log=tx.folder/'resume-controller.private.log'
                require(sha(log.read_bytes())==check.get('failureLogSha256') and log.read_text().rstrip().endswith('release47_host.Hold: FIXED_RUNTIME_RECOVERY_CONTEXT_REQUIRED'),'EXACT_LOCAL_PREFLIGHT_FAILURE_REQUIRED')
            if candidate_ready:
                log=tx.folder/('admin-resume-controller.private.log'if after_rollback else'native-resume-controller.private.log'if admin_session else'final-resume-controller.private.log');ending="RELEASE_BLOCKED='NoneType' object has no attribute 'get'"if after_rollback else'release47_host.Hold: HTTP_404_/api/admin/model-management'if admin_session else'release47_host.Hold: EXISTING_ACCOUNT_NOT_ACCEPTED';require(sha(log.read_bytes())==check.get('failureLogSha256') and log.read_text().rstrip().endswith(ending),'EXACT_NATIVE_SESSION_CHECK_FAILURE_REQUIRED')
            rows=json.loads(tx.run(['docker','inspect',*tx.run(['docker','ps','-aq','--no-trunc']).decode().split()]))
            created_ids=[record['operations']['create-'+role]['receipt']['id']for role in ['web','worker','media']]if candidate_ready else[]
            require(sorted(r['Id']for r in rows if r['State']['Running'])==sorted(c['runningIds']+created_ids),'RESUME_RUNNING_BASELINE_CHANGED')
            candidates={role:r for r in rows for role,name in c['newNames'].items()if r['Name'].lstrip('/')==name}
            require(set(candidates)==({'web','worker','media'}if candidate_ready else{'media'}if local_preflight else set()),'CANDIDATE_ALREADY_EXISTS_RECONCILE')
            if candidate_ready:
                for role,row in candidates.items():
                    pin=record['operations']['create-'+role]['receipt'];require(row['Id']==pin['id']and row['Image']==pin['image']==c['image']and row['State']['Running']and row['HostConfig']['RestartPolicy']['Name']=='no','ORIGINAL_RUNNING_CANDIDATE_CHANGED')
            if local_preflight:
                require(public_identity(candidates['media'])==record['operations']['create-media']['receipt'] and not candidates['media']['State']['Running'],'PREVIOUS_MEDIA_CREATE_CHANGED')
                folder=pathlib.Path('/opt/naumi-staging/releases')/c['releaseId']/'web'
                require(folder.is_dir()and not folder.is_symlink()and not list(folder.iterdir()),'LOCAL_PREFLIGHT_STATE_NOT_EMPTY')
            original=json.loads((tx.folder/'containers-before.private.json').read_bytes());byname={r['Name'].lstrip('/'):r for r in original}
            release=Release.__new__(Release);release.tx=tx;release.c=c;release.root=tx.folder;release.disk=sha(raw);release.state=state;release.record=record;release.rows=original;release.byname=byname
            release.old={k:byname[v]for k,v in c['oldNames'].items()}
            if after_rollback:
                current={r['Name'].lstrip('/'):r for r in rows}
                for role,old in release.old.items():
                    actual=current[c['oldNames'][role]];require(actual['Id']==old['Id']and actual['Image']==old['Image']and actual['Config']['Env']==old['Config']['Env']and actual['State']['Running'],'ENTRY_ROLLBACK_BASELINE_CHANGED')
                release.old={role:current[name]for role,name in c['oldNames'].items()}
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
            if after_rollback:
                revision=state['revision'];release.op=lambda name,fn:base_op(name+'-after-entry-rollback-'+str(revision),fn)
            if local_preflight:
                clone=release.clone;release.clone=lambda role:clone(role,reuse_empty_state=role=='web')
            memory=release.memory
            release.memory=lambda:release.wait(memory,'UNCHANGED_CAPACITY_GATE',seconds=90)
            record.setdefault('resumeHistory',[]).append({'at':now(),'originalAbort':copy.deepcopy(failure),'canonicalReviewSha256':sha(raw),'backupRepeated':False,'imageReloaded':False,'capacityGateUnchanged':True})
            if candidate_ready:
                import release47_controls as controls
                from release47_host import environment
                # Observe the partial rollback, rather than clearing a sticky
                # failure from its label alone. No public cutover happened.
                app=controls.app_status(tx,public_identity(candidates['web']));obs=app['observations'];worker=release.worker(candidates['worker'],'status');media=release.media(candidates['media'],'health')
                require(app['admission']['mode']=='draining'and all(obs[k]==0 for k in ['activeRequests','trackedAcceptedWork','agentRuns','unknownLeases'])and worker['paused']and worker['activeTicks']==worker['unresolvedTicks']==0 and media['draining']and media['running']==media['queued']==0,'ROLLBACK_STATE_NOT_ACTUALLY_QUIESCENT')
                release.wait(lambda:release.request(candidates['web'],'/api/video/worker/drain-status',auth=False,worker=True)['drained'],'CURRENT_DOMAIN_QUIESCENT')
                email=release.sql("SELECT json_build_object('email',email)FROM app_users WHERE role='admin'AND banned=false ORDER BY joined_at LIMIT 1;")[0]['email'];eb=base64.urlsafe_b64encode(email.encode()).decode().rstrip('=');exp=str(int(time.time()*1000)+30*24*3600*1000);secret=environment(release.old['web'])['SETTINGS_SECRET']
                cookie='nv_user='+eb+'.'+exp+'.'+hmac.new(secret.encode(),('user:'+eb+'.'+exp).encode(),hashlib.sha256).hexdigest();tx.save('cookie-before-auth-check-'+str(state['revision'])+'.private',release.cookie.encode())
                if admin_session:
                    hashes=release.sql("SELECT json_build_object('hash',v)FROM app_settings WHERE k='admin_password_hash';");password_hash=hashes[0]['hash']if hashes else None;admin_exp=str(int(time.time()*1000)+2*3600*1000);message='admin-access:'+admin_exp+':'+password_hash if password_hash else'admin:'+admin_exp;cookie+='; nv_admin='+admin_exp+'.'+hmac.new(secret.encode(),message.encode(),hashlib.sha256).hexdigest()
                release.cookie=cookie
                require(release.request(release.old['web'],'/api/auth/session').get('user')and release.request(candidates['web'],'/api/auth/session').get('user'),'FRESH_NATIVE_SESSION_NOT_ACCEPTED')
                path=tx.folder/'cookie.private';path.write_text(cookie);path.chmod(0o600)
                proof={'at':now(),'gatewayStillOriginal':True,'currentCandidateWork':0,'workerPaused':True,'mediaDrained':True,'legacyDrainProven':False,'oldAndNewNativeAccountAccepted':True,'originalFailureLogSha256':check['failureLogSha256'],'originalFailure':'test cookie issuedAt derived from short TTL; media control receipt requires separate health read'}
                tx.save('rollback-failure-reconciled-'+str(state['revision'])+'.json',proof);record['rollbackFailureResolution']=proof
            release.phase('CANDIDATE_READY'if candidate_ready else'BACKED_UP')
            try:
                if not candidate_ready:release.candidates()
                release.acceptance()
                if after_rollback:
                    receipt=json.loads((tx.folder/'r2-acceptance.json').read_bytes());require(receipt['passed']and receipt['verificationDataCleaned']and record.get('r2Accepted'),'ORIGINAL_R2_ACCEPTANCE_NOT_VERIFIED')
                    assets=json.loads((tx.folder/'static-assets.json').read_bytes());root=pathlib.Path(assets['root']);require(root==pathlib.Path('/var/www/naumi-client-assets')/c['releaseId']and root.is_dir(),'ORIGINAL_ASSET_ROOT_CHANGED')
                    # Every retained old URL and every fixed new image asset is
                    # rechecked before reusing the already materialized union.
                    from release47_host import file_sha
                    count=0
                    for source in [pathlib.Path(c['oldAssetRoot'])]:
                        for p in source.rglob('*'):
                            if p.is_file():require(not p.is_symlink()and file_sha(p)==file_sha(root/p.relative_to(source)),'RETAINED_ASSET_CHANGED');count+=1
                    source=tx.folder/'candidate-static'
                    for p in source.rglob('*'):
                        if p.is_file():
                            for prefix in ['','desktop/','enterprise/']:require(file_sha(p)==file_sha(root/prefix/'_next/static'/p.relative_to(source)),'FIXED_NEW_ASSET_CHANGED')
                    release.render_gateway(root)
                    expected=json.loads((tx.folder/'gateway-forward/gateway-transaction-intent.json').read_bytes())['afterDumpSha256'];require(sha(release.afterdump.encode())==expected,'ORIGINAL_FORWARD_BUNDLE_CHANGED')
                    tx.save('entry-rollback-reconciled.json',{'at':now(),'oldEntryActuallyRestored':True,'oldSlotsRestored':True,'newCandidatesQuiescent':True,'afterDumpSha256':expected,'retainedAssetFilesVerified':count,'oldImage':c['oldImage'],'newImage':c['image'],'nullableTickObservationFixed':True,'databaseRestored':False,'tasksReplayed':False})
                    release.phase('READY')
                else:release.assets()
                release.switch();release.finish()
            except BaseException:
                try:release.rollback()
                except BaseException:release.phase('ROLLBACK_FAILED')
                raise
