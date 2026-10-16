#!/usr/bin/env python3
"""Rebase reviewed final four transitions onto static preflight; offline only."""
import argparse
import io
import json
from pathlib import Path
import shutil
import tarfile

import release103_static_preflight as pre
import release103_gateway as hk
from release_client_compat import Dump, require, sha


def descriptor(package, folder, report):
    root=package/'gateways'/folder
    def item(path):return {'path':path.relative_to(package).as_posix(),'sha256':sha(path.read_bytes())}
    return {'report':item(root/'report.json'),
            'before':{name:item(root/'closure-before'/name.lstrip('/')) for name in Dump((root/'nginx.before.txt').read_bytes().decode()).files},
            'after':{p['path']:item(root/p['after']) for p in report['patches']}}


def rebase(old_package, static_package, output):
    old_package,static_package,output=map(Path,(old_package,static_package,output))
    require(not output.exists(),'New distinct rebased package required')
    old_descriptors=json.loads((old_package/'gateways.json').read_text())
    for row in old_descriptors.values():
        for item in [row['report'],*row['before'].values(),*row['after'].values()]:
            require(sha((old_package/item['path']).read_bytes())==item['sha256'],'Reviewed source package CAS changed')
    static_dir=static_package/'gateways/static-preflight'
    static_text=(static_dir/'nginx.after.txt').read_bytes().decode()
    static_report=json.loads((static_dir/'report.json').read_text())
    require(sha(static_text.encode())==static_report['afterDumpSha256'],'Static dump CAS changed')
    sources={name:(static_dir/'closure-before'/name.lstrip('/')).read_bytes() for name in Dump(static_text).files}
    sources[hk.SITE]=(static_dir/'after'/hk.SITE.lstrip('/')).read_bytes()
    candidate_text=(old_package/'gateways/open/nginx.after.txt').read_bytes().decode()
    maintenance_text=(old_package/'gateways/maintenance/nginx.after.txt').read_bytes().decode()
    candidate_sources={**sources,hk.SITE:(old_package/'gateways/open/after'/hk.SITE.lstrip('/')).read_bytes()}
    maintenance_sources={**sources,hk.SITE:(old_package/'gateways/maintenance/after'/hk.SITE.lstrip('/')).read_bytes()}
    states={'static':(static_text,sources),'maintenance':(maintenance_text,maintenance_sources),'candidate':(candidate_text,candidate_sources)}
    output.mkdir(parents=True)
    shutil.copytree(old_package/'static',output/'static')
    descriptors={}
    for folder,before,after in [('maintenance','static','maintenance'),('open','maintenance','candidate'),('rollback-maintenance','maintenance','static'),('rollback-open','candidate','static')]:
        before_text,before_sources=states[before]
        after_text,after_sources=states[after]
        old_report=json.loads((old_package/'gateways'/folder/'report.json').read_text())
        report={k:v for k,v in old_report.items() if k not in ('patches','baselineFileCasVerified','originalRouteClasses','retiredFallbacks')}
        report.update({'kind':'103-rebased-'+folder,'beforeDumpSha256':sha(before_text.encode()),
                       'baselineDumpSha256':sha(before_text.encode()),'afterDumpSha256':sha(after_text.encode()),
                       'configClosureValidated':True,'sourceRealPaths':pre.REAL_PATHS,'rebaseFromState':before,'rebaseToState':after,
                       'staticPreflightDumpSha256':static_report['afterDumpSha256'],'rollbackTarget':'static-preflight-no-legacy-fallbacks',
                       'originalBackendRestorationRequired':False,'readyToDeploy':False,'liveWrites':0})
        report.update({'fromState':before,'toState':after,'fullBeforeDumpSha256':sha(before_text.encode()),
                       'fullAfterDumpSha256':sha(after_text.encode())})
        patch={hk.SITE:Dump(after_text).files[hk.SITE]}
        pre.write_bundle(before_text,before_sources,patch,after_text,report,output/'gateways'/folder)
        actual=(output/'gateways'/folder/'after'/hk.SITE.lstrip('/')).read_bytes()
        require(actual==after_sources[hk.SITE],'After bytes changed during rebase')
        descriptors[folder]=descriptor(output,folder,report)
    # Keep original->static and inverse preflight as explicit separate transitions.
    # The inverse is dependency-gated and must not be normal release rollback.
    for folder in ('static-preflight','rollback-static-preflight'):
        shutil.copytree(static_package/'gateways'/folder,output/'gateways'/folder)
        r=json.loads((output/'gateways'/folder/'report.json').read_text())
        if folder=='rollback-static-preflight':
            r['dependencyGate']='ONLY after all six retired original CID backends13028..13033 are restored and verified by lock owner; never normal candidate rollback'
            (output/'gateways'/folder/'report.json').write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8')
        descriptors[folder]=descriptor(output,folder,r)
    (output/'gateways.json').write_text(json.dumps(descriptors,indent=2)+'\n',encoding='utf-8')
    manifest=json.loads((old_package/'manifest.json').read_text())
    manifest.update({'kind':'103-final0614-static-preflight-rebased','packageRoot':str(output.resolve()),
                     'baselineDumpSha256':static_report['afterDumpSha256'],
                     'fourCasTransitions':['static->maintenance','maintenance->candidate','maintenance->static','candidate->static'],
                     'staticPreflightTransitions':['original->static','static->original DEPENDENCY_GATED'],
                     'rollbackRestoresLegacyFallbacks':False,'gatewayDescriptor':'gateways.json',
                     'originalFileSha256':{name:sha(raw) for name,raw in sources.items()},
                     'originalCapturedDumpSha256':hk.LIVE_DUMP_SHA,
                     'candidateAndMaintenanceAfterBytesUnchanged':True,'nginxRebasedVerification':'NOT_YET_RUN',
                     'nginxVerificationReport':'validation/rebased-nginx-results.json','nginxVerificationSha256':None,
                     'privateOriginalRollbackArchiveRequired':True,'supersededArtifacts':'Use this package only after static preflight; old original-before four-state package is stale',
                     'fourStateCasValidation':'validation/rebased-nginx-results.json'})
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    return descriptors


def seal(package, output):
    package,output=map(Path,(package,output))
    output.mkdir(parents=True,exist_ok=True)
    records=[{'path':p.relative_to(package).as_posix(),'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size}
             for p in sorted(package.rglob('*')) if p.is_file() and p.name not in ('FILE_MANIFEST.json','SHA256SUMS')]
    (package/'FILE_MANIFEST.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
    (package/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in records),encoding='utf-8')
    all_paths=[p for p in sorted(package.rglob('*')) if p.is_file()]
    public=[p for p in all_paths if not p.relative_to(package).as_posix().startswith('gateways/')]
    private=[p for p in all_paths if p.relative_to(package).as_posix().startswith('gateways/')]
    results={}
    for flavor,paths in [('deployment',public),('rollback-private',private)]:
        tarpath=output/('naumi-hk103-0614-static-rebased-'+flavor+'.tar.gz')
        require(not tarpath.exists(),'Distinct sealed tar required')
        with tarfile.open(tarpath,'w:gz') as archive:
            for path in paths:
                relative=path.relative_to(package).as_posix()
                raw=path.read_bytes();info=tarfile.TarInfo(relative);info.size=len(raw)
                info.mode=0o755 if path.name=='ROLLBACK.sh' else 0o600 if flavor=='rollback-private' else 0o644
                info.mtime=0;archive.addfile(info,io.BytesIO(raw))
        with tarfile.open(tarpath,'r:gz') as archive:
            members=archive.getmembers();require(len(members)==len(paths),'Tar count mismatch')
            for item in members:
                require(item.isfile() and sha(archive.extractfile(item).read())==sha((package/item.name).read_bytes()),'Tar byte mismatch')
        results[flavor]={'path':str(tarpath.resolve()),'sha256':sha(tarpath.read_bytes()),'bytes':tarpath.stat().st_size,'files':len(paths),'allMembersReopenedAndHashVerified':True}
    results.update({'packageRoot':str(package.resolve()),'extractBothIntoSameRoot':True,'serverConnections':0,
                    'originalConfigsInPublicTar':False,'normalRollbackTarget':'static-preflight without17 retired named fallbacks',
                    'originalRollbackDependencyGate':'all six original retired CIDs restored and verified before separate rollback-static-preflight'})
    (output/'FINAL_PACKAGE_REPORT.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    return results


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for arg in ('old-package','static-package','output'):p.add_argument('--'+arg,required=True)
    a=p.parse_args();rebase(a.old_package,a.static_package,a.output)
    print('REBASED=PREPARED FOUR_TRANSITIONS=4 AFTER_BYTES=UNCHANGED ROLLBACK_TARGET=STATIC_PREFLIGHT LIVE_WRITES=0')
