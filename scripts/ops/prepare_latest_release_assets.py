#!/usr/bin/env python3
"""Capture fixed stopped local image static bytes and extend a verified old union.

Never starts the candidate, connects remotely, or replaces an existing output.
One input JSON binds image ID, source/build, previous union and target namespace.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import uuid

import release_client_compat as c
import release103_assets as hk


def run(argv):
    p=subprocess.run(argv,capture_output=True)
    c.require(p.returncode==0,'Local image capture command failed: '+p.stderr.decode(errors='replace')[-1000:])
    return p.stdout


def prepare(spec,output):
    output=Path(output)
    c.require(not output.exists(),'New distinct asset output required')
    c.require(spec['target'] in ('47.105.59.142','103.30.76.93'),'Explicit target required')
    c.require(re.fullmatch('sha256:[a-f0-9]{64}',spec['image']) and re.fullmatch('[a-f0-9]{40}',spec['commit']) and str(spec['buildVersion']).isdecimal(),'Fixed image/source/build required')
    image=json.loads(run(['docker','image','inspect',spec['image']]))[0]
    c.require(image['Id']==spec['image'],'Fixed image identity mismatch')
    env=dict(v.split('=',1) for v in image['Config']['Env'] if '=' in v)
    c.require(env.get('SOURCE_COMMIT')==spec['commit'] and env.get('BUILD_VERSION')==str(spec['buildVersion']),'Image/source/build mismatch')
    previous=Path(spec['previousUnion']).resolve()
    manifest=json.loads((previous/'manifest.json').read_text())
    expected_kind='103-prefixed-static-union' if spec['target']=='103.30.76.93' else 'next-static-union'
    c.require(manifest['kind']==expected_kind and not manifest.get('conflicts'),'Reviewed previous union kind/conflicts mismatch')
    output.mkdir(parents=True)
    capture=output/'candidate-capture';capture.mkdir()
    static=capture/'static';static.mkdir()
    name='latest-assets-'+uuid.uuid4().hex[:12]
    run(['docker','create','--name',name,'--label','io.naumi.latest-static-capture=1','--network','none',spec['image']])
    try:
        run(['docker','cp',name+':/app/.next/static/.',str(static)])
        run(['docker','cp',name+':/app/.next/BUILD_ID',str(capture/'BUILD_ID')])
        # Copy private config only into ignored capture; public report exposes
        # solely the reviewed build identity/prefix, never arbitrary env values.
        run(['docker','cp',name+':/app/.next/required-server-files.json',str(capture/'required-server-files.private.json')])
        required=json.loads((capture/'required-server-files.private.json').read_text())
        c.require((required['config'].get('assetPrefix') or '')=='','Unified current image must compile empty assetPrefix')
    finally:
        row=json.loads(run(['docker','inspect',name]))[0]
        c.require(row['Config']['Labels'].get('io.naumi.latest-static-capture')=='1' and not row['State']['Running'],'Owned stopped capture identity changed')
        run(['docker','rm','-v',name])
    entries={}
    def add(url,p,label):
        (hk.canonical_url if spec['target']=='103.30.76.93' else c.public_url)(url)
        c.require(p.is_file() and not p.is_symlink() and p.resolve().is_relative_to((previous if label=='previous-union' else static).resolve()),'Redirected static source')
        item={'url':url,'sha256':c.file_sha(p),'size':p.stat().st_size,'source':str(p.resolve())}
        if url in entries:
            c.require((entries[url]['sha256'],entries[url]['size'])==(item['sha256'],item['size']),'STATIC_URL_CONFLICT: '+url)
        else:entries[url]=item
    for item in manifest['assets']:
        p=previous/item['url'].lstrip('/')
        add(item['url'],p,'previous-union')
        c.require((entries[item['url']]['sha256'],entries[item['url']]['size'])==(item['sha256'],item['size']),'Previous union changed: '+item['url'])
    old_count=len(entries)
    c.require(not any(p.is_symlink() for p in static.rglob('*')),'Symlink in candidate static capture')
    count=0
    for p in sorted(static.rglob('*')):
        if p.is_file():add('/_next/static/'+p.relative_to(static).as_posix(),p,'candidate');count+=1
    c.require(count>0,'Empty candidate image static')
    union={'schemaVersion':1,'kind':expected_kind,'assets':[entries[u] for u in sorted(entries)],'conflicts':[],
           'fleetIncluded':False,'protocolCompatibility':'NOT_VERIFIED','candidateImage':spec['image'],
           'candidateCommit':spec['commit'],'candidateBuildVersion':str(spec['buildVersion'])}
    materialized=output/'static-union'
    if spec['target']=='103.30.76.93':hk.materialize(union,materialized)
    else:c.materialize_assets(union,materialized)
    # Remove private local paths from all public static manifests for both hosts.
    public={**union,'assets':[{k:v for k,v in item.items() if k!='source'} for item in union['assets']]}
    (materialized/'manifest.json').write_text(json.dumps(public,indent=2)+'\n',encoding='utf-8')
    for item in public['assets']:
        p=materialized/item['url'].lstrip('/')
        c.require(p.stat().st_size==item['size'] and c.file_sha(p)==item['sha256'],'Materialized union changed')
    summary={'schemaVersion':1,'target':spec['target'],'image':spec['image'],'commit':spec['commit'],'buildVersion':str(spec['buildVersion']),
             'buildId':(capture/'BUILD_ID').read_text().strip(),'assetPrefix':'','previousAssets':old_count,'candidateStaticFiles':count,
             'newUrls':len(entries)-old_count,'totalUrls':len(entries),'staticBytes':sum(i['size'] for i in entries.values()),
             'prefixCounts':{p:sum(i['url'].startswith(p) for i in entries.values()) for p in (hk.PREFIXES if spec['target']=='103.30.76.93' else ('/_next/static/',))},
             'previousManifestSha256':c.file_sha(previous/'manifest.json'),'manifestSha256':c.file_sha(materialized/'manifest.json'),
             'allFilesReopenedAndHashVerified':True,'liveConnections':0,'candidateStarted':False}
    (output/'ASSET_REPORT.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    return summary


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();r=prepare(json.loads(Path(a.input).read_text()),a.output)
    print('LATEST_ASSETS=PASS TARGET='+r['target']+' PREVIOUS='+str(r['previousAssets'])+' NEW_URLS='+str(r['newUrls'])+' TOTAL='+str(r['totalUrls'])+' SOURCE='+r['commit']+' IMAGE_STARTED=NO LIVE_CONNECTIONS=0')
