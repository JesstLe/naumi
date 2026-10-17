#!/usr/bin/env python3
"""Actual isolated closure inspection, including cloned and altered-prototype Maps."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import time
import uuid


def run(argv,**kwargs):
    result=subprocess.run(argv,capture_output=True,**kwargs)
    if result.returncode:raise RuntimeError(result.stderr.decode()[-1000:])
    return result.stdout


def main():
    p=argparse.ArgumentParser();p.add_argument('--image',required=True);p.add_argument('--output',required=True)
    modes=('empty','session','creating','wrong-binding','wrong-source','unloaded','hidden-prototype',
           'process-getter','process-proxy','immediate-getter','immediate-wrapper','timer-export')
    p.add_argument('--mode',choices=modes);a=p.parse_args()
    root=Path(a.output).resolve();root.mkdir(parents=True,exist_ok=False)
    script=Path(__file__).with_name('audit_legacy_agent_scopes.mjs').read_bytes();results=[]
    source="""const mode=process.env.FIXTURE_MODE;
function make(active,creating){try{let M=new Map,N=new Map;
if(active)M.set('private-fixture@example.invalid::tmp-session',{id:'tmp-session',email:'private-fixture@example.invalid'});
if(creating)N.set('private-fixture@example.invalid::tmp-creating',new Promise(()=>{}));
Object.setPrototypeOf(M,null);Object.setPrototypeOf(N,null);
async function z(...args){return [M,N,args]}
return z;}catch(error){throw error}}
globalThis.keep=[make(false,false),make(mode==='session'||mode==='hidden-prototype',mode==='creating')];
if(mode==='hidden-prototype')Object.setPrototypeOf(keep[1],null);
globalThis.Map=class FakeMap{};globalThis.Function=class FakeFunction{};
globalThis.proxyTrapCalls=0;const trap=()=>{globalThis.proxyTrapCalls++;throw Error('DO_NOT_INVOKE_PROXY_TRAP')};globalThis.keepProxy=new Proxy(keep[0],{getOwnPropertyDescriptor:trap,getPrototypeOf:trap,get:trap});
globalThis.auditSideEffects=0;
const poisoned=()=>{globalThis.auditSideEffects++;throw Error('APPLICATION_CALLBACK_MUST_NOT_RUN')};
if(mode==='process-getter')Object.defineProperty(globalThis,'process',{configurable:true,get:poisoned});
if(mode==='process-proxy')globalThis.process=new Proxy(process,{get:poisoned,getPrototypeOf:poisoned});
if(mode==='immediate-getter')Object.defineProperty(globalThis,'setImmediate',{configurable:true,get:poisoned});
if(mode==='immediate-wrapper')globalThis.setImmediate=poisoned;
if(mode==='timer-export')require('node:timers').setImmediate=poisoned;
"""
    agent=root/'agent.cjs';agent.write_text(source)
    entry=root/'server.cjs';entry.write_text("if(process.env.FIXTURE_MODE!=='unloaded')require('./agent.cjs');require('node:http').createServer((q,s)=>{s.end(JSON.stringify({proxyTrapCalls:globalThis.proxyTrapCalls||0,auditSideEffects:globalThis.auditSideEffects||0}))}).listen(9081,'127.0.0.1');console.log('FIXTURE_READY');")
    module={'path':'/fixture/agent.cjs','sha256':hashlib.sha256(agent.read_bytes()).hexdigest(),
            'header':'async function z(...args){','bindingClause':'let M=new Map,N=new Map;',
            'functionName':'z','sessions':'M','creating':'N'}
    for mode in ([a.mode] if a.mode else modes):
        name='video-agent-scope-'+uuid.uuid4().hex[:12];label='io.naumi.agent-scope-fixture='+name
        try:
            run(['docker','run','-d','--name',name,'--label',label,'--network','none','--memory','512m','--memory-swap','512m',
                 '--cpus','1','-e','NODE_OPTIONS=','-e','FIXTURE_MODE='+mode,'--mount','type=bind,src='+str(root)+',dst=/fixture,readonly',
                 '--entrypoint','node',a.image,'/fixture/server.cjs'])
            for _ in range(60):
                if b'FIXTURE_READY' in run(['docker','logs',name]):break
                time.sleep(.1)
            else:raise RuntimeError('FIXTURE_READINESS_TIMEOUT')
            declared=dict(module)
            if mode=='wrong-binding':declared['creating']='Missing'
            if mode=='wrong-source':declared['sha256']='0'*64
            encoded=base64.b64encode(json.dumps({'schemaVersion':1,'modules':[declared]}).encode()).decode()
            command=['docker','exec','-i','-e','NODE_OPTIONS=',name,'node','--input-type=module','-',
                     '--pid','1','--allow-sigusr1','--accept-full-gc','--allowed-target-listen-ports','9081','--contract-base64',encoded]
            observed=subprocess.run(command,input=script,capture_output=True,timeout=150)
            report=json.loads(observed.stdout);(root/(mode+'.json')).write_text(json.dumps(report,indent=2))
            assert 'private-fixture@example.invalid' not in observed.stdout.decode()
            assert report['ordinaryDrainReceipt'] is None and not report['allApplicationRuntimeObserved']
            assert not report['applicationMethodsCalled'] and not report['heapSnapshotTaken'] and not report['debuggerPausedByAudit']
            assert report['allDeclaredModuleScopesEnumerated'] is False
            if mode in ('empty','session','creating','hidden-prototype','immediate-getter','immediate-wrapper'):
                assert observed.returncode==0,report
                assert report['allMatchedPrototypeFunctionsProcessed'] and len(report['clones'])==(1 if mode=='hidden-prototype' else 2),report
                assert report['counts']=={'sessionEntries':int(mode=='session'),'creatingEntries':int(mode=='creating')},report
                assert report['status']==('OBSERVED_DECLARED_BINDINGS_NONEMPTY' if mode in ('session','creating') else 'OBSERVED_DECLARED_BINDINGS_PARTIAL')
                assert report['inspectorClosedConfirmed'] and report['trustedCoreCleanupValidated']
                assert report['scopeKindsSeen'].get('Block',0)>0
            else:
                assert observed.returncode==2 and report['status']=='HOLD',report
                assert report['holdReason']=={'wrong-binding':'DECLARED_BINDING_NOT_NATIVE_MAP','wrong-source':'DECLARED_SOURCE_BYTES_CHANGED',
                    'unloaded':'DECLARED_MODULE_NOT_LOADED','process-getter':'TRUSTED_CORE_FUNCTION_UNAVAILABLE',
                    'process-proxy':'TRUSTED_PROCESS_UNAVAILABLE','timer-export':'TRUSTED_CORE_FUNCTION_UNAVAILABLE'}[mode],report
                if mode=='wrong-source':assert not report['inspectorOpenedByAudit']
                elif mode in ('process-getter','process-proxy','timer-export'):
                    assert not report['inspectorClosedConfirmed'] and report['safeCleanupUnavailable']
                else:assert report['inspectorClosedConfirmed']
            # Actual target remains alive, and inspection never invokes the
            # fixture Proxy traps, Agent z(), or its session/creation methods.
            probe="const r=await fetch('http://127.0.0.1:9081');console.log(await r.text());"
            state=json.loads(run(['docker','exec',name,'node','--input-type=module','-e',probe]))
            assert state['proxyTrapCalls']==0 and state['auditSideEffects']==0,state
            info=json.loads(run(['docker','inspect',name]))[0];assert info['State']['Running'] and not info['State']['OOMKilled']
            results.append({'mode':mode,'status':'PASS','observation':report['status'],'elapsedMs':report['elapsedMs']})
            print(json.dumps(results[-1]),flush=True)
        finally:
            row=json.loads(run(['docker','inspect',name]))[0]
            assert row['Config']['Labels'].get('io.naumi.agent-scope-fixture')==name
            run(['docker','rm','-fv',row['Id']])
    (root/'result.json').write_text(json.dumps({'status':'PASS','results':results,'productionConnections':0,'supplierCalls':0},indent=2))


if __name__=='__main__':main()
