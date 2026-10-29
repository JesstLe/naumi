"""Real local PG counterexamples for snapshot preservation review findings.

No environment files or production access. The companion fixture owns every
container. --expect baseline means assert the recorded gaps, not product health.
"""
import argparse
import copy
import json
import time
from pathlib import Path
from types import SimpleNamespace

import verify_release47_snapshot_pagination as v


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--module',required=True);parser.add_argument('--phase',required=True)
    parser.add_argument('--output',required=True);parser.add_argument('--expect',choices=['baseline','modified'],required=True)
    args=parser.parse_args();args.fixture_id=None
    v.ENV['DOCKER_HOST']='npipe:////./pipe/dockerDesktopLinuxEngine' if __import__('os').name=='nt' else v.ENV.get('DOCKER_HOST','unix:///var/run/docker.sock')
    f=v.Fixture(args);modified=args.expect=='modified';observations=[]
    def compare(name,before,after,should_preserve=False):
        result=f.m.compare_task_snapshots(before,after)
        expected=should_preserve or not modified
        observations.append({'name':name,'comparison':result,'beforeComplete':before.public['preservationComplete'],'afterComplete':after.public['preservationComplete']})
        (f.out/(name+'-before.json')).write_bytes(f.m.canonical(before.private))
        (f.out/(name+'-after.json')).write_bytes(f.m.canonical(after.private))
        f.check(name,lambda:f.require(result['preservationVerified']==expected,'expected preservation='+str(expected)+' actual='+json.dumps(result)))
    try:
        f.start();f.seed();m=f.m;s=f.schema
        f.sql(f"DELETE FROM {s}.app_image_jobs WHERE id LIKE 'historic-%'; TRUNCATE {s}.app_video_tasks;")
        f.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{{status}}','\"pending\"') WHERE id='gen-child';")
        for level in ['child','root']:
            pointer='{paidOperations,paid-root'+(',children,paid-child' if level=='child' else '')+',state}'
            for start,end,normal in [('started','queued',False),('started','done',True),('done','started',False)]:
                f.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{pointer}',{m.literal(json.dumps(start))}::jsonb) WHERE id='gen-child';")
                before=f.collect()
                f.sql(f"UPDATE {s}.app_image_jobs SET snapshot=jsonb_set(snapshot,'{pointer}',{m.literal(json.dumps(end))}::jsonb) WHERE id='gen-child';")
                compare('paid_'+level+'_'+start+'_to_'+end,before,f.collect(previous=before),normal)
        f.sql(f"ALTER TABLE {s}.app_billing_operations ADD COLUMN IF NOT EXISTS ledger_id text; UPDATE {s}.app_billing_operations SET ledger_id='unrelated' WHERE id='paid-root';")
        before=f.collect();f.sql(f"UPDATE {s}.app_billing_operations SET ledger_id='led-image-paid-root' WHERE id='paid-root';")
        compare('billing_ledger_binding_change',before,f.collect(previous=before))
        for scenario,statement in [('ledger_append_only',"INSERT INTO {s}.app_ledger(id,delta) VALUES('unrelated-new','1');"),('ledger_mutation_plus_append',"UPDATE {s}.app_ledger SET delta='9' WHERE id='unrelated'; INSERT INTO {s}.app_ledger(id,delta) VALUES('unrelated-new','1');"),('ledger_delete_plus_two_appends',"DELETE FROM {s}.app_ledger WHERE id='unrelated'; INSERT INTO {s}.app_ledger(id,delta) VALUES('unrelated-new','1'),('unrelated-new2','1');")]:
            before=f.collect();f.sql(statement.format(s=s));compare(scenario,before,f.collect(previous=before),scenario=='ledger_append_only')
            f.sql(f"DELETE FROM {s}.app_ledger WHERE id IN ('unrelated-new','unrelated-new2'); INSERT INTO {s}.app_ledger(id,delta) VALUES('unrelated','1') ON CONFLICT(id) DO UPDATE SET delta='1';")
        before=f.collect();f.sql(f"UPDATE {s}.app_release_activities SET state='finished' WHERE id='old-unseen';")
        compare('unknown_activity_to_finished',before,f.collect(previous=before))
        f.sql(f"INSERT INTO {s}.app_worker_tick_receipts(tick_id,phase) VALUES('tick-unknown','unknown');")
        before=f.collect();f.sql(f"UPDATE {s}.app_worker_tick_receipts SET phase='completed' WHERE tick_id='tick-unknown';")
        compare('unknown_tick_phase_to_completed',before,f.collect(previous=before))
        f.sql(f"ALTER TABLE {s}.app_worker_tick_receipts ADD COLUMN IF NOT EXISTS protocol_version text; ALTER TABLE {s}.app_worker_tick_receipts ADD COLUMN IF NOT EXISTS nonacceptance_at text; UPDATE {s}.app_worker_tick_receipts SET phase='unknown',protocol_version='2',nonacceptance_at=NULL WHERE tick_id='tick-unknown';")
        before=f.collect();f.sql(f"UPDATE {s}.app_worker_tick_receipts SET nonacceptance_at='2026-10-29T00:00:00Z' WHERE tick_id='tick-unknown';")
        compare('accepted_unknown_relabelled_as_negative',before,f.collect(previous=before))
        # Full mode needs an intentionally small fresh dataset: no media ceiling.
        f.sql(';'.join('TRUNCATE '+s+'.'+name for name in m.KEYS)+';')
        f.sql(f"INSERT INTO {s}.app_image_jobs(id,snapshot) VALUES('shape','[]');")
        snap=f.collect(projection='full');compare('falsey_full_snapshot',snap,snap)
        f.sql(f"UPDATE {s}.app_image_jobs SET snapshot='{{\"status\":\"pending\"}}';")
        before=f.collect()
        # A collector without budgets is the older baseline, not the v2 review
        # target. The actual two-statement timing comparison uses v2 vs fixed.
        if f.supports_budget:
            responses=[];saved=[]
            def delayed(argv,stdin=None,timeout=120):
                if stdin and b'BEGIN ISOLATION' in stdin:
                    stdin=stdin.replace(b'SELECT count(*) AS scan_count FROM (',b'SELECT count(*) AS scan_count FROM (SELECT pg_sleep(1.5)) injected_count_delay CROSS JOIN LATERAL (',1)
                    marker=b'page AS MATERIALIZED (SELECT to_jsonb(t) AS j FROM page_keys k CROSS JOIN LATERAL'
                    assert marker in stdin
                    stdin=stdin.replace(marker,b'page AS MATERIALIZED (SELECT to_jsonb(t) AS j FROM page_keys k CROSS JOIN (SELECT pg_sleep(1.6)) injected_page_delay CROSS JOIN LATERAL',1)
                begin=time.monotonic();result=f.command(argv,stdin=stdin,timeout=timeout)
                if stdin and b'BEGIN ISOLATION' in stdin:responses.append({'seconds':time.monotonic()-begin,'exit':result.returncode,'stderr':result.stderr.decode(errors='replace')})
                return result
            def save(name,data):(f.out/name).write_bytes(data);saved.append(name)
            try:m.collect_task_snapshot(delayed,f.identity,save,schema=s,projection='proof',statement_timeout_ms=15000,budget={'seconds':2})
            except ValueError as error:
                timing={'exception':str(error),'budgetSeconds':2,'sql':responses,'failureFiles':saved}
                (f.out/'TIME_BUDGET.json').write_text(json.dumps(timing,indent=2),encoding='utf-8')
                f.check('remaining_deadline_before_first_graph',lambda:f.require(len(saved)==1 and responses[0]['exit']!=0 and (responses[0]['seconds']<2.7 if modified else responses[0]['seconds']>3),'timing='+json.dumps(timing)))
            else:raise AssertionError('delayed transaction was accepted')
        (f.out/'COUNTEREXAMPLES.json').write_text(json.dumps(observations,indent=2),encoding='utf-8')
    except Exception as error:f.failed.append({'name':'runner','error':str(error)});print('RUNNER_ERROR '+str(error),flush=True)
    finally:f.close()
    if modified:
        # Real DROP failure must not skip owned-resource cleanup or RESULT.
        cleanup=v.Fixture(SimpleNamespace(output=str(Path(args.output)/'cleanup-fault'),fixture_id=None,phase='CLEANUP_FAULT',module=args.module))
        try:
            cleanup.start();cleanup.failed.append({'name':'runner','error':'injected-primary-failure'})
            actual_sql=cleanup.sql
            cleanup.sql=lambda _sql:actual_sql('SELECT 1/0;')
        finally:cleanup.close()
        result=json.loads((cleanup.out/'RESULT.json').read_text())
        absent=cleanup.command(['docker','inspect',cleanup.cid])
        ok=result['failed']==[{'name':'runner','error':'injected-primary-failure'}] and [x['name'] for x in result['cleanupErrors']]==['drop-schema'] and absent.returncode!=0
        (cleanup.out/'RESOURCE_CHECK.json').write_text(json.dumps({'containerRemoved':absent.returncode!=0,'primaryRetained':result['failed'],'cleanupErrors':result['cleanupErrors']},indent=2),encoding='utf-8')
        if not ok:f.failed.append({'name':'cleanup-fault-finalization','error':'cleanup/report did not preserve errors and remove container'})
        print('CLEANUP_FAULT_FINALIZATION='+('PASS' if ok else 'FAIL'),flush=True)
    print(f"PARENT_COUNTERS expect={args.expect} passed={len(f.passed)} failed={len(f.failed)} productionActions=0",flush=True)
    return 1 if f.failed or f.cleanup_errors else 0

if __name__=='__main__':raise SystemExit(main())
