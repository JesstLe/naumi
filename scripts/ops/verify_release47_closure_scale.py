"""Actual PG closure-stage scale/semantic checks, not a production capacity test.

The fixture installs only bounded graph GUCs, then executes the exact closure
statement emitted by build_sql. Full paging/proof is covered separately by the
existing 37-case verifier. No production credentials, HTTP, supplier or replay.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import sys
import time
from collections import defaultdict, deque

from verify_release47_snapshot_pagination import Fixture, load

COUNTS = {'app_image_jobs':19115,'app_canvas_image_tasks':13,'app_video_tasks':11,
          'app_reference_operations':511,'app_imagegen_batches':436,'app_imagegen_batch_items':576,
          'app_billing_operations':11440,'app_supplier_calls':13215,'app_supplier_cost_jobs':4031,
          'app_release_session_owners':103,'app_release_activities':2,'app_worker_tick_receipts':3,
          'app_gen_reservations':1,'app_billing_reconciliations':378,'app_model_execution_stages':11326,
          'app_supplier_call_outputs':9869,'app_supplier_accounts':11,'app_ledger':10940}
TERMINAL = {'app_reference_operations':'done','app_imagegen_batches':'succeeded',
            'app_imagegen_batch_items':'succeeded','app_billing_operations':'settled',
            'app_supplier_calls':'completed','app_supplier_cost_jobs':'done',
            'app_release_session_owners':'idle','app_release_activities':'finished'}
BUDGET = {'page_rows':1024,'graph_bytes':24*1024*1024}


def closure(module, previous=None, budget=None):
    sql=module.build_sql(projection='proof',row_limit=5000,previous=previous,
                         statement_timeout_ms=15000,budget=budget or BUDGET).decode()
    start=sql.index('WITH RECURSIVE source AS MATERIALIZED')
    end=sql.index('FROM saved;',start)+len('FROM saved;')
    return sql[start:end]


def scale_graph(module):
    result={name:[] for name in module.KEYS}
    for name,key in module.KEYS.items():
        for g in range(1,COUNTS.get(name,0)+1):
            row={f:f+'-'+str(g) for f in module.key_fields(key)}
            if key=='id':row['id']=('gen-img-' if name=='app_image_jobs' else
                'img-' if name=='app_billing_operations' else 'call-' if name=='app_supplier_calls' else
                'led-image-img-' if name=='app_ledger' else 'row-')+str(g)
            row.update(state=TERMINAL.get(name,'done'),status='completed',phase='completed')
            if name=='app_image_jobs':row['snapshot']={'status':'pending' if g<=1500 else 'done',
                                                      'childJobIds':['gen-img-2'] if g==1 else []}
            if name in ['app_supplier_calls','app_model_execution_stages','app_billing_reconciliations']:
                row['operation_id']='img-'+str(g)
            if name=='app_supplier_call_outputs':row['call_id']='call-'+str(g)
            result[name].append(row)
    return result


def reference_sets(m, graph, previous=None):
    """Independent adjacency-set BFS over the same documented graph fields."""
    links_by_table={'app_image_jobs':['id'],'app_canvas_image_tasks':['id'],'app_video_tasks':['id'],
        'app_reference_operations':['id'],'app_billing_operations':['id'],
        'app_supplier_calls':['id','operation_id','task_id','parent_call_id'],
        'app_imagegen_batch_items':['child_operation_id','batch_id'],
        'app_video_workflow_run_nodes':['run_id','task_id'],'app_imagegen_batches':['id']}
    active_terminal={'app_canvas_image_tasks':{'completed','failed','cancelled'},
        'app_video_tasks':{'completed','failed','cancelled'},'app_reference_operations':{'done','preview'},
        'app_imagegen_batches':{'succeeded','partial','failed','cancelled'},
        'app_imagegen_batch_items':{'succeeded','failed','cancelled'},
        'app_video_workflow_run_nodes':{'completed','failed','blocked','cancelled'},
        'app_video_media_jobs':{'completed','failed','cancelled'},
        'app_billing_operations':{'settled','released','failed'},
        'app_supplier_calls':{'completed','failed','cancelled','canceled','rejected','response-received','stream-completed','succeeded','success','pre-submission-failed'},
        'app_supplier_cost_jobs':{'done'},'app_release_session_owners':{'idle'},
        'app_release_activities':{'finished'},'app_worker_tick_receipts':{'completed'}}
    prior=m.tracked_ids(previous);edges=defaultdict(set);seeds=set();identities=[]
    for i,(name,key) in enumerate(m.KEYS.items()):
        for row in graph.get(name,[]):
            identity=m.row_key(row,key);vertex='row:'+str(i)+':'+identity;identities.append((name,identity,vertex))
            fields=[*links_by_table.get(name,[])]+([m.RELATED[name][1]] if name in m.RELATED else [])
            links=[row.get(k) for k in fields];snap=row.get('snapshot') or {};payload=row.get('payload') or {}
            if name=='app_image_jobs':links += [re.sub(r'^(imagegen-|gen-|suite-|aplus-)','',row.get('id',''))]+snap.get('childJobIds',[])
            if name=='app_ledger':links += [re.sub(r'^(led-image-|led-canvas-image-|led-video-|led-media-)','',row.get('id',''))]
            outgoing=[identity,*[row.get(k) for k in ['operation_id','upstream_id','task_id','run_id','ledger_id','batch_id','child_operation_id','account_id','parent_call_id']],payload.get('callId'),payload.get('operation'),(payload.get('context') or {}).get('operationId'),re.sub(r'^(imagegen-|gen-|suite-|aplus-)','',row.get('id','')),*snap.get('operationIds',[]),*snap.get('childJobIds',[])]
            for value in links:
                if value is not None and value!='':edges['root:'+str(value)].add(vertex)
            for value in outgoing:
                if value is not None and value!='':edges[vertex].add('root:'+str(value))
            active=False
            if name=='app_image_jobs':active=snap.get('status','') not in ['done','error']
            elif name in active_terminal:
                state_field='phase' if name=='app_worker_tick_receipts' else 'status' if name in ['app_canvas_image_tasks','app_video_tasks','app_video_workflow_run_nodes','app_video_media_jobs'] else 'state'
                active=row.get(state_field,'') not in active_terminal[name]
            if active or identity in prior.get(name,[]):seeds.add(vertex)
    visited=set(seeds);queue=deque(seeds)
    while queue:
        for dest in edges[queue.popleft()]:
            if dest not in visited:visited.add(dest);queue.append(dest)
    return {name:sorted(identity for table,identity,v in identities if table==name and v in visited) for name in m.KEYS}


class ScaleFixture(Fixture):
    def command(self,args,**kwargs):
        if args[:2]==['docker','run']:
            args=list(args);args[args.index('--memory')+1]='512m';args[args.index('--cpus')+1]='1'
        return super().command(args,**kwargs)

    def execute(self,m,graph,label,previous=None,budget=None,explain=False):
        b=m.budgets(budget or BUDGET)
        total=sum(len(rows) for rows in graph.values())
        encoded={name:json.dumps(rows,ensure_ascii=False,separators=(',',':')) for name,rows in graph.items()}
        size=sum(len(value.encode()) for value in encoded.values())
        assert total<=b['scan_rows'] and size<=b['graph_bytes'],'FIXTURE_EXCEEDS_GRAPH_BUDGET'
        state={'ok':True,'reason':'','pages':0,'scanRows':total,'graphBytes':size,'proofBytes':0,'selectedRows':0}
        lines=['BEGIN READ ONLY;SET LOCAL search_path=pg_catalog;SET LOCAL statement_timeout=15000;',
               "SELECT set_config('naumi_snapshot.state',"+m.literal(json.dumps(state))+",true) AS v \\gset initial_"]
        for i,name in enumerate(m.KEYS):
            lines.append("SELECT set_config('naumi_snapshot.graph_"+str(i)+"',"+m.literal(encoded.get(name,'[]'))+",true) AS v \\gset load_")
        lines += [('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' if explain else '')+closure(m,previous,budget),
            "SELECT jsonb_build_object('kind','selected','tables',jsonb_build_object("+
              ','.join(m.literal(name)+','+m.setting('selected_'+str(i)) for i,name in enumerate(m.KEYS))+"));",
            'ROLLBACK;']
        sql='\n'.join(lines).encode();started=time.monotonic();result=self.command(self.pg,stdin=sql,timeout=25);seconds=time.monotonic()-started
        (self.out/(label+'.sql')).write_bytes(sql)
        report={'command':self.pg,'input':label+'.sql','exit':result.returncode,'seconds':seconds,
                'rows':total,'graphBytes':size,'stderr':result.stderr.decode(),'statementTimeoutMs':15000,'budgets':b}
        (self.out/(label+'.json')).write_text(json.dumps(report,indent=2))
        print(f'CLOSURE {label} rows={total} bytes={size} exit={result.returncode} seconds={seconds:.3f}',flush=True)
        if result.returncode:return None,report
        raw=result.stdout.decode();selected=json.loads(next(l for l in raw.splitlines() if l.startswith('{"kind": "selected"')))
        selection={name:sorted(v) for name,v in selected['tables'].items()}
        if explain:
            plan=json.loads(raw[:raw.index('{"kind": "selected"')].strip());(self.out/(label+'-plan.json')).write_text(json.dumps(plan,indent=2))
            report['executionMs']=plan[0]['Execution Time'];report['jitMs']=plan[0].get('JIT',{}).get('Timing',{}).get('Total',0)
            nodes=[]
            def walk(n):
                nodes.append(n)
                for child in n.get('Plans',[]):walk(child)
            walk(plan[0]['Plan']);report['chosenScanLoops']=[n.get('Actual Loops') for n in nodes if n.get('CTE Name')=='chosen'];report['tempBlocks']=plan[0]['Plan'].get('Temp Read Blocks')
            (self.out/(label+'.json')).write_text(json.dumps(report,indent=2))
            return {'selection':selection},report
        coverage=json.loads(next(l for l in raw.splitlines() if l.startswith('{"kind": "coverage"')))
        return {'selection':selection,'state':coverage['state']},report

    def run(self):
        self.sql('CREATE SCHEMA '+self.schema)
        self.baseline=load(self.args.baseline_module);base=self.baseline;m=self.m
        large=scale_graph(m)
        def large_check():
            got,report=self.execute(m,large,'large',explain=True)
            self.require(got is not None,'closure exceeded original 15s statement budget')
            self.require(got['selection']==reference_sets(m,large),'scale selected graph differs from independent BFS')
            if 'jsonb_object_agg(key,true) FROM chosen' in closure(m):self.require(max(report['chosenScanLoops'])==1,'selected set repeatedly scanned')
        self.check('large_graph_within_original_statement_budget_and_exact_set',large_check)
        mixed={name:[] for name in m.KEYS}
        mixed['app_image_jobs']=[{'id':'gen-parent','snapshot':{'status':'pending','childJobIds':['gen-child'],'operationIds':['paid']}},
                                 {'id':'gen-child','snapshot':{'status':'done'}},{'id':'legacy-done','snapshot':{'status':'done'}}]
        mixed['app_billing_operations']=[{'id':'paid','state':'settled','ledger_id':'ledger'}]
        mixed['app_ledger']=[{'id':'ledger'}]
        mixed['app_supplier_calls']=[{'id':'call-'+str(i),'state':'unknown' if i==0 else 'completed','parent_call_id':'call-'+str((i+1)%12)} for i in range(12)]
        mixed['app_supplier_calls'][0]['operation_id']='paid'
        prior={'kind':'task-preservation-private-v1','tables':{'app_image_jobs':{'rows':[{'id':'legacy-done'}]}}}
        cases=[('parent_child_supplier_cycle',mixed,None,None,True),('original_terminal_id',mixed,prior,None,True)]
        reverse=copy.deepcopy(mixed);reverse['app_image_jobs'][0]['snapshot']['status']='done';reverse['app_image_jobs'][1]['snapshot']['status']='pending';cases.append(('reverse_parent',reverse,None,None,True))
        missing=copy.deepcopy(mixed);missing['app_image_jobs'][0]['snapshot']['childJobIds']=['absent'];cases.append(('missing_child',missing,None,None,False))
        null=copy.deepcopy(mixed);null['app_image_jobs'][0]['snapshot']['childJobIds']=[None];cases.append(('null_child',null,None,None,False))
        duplicates=copy.deepcopy(mixed);duplicates['app_image_jobs'].append(copy.deepcopy(duplicates['app_image_jobs'][1]));cases.append(('duplicate_identity_existential',duplicates,None,None,True))
        cases.append(('root_budget',mixed,None,{'roots':1},False));cases.append(('selected_budget',mixed,None,{'selected_rows':1},False))
        for label,graph,previous,budget,ok in cases:
            def check(label=label,graph=graph,previous=previous,budget=budget,ok=ok):
                before,_=self.execute(base,graph,label+'-original',previous,budget)
                after,_=self.execute(m,graph,label+'-candidate',previous,budget)
                self.require(before is not None and after is not None and before==after,'original/candidate closure changed')
                self.require(after['state']['ok'] is ok,'wrong fail-closed state')
                self.require(after['selection']==reference_sets(m,graph,previous),'reference BFS changed')
            self.check(label,check)


class RegressionFixture(ScaleFixture):
    # Keep the established 37 assertions unchanged, but use this task's same
    # 512 MiB / 1 CPU fixture envelope rather than the older runner defaults.
    run = Fixture.run


def main():
    p=argparse.ArgumentParser();p.add_argument('--module',default=str(Path(__file__).with_name('release47_task_snapshot.py')))
    p.add_argument('--baseline-module',required=True);p.add_argument('--output',required=True);p.add_argument('--phase',default='MODIFIED')
    p.add_argument('--regressions',action='store_true')
    args=p.parse_args();args.fixture_id=None;f=(RegressionFixture if args.regressions else ScaleFixture)(args)
    try:f.start();f.run()
    except Exception as e:f.failed.append({'name':'runner','error':str(e)});print('RUNNER_ERROR '+str(e),flush=True)
    finally:f.close()
    return int(bool(f.failed or f.cleanup_errors))


if __name__=='__main__':sys.exit(main())
