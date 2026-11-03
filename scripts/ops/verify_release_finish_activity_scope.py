"""Execute the real collector call expressions, without any release/host action."""
import argparse, ast, json, pathlib, types

def check(root, baseline=False):
    checks=[]
    for relative in ['scripts/ops/release103_refactor.py','scripts/ops/release_site_control.py']:
        tree=ast.parse((root/relative).read_text(encoding='utf8'))
        calls=[]
        for node in ast.walk(tree):
            if isinstance(node,ast.FunctionDef) and node.name=='finish':
                calls += [item for item in ast.walk(node) if isinstance(item,ast.Call) and isinstance(item.func,ast.Attribute) and item.func.attr=='collect_task_snapshot']
        assert len(calls)==1,(relative,len(calls))
        for explicit in [None,'all','nonfinished-and-prior']:
            configuration={} if explicit is None else {'taskActivityScope':explicit}
            owner=types.SimpleNamespace(c=configuration,tx=types.SimpleNamespace(run=lambda:None,save=lambda:None),db={'id':'fixture'},task_before=types.SimpleNamespace(private={'original':'snapshot'}))
            recorded=eval(compile(ast.fix_missing_locations(ast.Expression(calls[0])),relative,'eval'),{
                'self':owner,'public_identity':lambda value:value,
                'tasks':types.SimpleNamespace(ADDITIVE_TABLES=set(),collect_task_snapshot=lambda *args,**kwargs:kwargs)})
            actual=recorded.get('activity_scope','all');expected=explicit or 'all'
            if baseline and explicit=='nonfinished-and-prior':
                assert actual=='all','Expected original finish mode mismatch'
                checks.append({'file':relative,'input':explicit,'beforeScope':expected,'afterScope':actual,'result':'REPRODUCED'})
            else:
                assert actual==expected,(relative,explicit,actual)
                assert recorded['previous']==owner.task_before.private
                assert recorded['projection']=='proof' and recorded['row_limit']==5000 and recorded['statement_timeout_ms']==15000
                checks.append({'file':relative,'input':explicit,'beforeScope':expected,'afterScope':actual,'result':'PASS'})
    return checks

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source-root',default='.');p.add_argument('--baseline',action='store_true');p.add_argument('--output')
    a=p.parse_args();checks=check(pathlib.Path(a.source_root).resolve(),a.baseline)
    result={'status':'REPRODUCED' if a.baseline else 'PASS','checks':checks,'sourceRoot':str(pathlib.Path(a.source_root).resolve()),'hostActions':0}
    if a.output:pathlib.Path(a.output).write_text(json.dumps(result,indent=2),encoding='utf8')
    print('RELEASE_FINISH_ACTIVITY_SCOPE='+result['status']+' CHECKS='+str(len(checks))+' DEFAULT_ALL=UNCHANGED HOST_ACTIONS=0 EXIT=0')

