#!/usr/bin/env python3
"""New-source47 four-CAS package from an explicitly supplied fresh exact baseline."""
import argparse
import difflib
import json
from pathlib import Path
import shutil

import release_client_compat as c
from release47_maintenance import maintenance_gateway
from release103_static_preflight import ROLLBACK


def prepare(spec,output):
    output=Path(output);c.require(not output.exists(),'New distinct47 output required')
    baseline=spec['baseline'];text=Path(baseline['dumpPath']).read_bytes().decode();dump=c.Dump(text)
    c.require(c.sha(text.encode())==baseline['expectedDumpSha256'],'Fresh full baseline mismatch')
    sources={n:(Path(baseline['sourceRoot'])/n.lstrip('/')).read_bytes() for n in dump.files}
    c.require(set(sources)==set(baseline['exactSha256'])==set(baseline['realPaths']),'Complete closure SHA/realpath metadata required')
    for name,raw in sources.items():c.require(c.sha(raw)==baseline['exactSha256'][name] and dump.files[name] in (raw.decode(),raw.decode()+'\n'),'Exact47 source mismatch')
    assets=Path(spec['assetRoot']);manifest=json.loads((assets/'static-union/manifest.json').read_text());ar=json.loads((assets/'ASSET_REPORT.json').read_text())
    c.require(ar['target']=='47.105.59.142' and all(ar[k]==str(spec[k]) for k in ('image','commit','buildVersion')),'47 fixed artifact binding mismatch')
    c.require(c.file_sha(assets/'static-union/manifest.json')==ar['manifestSha256'],'47 manifest changed')
    c.verify_assets(manifest,assets/'static-union')
    output.mkdir(parents=True)
    _,opened,policy=c.render_gateway(text,spec['site'],spec['candidateOrigin'],spec['oldOrigins'],spec['staticRoot'],manifest)
    maintenance_gateway(opened,spec['candidateOrigin'],output/'private-maintenance-render',baseline_dump=text,source_files=sources)
    maintained=(output/'private-maintenance-render/nginx.after.txt').read_bytes().decode()
    def raw_closure(t):return {n:(b[:-1] if dump.files[n]==sources[n].decode()+'\n' else b).encode() for n,b in c.Dump(t).files.items()}
    states={'baseline':(text,sources),'maintenance':(maintained,raw_closure(maintained)),'candidate':(opened,raw_closure(opened))}
    shutil.copytree(assets/'static-union',output/'static')
    descriptors={};transitions={}
    def item(p):return {'path':p.relative_to(output).as_posix(),'sha256':c.file_sha(p)}
    for folder,before,after in [('maintenance','baseline','maintenance'),('open','maintenance','candidate'),('rollback-maintenance','maintenance','baseline'),('rollback-open','candidate','baseline')]:
        bt,br=states[before];at,arr=states[after];root=output/'gateways'/folder
        changes={n:b for n,b in c.Dump(at).files.items() if b!=c.Dump(bt).files[n]}
        report={**policy,'schemaVersion':1,'kind':'47-latest-'+folder,'configClosureValidated':True,
                'beforeDumpSha256':c.sha(bt.encode()),'afterDumpSha256':c.sha(at.encode()),'fromState':before,'toState':after,
                'commit':spec['commit'],'buildVersion':str(spec['buildVersion']),'image':spec['image'],'sourceRealPaths':baseline['realPaths'],'liveWrites':0}
        c.write_gateway_bundle(bt,changes,at,report,root,br)
        for n,raw in br.items():
            p=root/'closure-before'/n.lstrip('/');p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
        descriptors[folder]={'report':item(root/'report.json'),'before':{n:item(root/'closure-before'/n.lstrip('/')) for n in br},'after':{p['path']:item(root/p['after']) for p in report['patches']}}
        for patch in report['patches']:c.require((root/patch['after']).read_bytes()==arr[patch['path']],'47 transition after bytes changed')
        (root/'MODIFIED_FILE').write_bytes(arr[spec['site']])
        (root/'DIFF_FILE.patch').write_text(''.join(difflib.unified_diff(bt.splitlines(True),at.splitlines(True),fromfile='nginx.before.txt',tofile='nginx.after.txt')),encoding='utf-8',newline='\n')
        (root/'ROLLBACK.sh').write_text(ROLLBACK,encoding='utf-8',newline='\n');(root/'ROLLBACK.sh').chmod(0o755)
        (root/'VERIFICATION.txt').write_text('STATUS=OFFLINE_PREPARED\nBRANCH=latest47 candidate/static/maps;fresh exact baseline rollback\nSOURCE='+spec['commit']+'\nIMAGE='+spec['image']+'\nBUILD_VERSION='+str(spec['buildVersion'])+'\nFOUR_PATHS:\n'+'\n'.join(str((root/n).resolve()) for n in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'))+'\n',encoding='utf-8')
        transitions[folder]={k:report[k] for k in ('fromState','toState','beforeDumpSha256','afterDumpSha256')}
    (output/'gateways.json').write_text(json.dumps(descriptors,indent=2)+'\n',encoding='utf-8')
    summary={**ar,'kind':'47-latest-four-cas','source':spec['commit'],'version':str(spec['buildVersion']),'baselineDumpSha256':c.sha(text.encode()),
             'staticRoot':spec['staticRoot'],'candidateOrigin':spec['candidateOrigin'],'sourceRealPaths':baseline['realPaths'],'transitions':transitions,'gatewayDescriptor':'gateways.json',
             'canonicalSessionReplaced':False,'liveConnections':0,'readyToDeploy':False,'nginxValidation':'EXISTING_POLICY_MODULE_REUSED; new-byte syntax/root acceptance pending'}
    (output/'manifest.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8');return summary


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();r=prepare(json.loads(Path(a.input).read_text()),a.output)
    print('LATEST47_GATEWAY=PREPARED FOUR_CAS=4 SOURCE='+r['source']+' LIVE_CONNECTIONS=0')
