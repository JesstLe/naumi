#!/usr/bin/env python3
"""Render latest unified HK release from the already-retired static-live state.

Does NOT accept the historical65-route original state, recapture a host, mutate
canonical sessions, or use a source commit/version inferred from old manifests.
"""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import shutil

import release_client_compat as c
import release103_gateway as old
import release103_static_preflight as pre
from rebase103_static_gateway import descriptor

STATIC_LIVE_SHA='fa9ecb10fb1a527a1363008ff3c08920b18ebc7d717b69c3a70d9ac372d31c6e'


def inventory(text,expected=STATIC_LIVE_SHA):
    c.require(c.sha(text.encode())==expected==STATIC_LIVE_SHA,'Static-live baseline changed: fresh capture and review required')
    dump=c.Dump(text)
    c.require(set(dump.files)==set(pre.REAL_PATHS),'Unexpected static-live config closure')
    servers=[n for n in dump.nodes[old.SITE] if n.name=='server']
    c.require(len(servers)==1,'Exactly one static-live server required')
    server=servers[0]
    c.require([n.args for n in server.children if n.name=='server_name']==[['103.30.76.93','naumi.top','www.naumi.top']],'Changed server identity')
    locations={' '.join(n.args):n for n in server.children if n.name=='location'}
    c.require(len(locations)==51 and set(locations)==old.FLEET|set(old.DENIES)|old.MAIN|old.DESKTOP|old.ENTERPRISE|{'^~ '+p for p in old.PREFIXES},'Expected51 reviewed static-live route classes, not historical65')
    c.require(not any(n.name in ('error_page','proxy_intercept_errors') or any(a in old.FALLBACKS for a in n.args) for n in c.walk(dump.nodes[old.SITE])),'Retired fallback/reference reintroduced')
    for prefix in old.PREFIXES:
        node=locations['^~ '+prefix]
        c.require([n.args for n in node.children if n.name=='alias']==[[pre.STATIC_ROOT+prefix]],'Changed static-live alias')
    return dump,server,locations


def render(text,manifest,static_root,candidate='http://127.0.0.1:13100',maintenance=False):
    dump,server,locations=inventory(text)
    c.origin(candidate)
    c.require(candidate!='http://127.0.0.1:13062','Fleet cannot be candidate')
    c.require(static_root.startswith('/') and not any(char in static_root for char in '$\r\n;{}\\') and '..' not in PurePosixPath(static_root).parts,'Invalid new static root')
    asset_count=old.validate_manifest(manifest)
    body=dump.files[old.SITE];edits=[]
    for key,node in locations.items():
        if key in old.FLEET|set(old.DENIES):continue
        if key in {'^~ '+p for p in old.PREFIXES}:
            alias=next(n for n in node.children if n.name=='alias')
            edits.append((alias.tokens[1].start,alias.tokens[1].end,c.quote(static_root.rstrip('/')+node.args[-1])))
            continue
        if maintenance:
            edits.append((node.start,node.end,'location '+' '.join(c.quote(t.value) for t in node.tokens[1:])+' { add_header Retry-After "60" always; add_header Cache-Control "no-store" always; return 503; }'))
            continue
        proxies=[n for n in node.children if n.name=='proxy_pass']
        c.require(len(proxies)==1,'One original dynamic upstream required')
        for child in node.children:
            if child.name=='proxy_pass':
                m=re.fullmatch(r'http://127\.0\.0\.1:[0-9]+(/.*)?',child.args[0]);c.require(m,'Unknown original origin')
                edits.append((child.tokens[1].start,child.tokens[1].end,c.quote(candidate+(m.group(1) or ''))))
            elif child.name=='proxy_set_header' and child.args[:1]==['X-Forwarded-For']:
                edits.append((child.start,child.end,'proxy_set_header X-Forwarded-For $remote_addr;'))
        identity='\n proxy_set_header CF-Connecting-IP "";\n'
        if not any(n.name=='proxy_set_header' and n.args[:1]==['X-Forwarded-For'] for n in node.children):identity+=' proxy_set_header X-Forwarded-For $remote_addr;\n'
        if not any(n.name=='proxy_set_header' and n.args[:1]==['X-Real-IP'] for n in node.children):identity+=' proxy_set_header X-Real-IP $remote_addr;\n'
        edits.append((node.closing,node.closing,identity))
    extra=[]
    for modifier,uri,suffix in [('=','/enterprise/api','/api'),('^~','/enterprise/api/','/api/')]:
        content='add_header Retry-After "60" always; add_header Cache-Control "no-store" always; return 503;' if maintenance else 'proxy_pass '+c.quote(candidate+suffix)+'; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header CF-Connecting-IP ""; proxy_set_header Connection ""; proxy_buffering off; proxy_read_timeout 900s;'
        extra.append('location '+modifier+' '+uri+' { '+content+' }')
    extra.append('location ^~ /enterprise/api/video/worker/ { return 403; }')
    edits.append((server.closing,server.closing,'\n# Unified candidate API aliases; static-live baseline retained for rollback.\n'+'\n'.join(extra)+'\n'))
    for start,end,replacement in sorted(edits,reverse=True):body=body[:start]+replacement+body[end:]
    after=dump.render({old.SITE:body})
    new=c.Dump(after);newloc={' '.join(n.args):n for n in new.nodes[old.SITE][0].children if n.name=='location'}
    for key in old.FLEET|set(old.DENIES):
        before_node=locations[key];after_node=newloc[key]
        c.require(dump.files[old.SITE][before_node.start:before_node.end]==new.files[old.SITE][after_node.start:after_node.end],'Protected Fleet/deny bytes changed')
    c.require(not any(n.args and n.args[0].startswith('@') for n in newloc.values()),'Named fallback returned')
    return after,{'staticAssets':asset_count,'staticRoot':static_root,'candidateOrigin':candidate,'runtimeTopology':'unified-web-three-ui','liveWebProcesses':1,'fleetRouteBytesPreserved':9,'denyRouteBytesPreserved':3,'legacyFallbacksResurrected':False}


def prepare(spec,output):
    output=Path(output)
    c.require(not output.exists(),'New distinct latest gateway package required')
    c.require(re.fullmatch('[a-f0-9]{40}',spec['commit']) and re.fullmatch('sha256:[a-f0-9]{64}',spec['image']) and str(spec['buildVersion']).isdecimal(),'Explicit new source/image/build required')
    baseline=spec['baseline'];text=Path(baseline['dumpPath']).read_bytes().decode()
    dump,_,_=inventory(text,baseline['expectedDumpSha256'])
    sources={name:(Path(baseline['sourceRoot'])/name.lstrip('/')).read_bytes() for name in dump.files}
    c.require(set(baseline['exactSha256'])==set(sources),'Full exact before file hashes required')
    for name,raw in sources.items():
        c.require(c.sha(raw)==baseline['exactSha256'][name] and dump.files[name] in (raw.decode(),raw.decode()+'\n'),'Static-live exact disk CAS mismatch')
    asset_root=Path(spec['assetRoot']);manifest=json.loads((asset_root/'static-union/manifest.json').read_text())
    asset_report=json.loads((asset_root/'ASSET_REPORT.json').read_text())
    c.require(all(asset_report[k]==str(spec[k]) for k in ('image','commit','buildVersion')),'New asset/source/image/build binding mismatch')
    c.require(c.file_sha(asset_root/'static-union/manifest.json')==asset_report['manifestSha256'],'Asset manifest changed')
    for item in manifest['assets']:
        p=asset_root/'static-union'/item['url'].lstrip('/')
        c.require(p.stat().st_size==item['size'] and c.file_sha(p)==item['sha256'],'Asset bytes changed')
    opened,open_report=render(text,manifest,spec['staticRoot'],spec.get('candidateOrigin','http://127.0.0.1:13100'))
    maintained,_=render(text,manifest,spec['staticRoot'],spec.get('candidateOrigin','http://127.0.0.1:13100'),True)
    def raw_closure(t):
        return {name:(body[:-1] if dump.files[name]==sources[name].decode()+'\n' else body).encode() for name,body in c.Dump(t).files.items()}
    states={'static':(text,sources),'maintenance':(maintained,raw_closure(maintained)),'candidate':(opened,raw_closure(opened))}
    output.mkdir(parents=True)
    shutil.copytree(asset_root/'static-union',output/'static')
    descriptors={};transitions={}
    for folder,before,after in [('maintenance','static','maintenance'),('open','maintenance','candidate'),('rollback-maintenance','maintenance','static'),('rollback-open','candidate','static')]:
        bt,br=states[before];at,ar=states[after]
        report={**open_report,'schemaVersion':1,'kind':'103-latest-'+folder,'target':'103.30.76.93','sourceRealPaths':pre.REAL_PATHS,
                'configClosureValidated':True,'beforeDumpSha256':c.sha(bt.encode()),'afterDumpSha256':c.sha(at.encode()),
                'fromState':before,'toState':after,'commit':spec['commit'],'buildVersion':str(spec['buildVersion']),'image':spec['image'],
                'rollbackTarget':'static-live fa9e; no historical fallback resurrection','readyToDeploy':False,'liveWrites':0}
        pre.write_bundle(bt,br,{old.SITE:c.Dump(at).files[old.SITE]},at,report,output/'gateways'/folder)
        c.require((output/'gateways'/folder/'after'/old.SITE.lstrip('/')).read_bytes()==ar[old.SITE],'Exact transition bytes changed')
        descriptors[folder]=descriptor(output,folder,report)
        transitions[folder]={k:report[k] for k in ('fromState','toState','beforeDumpSha256','afterDumpSha256')}
    (output/'gateways.json').write_text(json.dumps(descriptors,indent=2)+'\n',encoding='utf-8')
    summary={**asset_report,'kind':'103-latest-static-live-four-cas','source':spec['commit'],'version':str(spec['buildVersion']),
             'baselineDumpSha256':c.sha(text.encode()),'staticRoot':spec['staticRoot'],'transitions':transitions,
             'candidateOrigin':spec.get('candidateOrigin','http://127.0.0.1:13100'),'gatewayDescriptor':'gateways.json',
             'normalRollbackTarget':'static-live fa9e','canonicalSessionReplaced':False,'sourceRealPaths':pre.REAL_PATHS,'liveConnections':0,'readyToDeploy':False,
             'protocolCompatibility':'NOT_VERIFIED','nginxValidation':'PREVIOUS_POLICY_MODULE_VERIFIED; new-byte syntax/root acceptance pending'}
    (output/'manifest.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    return summary


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();r=prepare(json.loads(Path(a.input).read_text()),a.output)
    print('LATEST103_GATEWAY=PREPARED FOUR_CAS=4 BASELINE=STATIC_FA9E IMAGE='+r['image']+' LEGACY_FALLBACKS=ABSENT LIVE_CONNECTIONS=0')
