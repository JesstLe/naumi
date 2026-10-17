#!/usr/bin/env python3
"""Actual PostgreSQL guard matrix on synthetic rows. No production, no suppliers.

Runtime statuses are explicit fixture inputs here; this is not a live Next
admission or public-gateway proof.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import subprocess
import time
from types import SimpleNamespace
import uuid

import release_rollback_guard as g
from release47_host import Hold, public_identity


def run(argv, *, stdin=None, timeout=120):
    result = subprocess.run(argv,input=stdin,capture_output=True,timeout=timeout)
    if result.returncode: raise RuntimeError(result.stderr.decode()[-1600:])
    return result.stdout


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--postgres-image',required=True); parser.add_argument('--output',required=True)
    args=parser.parse_args(); assert re.fullmatch('sha256:[a-f0-9]{64}',args.postgres_image)
    root=Path(args.output).resolve();root.mkdir(mode=0o700,parents=True,exist_ok=False)
    token=uuid.uuid4().hex[:12]; name='video-rollback-guard-'+token
    label='io.naumi.rollback-guard-fixture='+token; created=False; proofs=[]
    def sql(value):return run(['docker','exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','fixture','-d','fixture'],stdin=value.encode())
    try:
        run(['docker','run','-d','--name',name,'--label',label,'--network','none','--memory','192m','--memory-swap','192m',
             '-e','POSTGRES_USER=fixture','-e','POSTGRES_DB=fixture','-e','POSTGRES_PASSWORD=synthetic-only',
             args.postgres_image,'postgres','-c','shared_buffers=24MB']);created=True
        for _ in range(90):
            if subprocess.run(['docker','exec',name,'pg_isready','-U','fixture'],capture_output=True).returncode==0:break
            time.sleep(.3)
        else:raise RuntimeError('FIXTURE_PG_NOT_READY')
        sql('''CREATE TABLE app_video_tasks(id text primary key,status text,parameters jsonb);
        CREATE TABLE app_release_boots(instance_id text,boot_id text);
        CREATE TABLE app_release_controls(operation_id text);
        CREATE TABLE app_release_activities(id text,instance_id text,boot_id text,activity_kind text,state text);
        CREATE TABLE app_release_session_owners(instance_id text,state text,run_id text);
        CREATE TABLE app_worker_tick_receipts(tick_id text,worker_instance_id text,web_instance_id text,phase text);
        INSERT INTO app_video_tasks VALUES('frozen-old','running','{"quote":6,"credentialRef":"synthetic-reference"}');''')
        identity=public_identity(json.loads(run(['docker','inspect',name]))[0])
        class Tx:
            stack=True
            def pin(self, expected):
                row=json.loads(run(['docker','inspect',name]))[0]
                assert public_identity(row)==expected
                return row
            run=staticmethod(run)
        plan={'releaseId':'fixture-'+token,'commit':'c'*40,'buildVersion':'1792200281',
              'database':identity,'webs':[{'variant':'main'}],'worker':{'name':'caller-fixture'}}
        app={'instanceId':'web-fixture','bootId':'current-boot','commit':plan['commit']}
        state={'webs':{'main':{'running':{'id':'synthetic-web'},'verified':{'app':{'identity':app}}}},
               'worker':{'running':{'id':'synthetic-caller'}}}
        statuses={'main':{'identity':app,'admission':{'mode':'draining'},
                         'transport':{'verified':True,'transport':{'accountingFault':False}},
                         'observations':{k:0 for k in g.ZERO_FIELDS}}}
        def save(_name,value):
            dest=root/('capture-'+str(len(proofs))+'.json');dest.write_text(json.dumps(value,sort_keys=True),encoding='utf-8');proofs.append(str(dest))
        def capture():return g.capture(Tx(),plan,state,statuses,save)
        before=capture();g.compare(before,capture()); checks=['unchanged-business']
        sql("INSERT INTO app_worker_tick_receipts VALUES('empty-tick','caller-fixture','web-fixture','completed'); INSERT INTO app_release_activities VALUES('scan','web-fixture','current-boot','accepted-work','finished');")
        g.compare(before,capture());checks.append('finished-empty-scans-allowed')
        def rejected(label,mutation,undo,code):
            sql(mutation)
            try:
                try:g.compare(before,capture())
                except Hold as error:
                    assert code in str(error),str(error);checks.append(label)
                else:raise AssertionError('GUARD_ACCEPTED_'+label)
            finally:sql(undo)
        rejected('same-count-frozen-mutation',"UPDATE app_video_tasks SET parameters='{\"quote\":7}';", "UPDATE app_video_tasks SET parameters='{\"quote\":6,\"credentialRef\":\"synthetic-reference\"}';",'STATE_CHANGED')
        rejected('new-completed-business',"INSERT INTO app_video_tasks VALUES('new-done','completed','{}');","DELETE FROM app_video_tasks WHERE id='new-done';",'STATE_CHANGED')
        rejected('orphan-other-boot',"INSERT INTO app_release_activities VALUES('orphan','web-fixture','old-boot','accepted-work','active');","DELETE FROM app_release_activities WHERE id='orphan';",'NOT_QUIESCENT')
        rejected('unknown-tick',"INSERT INTO app_worker_tick_receipts VALUES('unknown','caller-fixture','web-fixture','unknown');","DELETE FROM app_worker_tick_receipts WHERE tick_id='unknown';",'NOT_QUIESCENT')
        rejected('finished-agent-turn',"INSERT INTO app_release_activities VALUES('agent','web-fixture','current-boot','agent-run','finished');","DELETE FROM app_release_activities WHERE id='agent';",'STATE_CHANGED')
        rejected('new-idle-agent-owner',"INSERT INTO app_release_session_owners VALUES('web-fixture','idle','new-agent');","DELETE FROM app_release_session_owners;",'STATE_CHANGED')
        rejected('new-empty-table','CREATE TABLE app_new_business(id text);','DROP TABLE app_new_business;','STATE_CHANGED')
        rejected('empty-table-schema-change','ALTER TABLE app_release_session_owners ADD COLUMN extra text;','ALTER TABLE app_release_session_owners DROP COLUMN extra;','STATE_CHANGED')
        # PostgreSQL preserves dropped attnums: use a fresh baseline for bounds.
        before=capture()
        rejected('overflow-no-truncation-success',"INSERT INTO app_release_activities SELECT 'scan-'||i,'web-fixture','current-boot','accepted-work','finished' FROM generate_series(1,25001) i;","DELETE FROM app_release_activities WHERE id LIKE 'scan-%';",'BOUND_EXCEEDED')
        g.compare(before,capture())
        sql("DO $fixture$ BEGIN FOR i IN 1..513 LOOP EXECUTE format('CREATE TABLE catalog_limit_%s(id text)',i); END LOOP; END $fixture$;")
        try:
            try:sql(g.build_sql(['web-fixture'],'caller-fixture').decode())
            except RuntimeError as error:
                assert 'ROLLBACK_CATALOG_BOUND_EXCEEDED' in str(error),str(error)
                checks.append('oversized-catalog-rejected-before-hash-dispatch')
            else:raise AssertionError('OVERSIZED_CATALOG_ACCEPTED')
        finally:
            sql("DO $fixture$ BEGIN FOR i IN 1..513 LOOP EXECUTE format('DROP TABLE catalog_limit_%s',i); END LOOP; END $fixture$;")
        result={'status':'PASS','checks':checks,'databaseImage':args.postgres_image,'databaseContainer':identity,
                'runtimeStatuses':'synthetic-fixture-input-not-Next-proof','captures':len(proofs),
                'productionConnections':0,'supplierCalls':0,'publicGatewayChanges':0,'taskReplays':0}
        (root/'result.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
    finally:
        if created:
            row=json.loads(run(['docker','inspect',name]))[0]
            assert row['Config']['Labels'].get('io.naumi.rollback-guard-fixture')==token
            run(['docker','rm','-fv',row['Id']])


if __name__=='__main__':main()
