"""Real local PG opt-in scope regression; synthetic tables, no production access.

Reuses the existing owned/labelled PG fixture transport and cleanup. No supplier
or SSH calls, no .env lookup. A fresh fixture proves 100001 terminal activities
do not mask old-boot unknown work or original identities that finish later.
"""
import argparse
import json
import os
from pathlib import Path

import verify_release47_snapshot_pagination as v


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    parser.add_argument('--module',default=str(Path(__file__).with_name('release47_task_snapshot.py')))
    args=parser.parse_args();args.fixture_id=None;args.phase='103_ACTIVITY_SCOPE'
    v.ENV['DOCKER_HOST']='npipe:////./pipe/dockerDesktopLinuxEngine' if os.name=='nt' else v.ENV.get('DOCKER_HOST','unix:///var/run/docker.sock')
    f=v.Fixture(args)
    try:
        f.start();m=f.m;s=f.schema
        f.sql('CREATE SCHEMA '+s+';')
        fields=sorted(set(m.GRAPH_FIELDS+m.PROOF_FIELDS+m.FROZEN_FIELDS+['parameters','plans','instance_id','boot_id']))
        json_fields={'snapshot','payload','parameters','plans','billing_quote','provider_snapshot','capability_snapshot','quote','plan','request','request_body','inputs','body','video_references','procurement','fx'}
        for table,key in m.KEYS.items():
            pk=key[10:].split(',') if key.startswith('composite:') else [key]
            defs=','.join('"'+name+'" '+('uuid' if table=='app_release_activities' and name in ['id','boot_id'] else 'jsonb' if name in json_fields else 'text') for name in fields)
            f.sql(f'CREATE TABLE {s}.{table}({defs},PRIMARY KEY({",".join(pk)}));')
        unknown='00000000-0000-0000-0000-000000000001';active='00000000-0000-0000-0000-000000000002';null_state='00000000-0000-0000-0000-000000000003'
        f.sql(f'''INSERT INTO {s}.app_release_activities(id,state,instance_id,boot_id) VALUES
          ('{unknown}','unknown','old-instance','10000000-0000-0000-0000-000000000001'),
          ('{active}','active','current-instance','20000000-0000-0000-0000-000000000001'),
          ('{null_state}',NULL,'old-untyped-instance','30000000-0000-0000-0000-000000000001');
          INSERT INTO {s}.app_image_jobs(id,snapshot,payload) VALUES('imagegen-original','{{"status":"pending","paidOperations":{{"paid-original":{{"state":"started","model":"wire"}}}}}}','{{"prompt":"frozen"}}');
          INSERT INTO {s}.app_billing_operations(id,state,quote) VALUES('paid-original','reserved','{{"price":12}}');
          INSERT INTO {s}.app_supplier_calls(id,state,operation_id) VALUES('original-call','unknown','paid-original');
          INSERT INTO {s}.app_ledger(id,delta) VALUES('led-image-paid-original','-12');''')
        scoped=lambda previous=None,**kw:f.collect(previous=previous,activity_scope='nonfinished-and-prior',**kw)
        small_all=f.collect();small_scope=scoped()
        f.check('small_dataset_tables_identical_to_default',lambda:f.require(small_all.private['tables']==small_scope.private['tables'],'opt-in altered unrelated proof rows'))
        f.check('explicit_scope_recorded_and_mixed_scope_rejected',lambda:f.require(
            small_scope.private['collection']['activityScope']=='nonfinished-and-prior' and
            not m.compare_task_snapshots(small_all,small_scope)['preservationVerified'],'scope not bound'))
        f.sql(f"INSERT INTO {s}.app_release_activities(id,state,instance_id) SELECT md5('finished-'||i)::uuid,'finished','historical-instance' FROM generate_series(1,100001)i; ANALYZE {s}.app_release_activities;")
        default=f.collect();before=scoped()
        f.check('default_all_retains_real_scan_budget_rejection',lambda:f.require(
            default.private['collection']['status']=='incomplete' and default.private['collection']['coverage']['reason']=='unknown-scan-budget','default scanning behavior changed'))
        f.check('100001_finished_history_kept_and_scoped_complete',lambda:f.require(
            before.public['preservationComplete'] and m.compare_task_snapshots(before,before)['preservationVerified'] and
            int(f.sql(f'SELECT count(*) FROM {s}.app_release_activities;').strip())==100004 and
            before.private['collection']['budget']==m.DEFAULT_BUDGET,'history removed/budget changed/incomplete'))
        f.check('all_old_boot_unknown_active_null_states_are_roots',lambda:f.require(
            f.ids(before,'app_release_activities')=={unknown,active,null_state},'original nonfinished activity hidden'))
        f.check('business_supplier_billing_ledger_proofs_unchanged',lambda:f.require(
            all(before.private['tables'][t]==small_scope.private['tables'][t] for t in m.KEYS if t!='app_release_activities'),'nonactivity table changed'))
        f.sql(f"UPDATE {s}.app_release_activities SET state='finished' WHERE id='{active}';")
        after=scoped(previous=before)
        f.check('previous_active_now_finished_stays_exactly_protected',lambda:f.require(
            active in f.ids(after,'app_release_activities') and m.compare_task_snapshots(before,after)['preservationVerified'], 'finished original identity lost'))
        f.check('fresh_scope_does_not_select_untracked_finished',lambda:f.require(active not in f.ids(scoped(),'app_release_activities'),'untracked history unexpectedly selected'))
        f.sql(f"UPDATE {s}.app_release_activities SET state='finished' WHERE id='{unknown}';")
        changed=scoped(previous=after);result=m.compare_task_snapshots(after,changed)
        f.check('unknown_to_finished_remains_violation_not_fake_closure',lambda:f.require(
            unknown in f.ids(changed,'app_release_activities') and any(x['reason']=='UNKNOWN_STATE_TRANSITION_UNPROVEN' for x in result['violations']), 'unknown was silently finished'))
        f.sql(f"DELETE FROM {s}.app_release_activities WHERE id='{active}';")
        deleted=scoped(previous=after)
        f.check('prior_missing_identity_still_fails',lambda:f.require(
            any(x['reason']=='PRESERVED_ROW_MISSING' for x in m.compare_task_snapshots(after,deleted)['violations']), 'deleted original hidden'))
        f.sql(f"INSERT INTO {s}.app_release_activities(id,state,instance_id) SELECT md5('active-'||i)::uuid,'active','old-other-instance' FROM generate_series(1,100001)i;")
        over=scoped()
        f.check('real_active_scan_budget_remains_enforced',lambda:f.require(
            over.private['collection']['status']=='incomplete' and over.private['collection']['coverage']['reason']=='unknown-scan-budget' and
            not m.compare_task_snapshots(over,over)['preservationVerified'],'real active overflow bypassed'))
        (f.out/'SCOPE_SUMMARY.json').write_text(json.dumps({'passed':f.passed,'failed':f.failed,
            'defaultCoverage':default.private['collection']['coverage'],'scopedCoverage':before.private['collection']['coverage'],
            'activeOverflowCoverage':over.private['collection']['coverage'],'budget':m.DEFAULT_BUDGET,
            'productionActions':0,'supplierCalls':0,'historyDeletedInProduction':False},indent=2),encoding='utf8')
    except Exception as error:
        f.failed.append({'name':'runner','error':str(error)});print('RUNNER_ERROR '+str(error),flush=True)
    finally:f.close()
    print(f'ACTIVITY_SCOPE_REAL_PG passed={len(f.passed)} failed={len(f.failed)} cleanupErrors={len(f.cleanup_errors)} productionActions=0',flush=True)
    return 1 if f.failed or f.cleanup_errors else 0


if __name__=='__main__':raise SystemExit(main())
