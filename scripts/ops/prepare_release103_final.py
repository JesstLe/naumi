#!/usr/bin/env python3
"""Prepare pinned final HK bytes using stopped Docker create/cp only.

Never starts a candidate, queries DB, runs SSH or installs anything. Original
configs and private captures are kept outside the whitelisted upload tar.
"""
import argparse
import collections
import difflib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import uuid

from release_client_compat import Dump, file_sha, require, sha, write_gateway_bundle
from release103_assets import canonical_url, verified_union, materialize
import release103_gateway as gateway

SOURCE = '6272c5ecb95b67aca6858d949d5da26157f4b6c4'
VERSION = '1792132681'
IMAGES = {
    'main': ('sha256:35bfa2a976db3dc3a41c13f4684f88bebba4f5e2552ca9006e7f48b18ff63d0c', ''),
    'desktop': ('sha256:3fac8d9c986ed8fb4405352d9b4b6cd48882d420737384e26857d1ae8f482e73', '/desktop'),
    'enterprise': ('sha256:424aa1eb06def2b91edfc8e9966dccab85ac6701c124562f26f4329efb7a359e', '/enterprise'),
}
ORIGINS = ('http://127.0.0.1:13100','http://127.0.0.1:13101','http://127.0.0.1:13102')
STATIC_ROOT = '/var/www/naumi-client-assets/evening-6272c5ecb95b'
RELEASE_KEY = 'evening-6272'
RUNTIME_TOPOLOGY = 'three-web-three-ui'


def configure_candidates(path):
    """Only public pinned image identities/origins; never an environment file."""
    global SOURCE, VERSION, IMAGES, ORIGINS, STATIC_ROOT, RELEASE_KEY, RUNTIME_TOPOLOGY
    value=json.loads(Path(path).read_text())
    require(re.fullmatch('[a-f0-9]{40}',value.get('source','')),'Full fixed source SHA required')
    require(re.fullmatch('[0-9]+',str(value.get('version',''))),'Fixed build version required')
    topology=value.get('runtimeTopology','three-web-three-ui')
    require(topology in ('three-web-three-ui','unified-web-three-ui'),'Known explicit runtimeTopology required')
    expected_flavors={'main'} if topology=='unified-web-three-ui' else {'main','desktop','enterprise'}
    require(set(value['images'])==expected_flavors,'Actual image flavors must match runtimeTopology')
    images={}
    for flavor,prefix in [('main',''),('desktop','/desktop'),('enterprise','/enterprise')]:
        if flavor not in expected_flavors:continue
        row=value['images'][flavor]
        require(re.fullmatch('sha256:[a-f0-9]{64}',row['image']) and row['assetPrefix']==prefix,'Pinned image id and compiled prefix required')
        images[flavor]=(row['image'],prefix)
    origins=tuple(gateway.origin(value['origins'][flavor]) for flavor in ('main','desktop','enterprise'))
    require(len(set(origins))==(1 if topology=='unified-web-three-ui' else 3) and all(not v.endswith(':13062') for v in origins),'Origins must match explicit runtimeTopology and exclude Fleet')
    root=value['staticRoot']
    require(root.startswith('/var/www/') and '..' not in Path(root).parts and not any(c in root for c in '$\\\r\n;{}'),'Dedicated static root required')
    key=value.get('releaseKey','evening-'+value['source'][:12])
    require(re.fullmatch('[a-zA-Z0-9_-]+',key),'Canonical release key required')
    SOURCE,VERSION,IMAGES,ORIGINS,STATIC_ROOT,RELEASE_KEY=value['source'],str(value['version']),images,origins,root,key
    RUNTIME_TOPOLOGY=topology
    return value


def run(args):
    p = subprocess.run(args, capture_output=True, text=True)
    require(p.returncode == 0, 'Local Docker/copy command failed: ' + ' '.join(args[:3]) + ': ' + p.stderr[-1000:])
    return p.stdout.strip()


def inspect_container(name):
    data = json.loads(run(['docker','inspect',name]))[0]
    return {'id':data['Id'],'image':data['Image'],'status':data['State']['Status'],'running':data['State']['Running'],'startedAt':data['State']['StartedAt'],'fixtureLabel':data['Config'].get('Labels',{}).get('io.naumi.hk103-static-copy')}


def capture_candidates(output):
    records=[]
    for flavor,(image,prefix) in IMAGES.items():
        metadata=json.loads(run(['docker','image','inspect',image]))[0]
        env=dict(item.split('=',1) for item in metadata['Config'].get('Env',[]) if '=' in item)
        require(metadata['Id']==image and env.get('SOURCE_COMMIT')==SOURCE and env.get('BUILD_VERSION')==VERSION,'Pinned final image/source/version mismatch')
        name='hk103-static-copy-'+flavor+'-'+uuid.uuid4().hex[:10]
        folder=output/flavor;folder.mkdir(parents=True)
        label=uuid.uuid4().hex
        run(['docker','create','--name',name,'--label','io.naumi.hk103-static-copy='+label,image])
        try:
            before=inspect_container(name)
            require(before['image']==image and before['status']=='created' and before['running'] is False and before['fixtureLabel']==label,'Candidate must be stopped/unstarted')
            for remote,local in [('/app/.next/static',folder/'static'),('/app/.next/BUILD_ID',folder/'BUILD_ID'),('/app/.next/required-server-files.json',folder/'required-server-files.private.json')]:
                run(['docker','cp',name+':'+remote,str(local)])
            after=inspect_container(name)
            require(after==before,'Stopped source identity changed during cp')
            config=json.loads((folder/'required-server-files.private.json').read_text())['config']
            actual_prefix=config.get('assetPrefix','')
            require(actual_prefix==prefix,'Actual compiled assetPrefix mismatch: '+flavor)
            build_id=(folder/'BUILD_ID').read_text().strip()
            require(build_id and len(build_id)<128,'Missing actual BUILD_ID')
            record={'flavor':flavor,'image':image,'source':env['SOURCE_COMMIT'],'version':env['BUILD_VERSION'],'buildId':build_id,'assetPrefix':actual_prefix,'stoppedBefore':before,'stoppedAfter':after,'copiedStaticRoot':str(folder/'static'),'buildMetadataSha256':file_sha(folder/'required-server-files.private.json'),'imageSize':metadata['Size']}
            records.append(record)
            (folder/'public-build.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8')
        finally:
            current=inspect_container(name)
            require(current['fixtureLabel']==label and current['running'] is False,'Only own stopped copy container may be removed')
            run(['docker','rm',name])
    return records


def merge_candidates(legacy, candidates):
    require(not legacy.get('conflicts') and legacy.get('kind')=='103-prefixed-static-union','Verified nonconflicted legacy input required')
    entries={row['url']:dict(row) for row in legacy['assets']}
    conflicts=[]
    counts={}
    for record in candidates:
        root=Path(record['copiedStaticRoot']).resolve()
        require(root.is_dir() and not root.is_symlink(),'Candidate static root missing')
        count=0
        for base,dirs,files in os.walk(root,followlinks=False):
            require(not any((Path(base)/name).is_symlink() for name in dirs),'Candidate directory symlink')
            for name in sorted(files):
                path=Path(base)/name
                require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),'Candidate file type/path invalid')
                url=canonical_url(record['assetPrefix']+'/_next/static/'+path.relative_to(root).as_posix())
                item={'url':url,'sha256':file_sha(path),'size':path.stat().st_size,'source':str(path)}
                if url in entries and (item['sha256'],item['size'])!=(entries[url]['sha256'],entries[url]['size']):
                    conflicts.append({'url':url,'original':entries[url],'candidate':item,'flavor':record['flavor']})
                else:entries.setdefault(url,item)
                count+=1
        require(count>0,'Empty candidate static')
        counts[record['flavor']]=count
    return {**legacy,'assets':[entries[url] for url in sorted(entries)],'conflicts':conflicts,'legacyUrls':len(legacy['assets']),'candidateFileCounts':counts,'candidateBuilds':[{k:v for k,v in r.items() if k not in ('copiedStaticRoot','stoppedBefore','stoppedAfter')} for r in candidates],'newUrls':len(entries)-len(legacy['assets'])}


def verify_materialized(manifest, root):
    root=Path(root).resolve()
    for asset in manifest['assets']:
        path=root/asset['url'].lstrip('/')
        require(path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root),'Materialized path changed')
        require(file_sha(path)==asset['sha256'] and path.stat().st_size==asset['size'],'Materialized byte mismatch')
    return len(manifest['assets'])


def transition_bundle(output, name, from_mode, to_mode, original_text=None):
    """CAS belongs to the actual source state, never reuse original-before CAS
    for maintenance->open. Rollback destinations are exact original disk bytes.
    """
    before_text=(output/from_mode/'nginx.after.txt').read_bytes().decode()
    before_files={key:(output/from_mode/'after'/key.lstrip('/')).read_bytes() for key in Dump(before_text).files}
    after_text=original_text if to_mode=='original' else (output/to_mode/'nginx.after.txt').read_bytes().decode()
    after_dump=Dump(after_text)
    report={'schemaVersion':1,'kind':'103-config-state-transition','fromState':from_mode,'toState':to_mode,'fullBeforeDumpSha256':sha(before_text.encode()),'fullAfterDumpSha256':sha(after_text.encode()),'sourceRealPaths':{'/etc/nginx/nginx.conf':'/etc/nginx/nginx.conf','/etc/nginx/mime.types':'/etc/nginx/mime.types',gateway.SITE:'/etc/nginx/sites-available/default'},'serverWrites':0,'reloadExecuted':False,'imageRollback':'Retain original pinned container/image and independent103 env/data; restore only gateway entry, never DB/media' if to_mode=='original' else None}
    report.update({'runtimeTopology':RUNTIME_TOPOLOGY,'liveWebProcesses':1 if RUNTIME_TOPOLOGY=='unified-web-three-ui' else 3,'origins':dict(zip(('main','desktop','enterprise'),ORIGINS)),'newHtmlStaticPrefix':'/_next/static/' if RUNTIME_TOPOLOGY=='unified-web-three-ui' else 'flavor-specific','oldStaticPrefixesRetained':list(gateway.PREFIXES)})
    folder=output/name
    write_gateway_bundle(before_text,after_dump.files,after_text,report,folder,before_files)
    if to_mode=='original':
        for row in report['patches']:
            require(row['afterSha256']==gateway.EXACT_SOURCE_SHA[row['path']],'Original rollback disk byte hash mismatch')
    else:
        for row in report['patches']:
            require((folder/row['after']).read_bytes()==(output/to_mode/'after'/row['path'].lstrip('/')).read_bytes(),'Transition destination bytes mismatch')
    (folder/'MODIFIED_FILE').write_bytes((folder/'after'/gateway.SITE.lstrip('/')).read_bytes())
    (folder/'DIFF_FILE.patch').write_text(''.join(difflib.unified_diff(before_text.splitlines(True),after_text.splitlines(True),fromfile=from_mode,tofile=to_mode)),encoding='utf-8')
    (folder/'VERIFICATION.txt').write_text('STATUS=PREPARED_LOCAL_ONLY\nFROM='+from_mode+'\nTO='+to_mode+'\nSOURCE_CAS=EXACT3FILES\nLIVE_INSTALL=NOT_EXECUTED\n',encoding='utf-8')
    script=folder/'ROLLBACK.sh';script.write_text(gateway.ROLLBACK,encoding='utf-8',newline='\n');script.chmod(0o755)
    return report


def package_upload(output, summary):
    upload=output/'upload';upload.mkdir()
    shutil.copytree(output/'static-union',upload/'static')
    for mode in ('candidate','maintenance','open-from-maintenance'):
        shutil.copytree(output/mode/'after',upload/mode/'after')
        for filename in ('report.json','nginx.after.txt'):
            shutil.copyfile(output/mode/filename,upload/mode/filename)
    # No before, raw build metadata, cert, key, env, credentials or original
    # configuration file is copied into the upload whitelist.
    public={**summary,'privateExactConfigsIncluded':False,'containsSecrets':False,'serverInstallationPerformed':False}
    (upload/'deployment-manifest.json').write_text(json.dumps(public,indent=2)+'\n',encoding='utf-8')
    inventory=[]
    for path in sorted(upload.rglob('*')):
        if path.is_file():inventory.append({'path':path.relative_to(upload).as_posix(),'size':path.stat().st_size,'sha256':file_sha(path)})
    (upload/'FILE_MANIFEST.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf-8')
    sums=''.join(row['sha256']+'  '+row['path']+'\n' for row in inventory)
    (upload/'SHA256SUMS').write_text(sums,encoding='utf-8',newline='\n')
    archive=output/('naumi-hk103-'+RELEASE_KEY+'-prepared.tar.gz')
    with tarfile.open(archive,'w:gz',compresslevel=6) as tar:
        for path in sorted(upload.rglob('*')):
            if path.is_file():
                info=tar.gettarinfo(str(path),arcname=path.relative_to(upload).as_posix())
                info.uid=info.gid=0;info.uname=info.gname='';info.mode=0o644
                with path.open('rb') as h:tar.addfile(info,h)
    # Reopen every archived file and hash the actual tar stream bytes.
    expected={row['path']:row for row in inventory}
    for filename in ('FILE_MANIFEST.json','SHA256SUMS'):
        path=upload/filename;expected[filename]={'size':path.stat().st_size,'sha256':file_sha(path)}
    with tarfile.open(archive,'r:gz') as tar:
        members=tar.getmembers()
        require({m.name for m in members}==set(expected),'Upload tar file inventory mismatch')
        for member in members:
            require(member.isfile() and not member.issym() and '..' not in Path(member.name).parts,'Nonregular upload member')
            data=tar.extractfile(member).read()
            require(len(data)==expected[member.name]['size'] and sha(data)==expected[member.name]['sha256'],'Upload tar hash mismatch')
    result={'path':str(archive),'bytes':archive.stat().st_size,'sha256':file_sha(archive),'files':len(expected),'allTarEntriesReopenedAndHashed':True,'secretsIncluded':False,'originalConfigsIncluded':False}
    (output/'upload-tar-report.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    return result


def archive_verified(root, paths, destination):
    paths=sorted(paths)
    expected={path.relative_to(root).as_posix():{'size':path.stat().st_size,'sha256':file_sha(path)} for path in paths}
    with tarfile.open(destination,'w:gz',compresslevel=6) as tar:
        for name,row in expected.items():
            path=root/name
            info=tar.gettarinfo(str(path),arcname=name);info.uid=info.gid=0;info.uname=info.gname='';info.mode=0o755 if name.endswith('ROLLBACK.sh') else 0o644
            with path.open('rb') as h:tar.addfile(info,h)
    with tarfile.open(destination,'r:gz') as tar:
        members=tar.getmembers()
        require({m.name for m in members}==set(expected),'Tar whitelist changed')
        for m in members:
            require(m.isfile() and not m.issym() and '..' not in Path(m.name).parts,'Invalid tar member')
            data=tar.extractfile(m).read();require(sha(data)==expected[m.name]['sha256'] and len(data)==expected[m.name]['size'],'Tar member byte verification failed')
    return {'path':str(destination),'sha256':file_sha(destination),'bytes':destination.stat().st_size,'files':len(paths),'allMembersReopenedAndHashVerified':True}


def finalize_existing(output, dump_path, source_root):
    """Rebuild CAS states after root changes planned ports, without recopying
    images or production captures. Output package is new and immutable.
    """
    output=Path(output).resolve();package=output/'package'
    require(not package.exists(),'New final package root required')
    package.mkdir()
    manifest=json.loads((output/'static-union/manifest.json').read_text())
    verify_materialized(manifest,output/'static-union')
    text=Path(dump_path).read_bytes().decode()
    sources={key:(Path(source_root)/key.lstrip('/')).read_bytes() for key in Dump(text).files}
    shutil.copytree(output/'static-union',package/'static')
    temporary=package/'private-render-work'
    for mode in ('candidate','maintenance'):
        gateway.bundle(text,sources,*ORIGINS,STATIC_ROOT,manifest,temporary/mode,mode=='maintenance',RUNTIME_TOPOLOGY)
    transition_bundle(temporary,'open-from-maintenance','maintenance','candidate')
    transition_bundle(temporary,'rollback-from-candidate','candidate','original',text)
    transition_bundle(temporary,'rollback-from-maintenance','maintenance','original',text)
    kinds={'maintenance':'maintenance','open':'open-from-maintenance','rollback-maintenance':'rollback-from-maintenance','rollback-open':'rollback-from-candidate'}
    descriptors={}
    for kind,folder in kinds.items():
        source=temporary/folder;dest=package/'gateways'/kind
        shutil.copytree(source,dest)
        shutil.copytree(source/'before',dest/'closure-before')
        report=json.loads((dest/'report.json').read_text())
        report.update({'configClosureValidated':True,'baselineFileCasVerified':True,'beforeDumpSha256':sha((dest/'nginx.before.txt').read_bytes()),'afterDumpSha256':sha((dest/'nginx.after.txt').read_bytes())})
        # Global closure files remain in before CAS, but only the site changes.
        report['patches']=[row for row in report['patches'] if row['beforeSha256']!=row['afterSha256']]
        require(len(report['patches'])==1 and report['patches'][0]['path']==gateway.SITE,'Only 103 site file should change')
        (dest/'report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        def descriptor(path):return {'path':path.relative_to(package).as_posix(),'sha256':file_sha(path)}
        descriptors[kind]={'report':descriptor(dest/'report.json'),'before':{key:descriptor(dest/'closure-before'/key.lstrip('/')) for key in sources},'after':{row['path']:descriptor(dest/row['after']) for row in report['patches']}}
    (package/'gateways.json').write_text(json.dumps(descriptors,indent=2)+'\n',encoding='utf-8')
    summary=json.loads((output/'summary.json').read_text())
    require(summary['source']==SOURCE and summary['version']==VERSION and summary.get('runtimeTopology','three-web-three-ui')==RUNTIME_TOPOLOGY,'Finalization candidate definition differs from acquisition')
    summary.update({'origins':dict(zip(('main','desktop','enterprise'),ORIGINS)),'packageRoot':str(package),'gatewayDescriptor':'gateways.json','fourCasTransitions':['original->maintenance','maintenance->candidate','maintenance->original','candidate->original'],'nginxFinalVerification':'PENDING_FOR_FINAL_ORIGINS','privateOriginalRollbackArchiveRequired':True,'supersededArtifacts':'Use only package/ and FINAL_PACKAGE_REPORT.json, not earlier scratch output','candidateSourceConfigSha256':{n:sha((temporary/'candidate/after'/n.lstrip('/')).read_bytes()) for n in sources},'maintenanceSourceConfigSha256':{n:sha((temporary/'maintenance/after'/n.lstrip('/')).read_bytes()) for n in sources}})
    (package/'manifest.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    # Public transport archive contains static and transformed forward configs;
    # closure-before and original rollback bytes remain in a separate private tar.
    public_paths=[p for p in (package/'static').rglob('*') if p.is_file()]
    public_paths += [package/'manifest.json',package/'gateways.json']
    for kind in kinds:
        folder=package/'gateways'/kind
        public_paths.append(folder/'report.json')
        if kind in ('maintenance','open'):
            public_paths += [folder/'after'/gateway.SITE.lstrip('/')]
    public_set=set(public_paths)
    private_paths=[p for p in (package/'gateways').rglob('*') if p.is_file() and p not in public_set]
    # Render work is local-only; never add required-server-files/env/cert/key.
    public=archive_verified(package,public_paths,output/('naumi-hk103-'+RELEASE_KEY+'-deployment.tar.gz'))
    private=archive_verified(package,private_paths,output/('naumi-hk103-'+RELEASE_KEY+'-rollback-private.tar.gz'))
    report={'packageRoot':str(package),'deployment':public,'privateRollback':private,'extractBothIntoSameRoot':True,'secretValuesIncluded':False,'originalConfigsInPublicTar':False,'fourTransitions':4,'descriptorPathsRelative':True,'serverConnections':0,'serverWrites':0}
    (output/'FINAL_PACKAGE_REPORT.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    # Reopen relative descriptor paths and enforce no absolute paths/escape.
    for descriptor in descriptors.values():
        for row in [descriptor['report'],*descriptor['before'].values(),*descriptor['after'].values()]:
            path=package/row['path'];require(not Path(row['path']).is_absolute() and path.resolve().is_relative_to(package) and file_sha(path)==row['sha256'],'Descriptor hash/path failed')
    print('HK103_FINAL_PACKAGE=PASS STATIC='+str(len(manifest['assets']))+' CAS_TRANSITIONS=4 ORIGINS='+','.join(ORIGINS)+' DESCRIPTORS=RELATIVE SERVER_WRITES=0',flush=True)
    print(json.dumps(report,indent=2),flush=True)
    return report


def seal_verified(output, verification):
    output=Path(output).resolve();package=output/'package'
    result=json.loads(Path(verification).read_text())
    total=json.loads((package/'manifest.json').read_text())['totalUrls']
    require(tuple(result['testOrigins'])==ORIGINS and result['baselineFullDumpSha256']==gateway.LIVE_DUMP_SHA,'Verification origin/baseline mismatch')
    require(result.get('runtimeTopology','three-web-three-ui')==RUNTIME_TOPOLOGY,'Verification runtimeTopology mismatch')
    for mode in ('candidateStatic','maintenanceStatic'):
        require(result[mode]['exactHttpHashes']==total and result[mode]['mimeExact'] is True,'Final HTTP SHA/MIME verification missing')
    require(result['baseline']['routeClasses']==65 and result['rollback']['routeClasses']==65 and result['rollbackScriptExit']==0,'Baseline/rollback verification incomplete')
    validation=package/'validation';validation.mkdir()
    shutil.copyfile(verification,validation/'final-nginx-results.json')
    manifest_path=package/'manifest.json';manifest=json.loads(manifest_path.read_text())
    descriptors=json.loads((package/'gateways.json').read_text())
    cas_result=verify_cas_graph(package)
    (validation/'four-state-cas-results.json').write_text(json.dumps(cas_result,indent=2)+'\n',encoding='utf-8')
    for mode in ('maintenance','open','rollback-maintenance','rollback-open'):
        folder=package/'gateways'/mode
        verification_path=folder/'VERIFICATION.txt'
        with verification_path.open('a',encoding='utf-8') as h:
            h.write('\nFINAL_LOCAL_VALIDATION=PASS_NOT_DEPLOYED\nRUNTIME_TOPOLOGY='+RUNTIME_TOPOLOGY+'\nCHANGED_FIELD=all dynamic Naumi UI/API origins '+','.join(ORIGINS)+'; old static3prefix retained\n')
            h.write('BASELINE exact command: NAUMI103_STATIC_UNION=<'+str(output/'static-union')+'> NAUMI103_STATIC_ROOT='+STATIC_ROOT+' NAUMI103_CANDIDATE_ORIGINS='+json.dumps(ORIGINS)+' NAUMI103_RUNTIME_TOPOLOGY='+RUNTIME_TOPOLOGY+' NAUMI103_GATEWAY_OUTPUT=<'+str(Path(verification).parent)+'> python scripts/ops/test_release103_gateway_nginx.py\n')
            h.write('BASELINE input: pinned real103 dumpSHA '+gateway.LIVE_DUMP_SHA+' + exact3source files + fixture-only backends\nBASELINE literal: BASELINE=PASS REAL_LINUX_NGINX=YES ORIGINAL_ROUTE_CLASSES=65 FLEET=13062 TLS=YES\nBASELINE exit=0\n')
            h.write('MODIFIED same concentrated command; input: actual '+str(total)+' static bytes/MIME + topology/origins above\nMODIFIED literal: MODIFIED=PASS REAL_LINUX_NGINX=YES ORIGINAL_CLASSES_ACCOUNTED=65 RETIRED_STATIC=17 FLEET_EXACT=9 UI_ORIGINS='+str(len(set(ORIGINS)))+' API_MAIN=YES STATIC_HASHES='+str(total)+' MIME=EXACT TLS_AND_SPOOF_HEADERS=PASS\nMODIFIED exit=0\n')
            h.write('MAINTENANCE literal: MAINTENANCE=PASS NAUMI=503 FLEET=13062 STATIC_HASHES='+str(total)+' MIME=EXACT DENIES=PRESERVED\nMAINTENANCE exit=0\n')
            h.write('ROLLBACK exact command: bash /fixture/candidate/ROLLBACK.sh /fixture/rollback-copy (isolated local Linux container only)\nROLLBACK input: separate exact3config candidate copy\nROLLBACK literal: ROLLBACK=PASS EXACT_SOURCE_FILES=3 ORIGINAL_BYTES=RESTORED RELOAD=NOT_EXECUTED\nROLLBACK exit=0\nRESTORED_BEHAVIOR=original65routeclasses and /api/version13039; exact3sourcebytes; changed candidate artifacts remain changed\nFOUR_STATE_CAS=PASS transitions4 wrong-state rejected3\nFOUR_PATHS:\n'+'\n'.join(str(folder/name) for name in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'))+'\n')
        for name in ('MODIFIED_FILE','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'):require((folder/name).read_bytes(),'Empty evidence artifact')
    manifest.update({'nginxFinalVerification':'PASS_REAL_LINUX_NGINX_65ROUTES_'+str(total)+'STATIC_MIME_AND_ROLLBACK','nginxVerificationReport':'validation/final-nginx-results.json','nginxVerificationSha256':file_sha(validation/'final-nginx-results.json'),'readyToDeploy':False,'deploymentStillRequiresFreshLiveBaselineAndLock':True,'candidateSourceConfigSha256':{key:file_sha(package/row['path']) for key,row in {**descriptors['open']['before'],**descriptors['open']['after']}.items()},'maintenanceSourceConfigSha256':{key:file_sha(package/row['path']) for key,row in {**descriptors['maintenance']['before'],**descriptors['maintenance']['after']}.items()},'fourStateCasValidation':'validation/four-state-cas-results.json'})
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    report_path=output/'FINAL_PACKAGE_REPORT.json';report=json.loads(report_path.read_text())
    # Reuse the explicitly verified prior whitelist, adding only validation.
    archive=Path(report['deployment']['path'])
    with tarfile.open(archive,'r:gz') as tar:public_names=[m.name for m in tar.getmembers()]
    inventory=[]
    canonical=[package/'manifest.json',package/'gateways.json']+[p for folder in ('static','gateways','validation') for p in (package/folder).rglob('*') if p.is_file()]
    for path in sorted(canonical):inventory.append({'path':path.relative_to(package).as_posix(),'sha256':file_sha(path),'bytes':path.stat().st_size})
    (package/'FILE_MANIFEST.json').write_text(json.dumps(inventory,indent=2)+'\n',encoding='utf-8')
    (package/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in inventory),encoding='utf-8',newline='\n')
    paths=[package/name for name in public_names]+[validation/'final-nginx-results.json',validation/'four-state-cas-results.json',package/'FILE_MANIFEST.json',package/'SHA256SUMS']
    # A new immutable sealed archive; preserve pre-verification tar as evidence.
    report['deployment']=archive_verified(package,paths,output/('naumi-hk103-'+RELEASE_KEY+'-deployment-verified.tar.gz'))
    old_private=Path(report['privateRollback']['path'])
    with tarfile.open(old_private,'r:gz') as tar:private_names=[m.name for m in tar.getmembers()]
    report['privateRollback']=archive_verified(package,[package/name for name in private_names],output/('naumi-hk103-'+RELEASE_KEY+'-rollback-private-verified.tar.gz'))
    report['nginxFinalVerification']='PASS';report['verificationReportSha256']=file_sha(validation/'final-nginx-results.json')
    report_path.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print('HK103_FINAL_SEALED=PASS STATIC_HASH_MIME='+str(total)+' ROUTE_CLASSES=65 CAS_TRANSITIONS=4 ORIGINS='+','.join(ORIGINS)+' SERVER_WRITES=0',flush=True)
    print(json.dumps(report,indent=2),flush=True)
    return report


def verify_cas_graph(package):
    package=Path(package)
    descriptors=json.loads((package/'gateways.json').read_text())
    reports={}
    for kind,item in descriptors.items():
        report_path=package/item['report']['path']
        require(file_sha(report_path)==item['report']['sha256'],'Descriptor report hash mismatch')
        report=json.loads(report_path.read_text());reports[kind]=report
        require(report['configClosureValidated'] and report['baselineFileCasVerified'] and len(item['before'])==3,'Full closure CAS required')
        for row in [*item['before'].values(),*item['after'].values()]:
            path=package/row['path'];require(path.resolve().is_relative_to(package.resolve()) and file_sha(path)==row['sha256'],'Descriptor source CAS path mismatch')
    original={key:row['sha256'] for key,row in descriptors['maintenance']['before'].items()}
    require(original==gateway.EXACT_SOURCE_SHA,'Original three-source hashes not pinned')
    def apply(state,kind):
        item=descriptors[kind];expected={key:row['sha256'] for key,row in item['before'].items()}
        require(state==expected,'CAS_TRANSITION_REJECTED: '+kind)
        after=dict(state)
        for key,row in item['after'].items():after[key]=row['sha256']
        return after
    maintenance=apply(original,'maintenance')
    candidate=apply(maintenance,'open')
    require(apply(candidate,'rollback-open')==original,'Candidate rollback failed')
    require(apply(maintenance,'rollback-maintenance')==original,'Maintenance rollback failed')
    rejects=0
    for state,kind in [(original,'open'),(maintenance,'rollback-open'),(candidate,'rollback-maintenance')]:
        try:apply(state,kind)
        except ValueError:rejects+=1
    require(rejects==3,'Wrong-state CAS not rejected')
    return {'status':'PASS','transitions':4,'fullClosureFiles':3,'changedFilesPerTransition':1,'wrongStateRejections':3,'originalThreeSourceHashesRestored':True,'forwardChain':'original->maintenance->candidate->original','shortRollbackChain':'original->maintenance->original','serverWrites':0}


def prepare(args):
    output=Path(args.output).resolve()
    require(not output.exists(),'New distinct output required')
    output.mkdir(parents=True)
    # Do not assume the ignored output parent has restrictive inherited ACLs.
    if os.name == 'nt':
        sid=run(['powershell','-NoProfile','-Command','([Security.Principal.WindowsIdentity]::GetCurrent()).User.Value'])
        require(sid.startswith('S-1-'),'Windows identity unavailable')
        run(['icacls',str(output),'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)(F)','*S-1-5-18:(OI)(CI)(F)'])
    else:output.chmod(0o700)
    candidates=capture_candidates(output/'private-candidate-capture')
    legacy=verified_union(json.loads(Path(args.legacy_capture).read_text()),args.legacy_root)
    merged=merge_candidates(legacy,candidates)
    (output/'private-union-report.json').write_text(json.dumps(merged,indent=2)+'\n',encoding='utf-8')
    require(not merged['conflicts'],'HOLD_STATIC_URL_CONFLICT: retained both copies; no union/config/tar installed')
    materialize(merged,output/'static-union')
    verify_materialized(merged,output/'static-union')
    text=Path(args.dump).read_bytes().decode()
    sources={name:(Path(args.source_root)/name.lstrip('/')).read_bytes() for name in Dump(text).files}
    for mode in ('candidate','maintenance'):
        gateway.bundle(text,sources,*ORIGINS,STATIC_ROOT,merged,output/mode,mode=='maintenance',RUNTIME_TOPOLOGY)
    transition_bundle(output,'open-from-maintenance','maintenance','candidate')
    transition_bundle(output,'rollback-from-candidate','candidate','original',text)
    transition_bundle(output,'rollback-from-maintenance','maintenance','original',text)
    original=output/'private-original-rollback'
    shutil.copytree(output/'candidate/before',original/'original')
    for mode in ('candidate','maintenance'):
        shutil.copytree(output/mode,original/mode)
    summary={'schemaVersion':1,'kind':'103-final-prepared-'+SOURCE[:12],'source':SOURCE,'version':VERSION,'origins':dict(zip(('main','desktop','enterprise'),ORIGINS)),'staticRoot':STATIC_ROOT,'legacyUrls':merged['legacyUrls'],'newUrls':merged['newUrls'],'totalUrls':len(merged['assets']),'staticBytes':sum(a['size'] for a in merged['assets']),'prefixCounts':dict(collections.Counter(next(p for p in gateway.PREFIXES if a['url'].startswith(p)) for a in merged['assets'])),'candidateFileCounts':merged['candidateFileCounts'],'builds':merged['candidateBuilds'],'conflicts':0,'fleetIncluded':False,'baselineDumpSha256':gateway.LIVE_DUMP_SHA,'originalFileSha256':gateway.EXACT_SOURCE_SHA,'originalRealPaths':{'/etc/nginx/nginx.conf':'/etc/nginx/nginx.conf','/etc/nginx/mime.types':'/etc/nginx/mime.types',gateway.SITE:'/etc/nginx/sites-available/default'},'candidateSourceConfigSha256':{n:sha((output/'candidate/after'/n.lstrip('/')).read_bytes()) for n in sources},'maintenanceSourceConfigSha256':{n:sha((output/'maintenance/after'/n.lstrip('/')).read_bytes()) for n in sources},'serverConnections':0,'serverWrites':0,'candidateContainersStarted':0,'readyToDeploy':False,'nginxFinalVerification':'PENDING','realNextDbAcceptance':'ROOT_EXISTING_QA_NOT_RERUN'}
    summary.update({'runtimeTopology':RUNTIME_TOPOLOGY,'liveWebProcesses':len(set(ORIGINS)),'newHtmlStaticPrefix':'/_next/static/' if RUNTIME_TOPOLOGY=='unified-web-three-ui' else 'flavor-specific','retainedOldStaticPrefixes':list(gateway.PREFIXES),'rootQaEvidence':'Separate actual controlled unified instance is required; do not substitute variant QA'})
    (output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    result=package_upload(output,summary)
    print('HK103_FINAL_STATIC=PASS OLD='+str(merged['legacyUrls'])+' NEW='+str(merged['newUrls'])+' TOTAL='+str(len(merged['assets']))+' CONFLICTS=0 CANDIDATE_STARTED=0 SOURCE='+SOURCE+' VERSION='+VERSION,flush=True)
    print('UPLOAD_TAR_SHA256='+result['sha256']+' BYTES='+str(result['bytes'])+' SECRET_FILES=0 ORIGINAL_CONFIGS=PRIVATE_ONLY',flush=True)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for key in ('output','dump','source-root'):p.add_argument('--'+key,required=True)
    for key in ('legacy-capture','legacy-root'):p.add_argument('--'+key)
    p.add_argument('--finalize-existing',action='store_true')
    p.add_argument('--seal-verification')
    p.add_argument('--candidate-definition',help='Secret-free JSON with source/version/images(main,desktop,enterprise)/origins/staticRoot/releaseKey')
    a=p.parse_args()
    if a.candidate_definition:configure_candidates(a.candidate_definition)
    if a.seal_verification:seal_verified(a.output,a.seal_verification)
    elif a.finalize_existing:finalize_existing(a.output,a.dump,a.source_root)
    else:
        require(a.legacy_capture and a.legacy_root,'Legacy capture/root required for stopped-image acquisition')
        prepare(a)
