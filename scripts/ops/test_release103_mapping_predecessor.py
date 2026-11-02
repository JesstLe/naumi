"""Isolated local evidence/Docker-read fixtures; no network or production writes."""
import copy
import json
import pathlib
import tempfile
import unittest
from unittest.mock import Mock, patch

import release103_mapping as mapping
import release103_mapping_predecessor as predecessor
from release47_host import Hold, public_identity, sha
from test_release103_mapping import config, row


class DirectPredecessorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name); self.c = config()
        self.rid = 'release103-pixel-size-fixture'
        self.folder = self.root / self.rid; self.folder.mkdir()
        self.live = {k: row(n, str(i)) for i, (k, n) in enumerate(self.c['oldNames'].items(), 1)}
        for v in self.live.values(): v['Config']['Env'].append('BUILD_VERSION=1793582472')
        self.baselines = {k: row('naumi103-' + k + '-retired-fixture', str(i), 'e'*40,
                                'sha256:'+'f'*64) for i, k in enumerate(['web','worker'], 4)}
        self.retired = copy.deepcopy(self.baselines)
        for v in self.retired.values():
            v['State']['Running'] = False; v['HostConfig']['RestartPolicy']['Name'] = 'no'
        self.rows = {v['Id']: v for v in [*self.live.values(), *self.retired.values(), row('naumi-staging-db-1','3')]}
        self.previous = {'phase':'COMPLETE', 'mode':'DIRECT_REPLACE_USER_AUTHORIZED',
            'commit':self.c['oldCommit'], 'image':self.c['oldImage'], 'version':'1793582472',
            'at':'2026-11-02T01:38:29Z', 'oldStopped':True, 'databaseRestored':False,
            'tasksReplayed':False, 'modelConfigUnchanged':True,
            'new':{k:{'id':v['Id'],'name':v['Name'].lstrip('/')} for k,v in self.live.items()}}
        self.before = {'revision':199, 'phase':'BASELINED', 'status':'PREPARED',
            'legacyDrainProven':False, 'history':[{'status':'historical-not-reinterpreted'}],
            'operations':{'old':{'phase':'ACKNOWLEDGED'}},
            'activeSiteControlReleaseId':'mapping-prior',
            'siteControlReleases':{'mapping-prior':{'phase':'COMPLETE','commit':'a'*40,'operations':{}}},
            'activeDirect103ReleaseId':'older',
            'direct103Releases':{'older':{'phase':'COMPLETE','commit':'e'*40}}}
        self.state = copy.deepcopy(self.before)
        self.state.update(revision=200, activeDirect103ReleaseId=self.rid)
        self.state['direct103Releases'][self.rid] = self.previous
        self.path = self.root/'current.json'
        progress={'phase':'COMPLETE','at':'2026-11-02T01:38:29Z','canonicalRevision':200}
        model={'version':'117','digest':'d'*64}
        self.docs = {
            'canonical-before.private.json':self.before,
            'PROGRESS.json':progress,
            'FINAL_STATUS.json':{'activeRelease':self.rid,'canonicalRevision':200,'release':self.previous,
                'progress':progress,'containers':{k:{'newId':v['Id'],'state':'running','image':self.c['oldImage'],
                'oldState':'exited','oldRestart':'no'}for k,v in self.live.items()}},
            'FINAL_ACCEPTANCE.json':{'commit':self.c['oldCommit'],'version':'1793582472',
                'passed':True,'programVerified':True,'originalOperationsAndAccountingUnchanged':True,
                'originalUnknownPreserved':True},
            'PROGRAM_DEPLOYED.json':{'commit':self.c['oldCommit'],'version':'1793582472',
                'image':self.c['oldImage'],'public':{'commit':self.c['oldCommit'],'version':'1793582472'},
                'new':self.previous['new'],'old':{k:{'id':v['Id']}for k,v in self.retired.items()},
                'oldStopped':True,'releaseMode':'DIRECT_REPLACE_USER_AUTHORIZED','modelConfigUnchanged':True,
                'originalOperationsUnchanged':True,'applicationDataRestored':False,
                'health':{'db':{'ok':True}},'model':model},
            'BACKUP.json':{'tocVerified':True,'databaseRestore':False,'model':model,
                'dumpBytes':len(b'fixture-backup'),'dumpSha256':sha(b'fixture-backup')},
            'DRAIN.json':{'app':{'identity':{'instanceId':self.baselines['web']['Name'].lstrip('/'),'commit':'e'*40},
                'coverage':{'level':'partial','allBackgroundAcceptedWork':False},
                'admission':{'mode':'draining'},
                'observations':{'acceptedTasks':None,'agentSessions':None,'unknownLeases':0,
                    'activeRequests':0,'trackedRequests':0,'trackedAcceptedWork':0,'agentRuns':0}},
                'worker':{'instanceId':self.baselines['worker']['Name'].lstrip('/'),'commit':'e'*40,
                'phase':'QUIESCENT','paused':True,'activeTicks':0,'unresolvedTicks':0,'controlFault':None,
                'mediaWorker':{'ok':True,'draining':True,'running':0,'queued':0}}},
            **{k+'-baseline.private.json':v for k,v in self.baselines.items()}}
        (self.folder/'database-before.dump').write_bytes(b'fixture-backup')
        self.store()
        self.tx=Mock(folder=self.root)
        self.tx.inspect.side_effect=lambda identifier:copy.deepcopy(self.rows[identifier])
        self.tx.run.side_effect=lambda args:json.dumps(list(self.rows.values())).encode() if args[1]=='inspect' else b'ids'

    def store(self):
        for name,value in self.docs.items():
            if name!='BACKUP.json':(self.folder/name).write_text(json.dumps(value))
        self.docs['BACKUP.json']['canonicalSha256']=sha((self.folder/'canonical-before.private.json').read_bytes())
        (self.folder/'BACKUP.json').write_text(json.dumps(self.docs['BACKUP.json']))
        self.path.write_text(json.dumps(self.state));self.c['canonicalSha256']=sha(self.path.read_bytes())
        self.c['direct103Predecessor']={'releaseId':self.rid,'canonicalRevision':self.c['canonicalRevision'],
            'canonicalSha256':self.c['canonicalSha256'],'oldCommit':self.c['oldCommit'],'oldImage':self.c['oldImage'],
            'oldPins':copy.deepcopy(self.c['oldPins']),
            'retiredPins':{k:public_identity(v)for k,v in self.retired.items()},
            'evidenceSha256':{n:sha((self.folder/n).read_bytes())for n in predecessor.FILES}}

    def recognize(self):
        return predecessor.recognize(self.state,self.c,self.root,self.tx.inspect)

    def test_complete_direct_evidence_does_not_fabricate_ack_or_drain(self):
        before=copy.deepcopy(self.state);files={p.name:p.read_bytes()for p in self.folder.iterdir()}
        previous,proof=self.recognize()
        self.assertEqual(previous,self.previous);self.assertNotIn('operations',previous)
        self.assertFalse(proof['operationJournalClaimed']);self.assertFalse(proof['historicalTaskClosureClaimed'])
        self.assertTrue(proof['currentTaskSnapshotStillRequired'])
        self.assertIsNone(proof['historicalObservations']['acceptedTasks'])
        self.assertEqual(proof['historicalDrainCoverage']['level'],'partial')
        self.assertEqual(self.state,before);self.assertEqual(files,{p.name:p.read_bytes()for p in self.folder.iterdir()})
        self.tx.save.assert_not_called()

    def test_real_constructor_override_uses_direct_without_changing_original_history(self):
        before=self.path.read_bytes()
        with patch.object(mapping.shared,'CANON',self.path),patch.object(mapping.shared,'EVIDENCE_ROOT',self.root):
            result=mapping.Release(self.tx,self.c)
        self.assertEqual(result.record['predecessorReleaseId'],self.rid)
        self.assertFalse(result.record['direct103PredecessorEvidence']['operationJournalClaimed'])
        self.assertEqual(result.state['activeSiteControlReleaseId'],'mapping-prior')
        self.assertEqual(before,self.path.read_bytes());self.tx.save.assert_not_called()

    def test_without_opt_in_original_predecessor_still_fails(self):
        self.c.pop('direct103Predecessor')
        with patch.object(mapping.shared,'CANON',self.path),self.assertRaisesRegex(Hold,'PREDECESSOR_NOT_COMPLETE'):
            mapping.Release(self.tx,self.c)

    def test_explicit_config_bindings_and_ambiguity(self):
        original=copy.deepcopy(self.c)
        cases=[('target','47.105.59.142'),('abortedPredecessor','release103-mapping-old'),
            ('oldCommit','b'*40),('oldImage','sha256:'+'a'*64),('canonicalSha256','b'*64),
            ('canonicalRevision',201),('oldPins',{})]
        for key,value in cases:
            self.c=copy.deepcopy(original);self.c[key]=value
            with self.subTest(key=key),self.assertRaises(Hold):predecessor.validate_config(self.c)
        for field in original['direct103Predecessor']:
            self.c=copy.deepcopy(original);self.c['direct103Predecessor'].pop(field)
            with self.subTest(missing=field),self.assertRaises(Hold):predecessor.validate_config(self.c)

    def test_active_or_revision_drift_rejected(self):
        for key,value in [('activeDirect103ReleaseId','other'),('revision',201)]:
            state=copy.deepcopy(self.state);state[key]=value
            with self.subTest(key=key),self.assertRaisesRegex(Hold,'ACTIVE_PREDECESSOR'):
                predecessor.recognize(state,self.c,self.root,self.tx.inspect)

    def test_each_file_required_and_hash_guarded(self):
        for name in predecessor.FILES:
            p=self.folder/name;original=p.read_bytes()
            p.unlink()
            with self.subTest(missing=name),self.assertRaisesRegex(Hold,'FILE_REQUIRED'):self.recognize()
            p.write_bytes(original+b' ')
            with self.subTest(changed=name),self.assertRaisesRegex(Hold,'EVIDENCE_CHANGED'):self.recognize()
            p.write_bytes(original)

    def test_unknown_or_inflight_any_current_release_blocks(self):
        base=copy.deepcopy(self.state)
        for phase in ['UNKNOWN','ROLLBACK_FAILED','CLEANUP_PENDING','READY','DRAINING','PREPARED','DEPLOYED_TEST_FAILURE']:
            for group in ['siteControlReleases','direct103Releases','blueGreen103Releases','staged103Releases','futureReleases']:
                self.state=copy.deepcopy(base);self.state.setdefault(group,{})['other']={'phase':phase}
                with self.subTest(group=group,phase=phase),self.assertRaisesRegex(Hold,'RELEASE_UNRESOLVED'):self.recognize()
        self.state=copy.deepcopy(base);self.state['siteControlReleases']['mapping-prior']['operations']={'lost':{'phase':'UNKNOWN'}}
        with self.assertRaisesRegex(Hold,'OPERATION_UNKNOWN'):self.recognize()
        self.state=copy.deepcopy(base);self.state['operations']['lost']={'phase':'INTENT_RECORDED'}
        with self.assertRaisesRegex(Hold,'OPERATION_UNKNOWN'):self.recognize()

    def test_canonical_other_history_must_be_exactly_preserved(self):
        self.state['history'].append({'invented':'closure'});self.store()
        with self.assertRaisesRegex(Hold,'CANONICAL_HISTORY_CHANGED'):self.recognize()

    def test_receipt_identity_and_success_flags(self):
        base=copy.deepcopy(self.docs)
        mutations=[('FINAL_STATUS.json','activeRelease','wrong'),('FINAL_STATUS.json','release',{}),
            ('PROGRESS.json','phase','UNKNOWN'),('PROGRAM_DEPLOYED.json','commit','x'*40),
            ('PROGRAM_DEPLOYED.json','oldStopped',False),('PROGRAM_DEPLOYED.json','applicationDataRestored',True),
            ('FINAL_ACCEPTANCE.json','passed',False),('FINAL_ACCEPTANCE.json','programVerified',False),
            ('FINAL_ACCEPTANCE.json','originalUnknownPreserved',False),('BACKUP.json','tocVerified',False)]
        for name,key,value in mutations:
            self.docs=copy.deepcopy(base);self.docs[name][key]=value;self.store()
            with self.subTest(name=name,key=key),self.assertRaises(Hold):self.recognize()

    def test_live_identity_source_image_and_restart_changes(self):
        original=copy.deepcopy(self.rows)
        for role in ['web','worker']:
            for field in ['id','name','image','running','startedAt','restart','source','version','oom']:
                self.rows=copy.deepcopy(original);x=self.rows[self.live[role]['Id']]
                if field=='id':x['Id']='9'*64
                elif field=='name':x['Name']='/naumi103-other'
                elif field=='image':x['Image']='sha256:'+'9'*64
                elif field=='running':x['State']['Running']=False
                elif field=='startedAt':x['State']['StartedAt']='later'
                elif field=='restart':x['HostConfig']['RestartPolicy']['Name']='no'
                elif field=='source':x['Config']['Env']=['SOURCE_COMMIT='+'9'*40,'BUILD_VERSION=1793582472']
                elif field=='version':x['Config']['Env']=['SOURCE_COMMIT='+self.c['oldCommit'],'BUILD_VERSION=1793582473']
                elif field=='oom':x['State']['OOMKilled']=True
                with self.subTest(role=role,field=field),self.assertRaisesRegex(Hold,'LIVE_INSTANCE_CHANGED'):self.recognize()

    def test_retired_slots_are_still_the_original_stopped_instances(self):
        original=copy.deepcopy(self.rows)
        for role in ['web','worker']:
            for field in ['running','restart','startedAt','exit','oom']:
                self.rows=copy.deepcopy(original);x=self.rows[self.retired[role]['Id']]
                if field=='running':x['State']['Running']=True
                elif field=='restart':x['HostConfig']['RestartPolicy']['Name']='unless-stopped'
                elif field=='startedAt':x['State']['StartedAt']='later'
                elif field=='exit':x['State']['ExitCode']=1
                elif field=='oom':x['State']['OOMKilled']=True
                with self.subTest(role=role,field=field),self.assertRaisesRegex(Hold,'RETIRED_INSTANCE_CHANGED'):self.recognize()

    def test_backup_reopened_and_hashed(self):
        dump=self.folder/'database-before.dump';dump.write_bytes(b'different-size')
        with self.assertRaisesRegex(Hold,'BACKUP_UNREADABLE_OR_CHANGED'):self.recognize()

    def test_drain_unknown_and_wrong_identity_rejected_without_null_coercion(self):
        original=copy.deepcopy(self.docs)
        for field,value in [('phase','UNKNOWN'),('activeTicks',1),('activeTicks',False),
                            ('unresolvedTicks',None),('unresolvedTicks',1),('controlFault','lost'),('commit','x'*40)]:
            self.docs=copy.deepcopy(original);self.docs['DRAIN.json']['worker'][field]=value;self.store()
            with self.subTest(field=field),self.assertRaisesRegex(Hold,'DRAIN_RECEIPT_MISMATCH'):self.recognize()

    def test_prior_failure_artifact_needs_explicit_reconciliation(self):
        for name in ['UNKNOWN.json','ROLLBACK_FAILED.json','FAILURE.json']:
            p=self.folder/name;p.write_text('{}')
            with self.subTest(name=name),self.assertRaisesRegex(Hold,'PRIOR_FAILURE_RECONCILIATION_REQUIRED'):self.recognize()
            p.unlink()

    def test_observed_old_work_cannot_be_positive_unknown_or_boolean(self):
        original=copy.deepcopy(self.docs)
        for field in ['activeRequests','trackedRequests','trackedAcceptedWork','agentRuns','unknownLeases']:
            for value in [1,None,False,'0']:
                self.docs=copy.deepcopy(original);self.docs['DRAIN.json']['app']['observations'][field]=value;self.store()
                with self.subTest(field=field,value=value),self.assertRaisesRegex(Hold,'RETIRED_WORK_STILL_ACTIVE_OR_UNKNOWN'):self.recognize()

    def test_retired_media_unknown_is_not_empty(self):
        original=copy.deepcopy(self.docs)
        for field,value in [('running',1),('queued',None),('queued',False),('ok',False),('draining',False)]:
            self.docs=copy.deepcopy(original);self.docs['DRAIN.json']['worker']['mediaWorker'][field]=value;self.store()
            with self.subTest(field=field),self.assertRaisesRegex(Hold,'RETIRED_MEDIA_UNRESOLVED'):self.recognize()


if __name__=='__main__':
    unittest.main()
