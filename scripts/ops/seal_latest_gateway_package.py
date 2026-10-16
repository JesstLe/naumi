#!/usr/bin/env python3
"""Seal explicit public/private allowlists; reopen every member and combined tree."""
import argparse
import io
import json
from pathlib import Path
import tarfile
import tempfile

import release_client_compat as c


def seal(package,output):
    package,output=map(lambda p:Path(p).resolve(),(package,output));output.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((package/'manifest.json').read_text())
    c.require(manifest['nginxValidation'].startswith('PASS_REAL_LINUX_'),'New byte real Nginx validation required')
    validation=json.loads((package/'validation/gateway-linux-results.json').read_text())
    c.require(validation['result']=='PASS' and c.file_sha(package/'validation/gateway-linux-results.json')==manifest['nginxVerificationSha256'],'Nginx evidence hash changed')
    c.require(len(validation['transitions'])==5 and validation['staticHttpHashes']==manifest['totalUrls'],'Incomplete real gateway validation')
    # Nothing under validation/live, generated cert/key, private render scratch,
    # or image config is eligible for public inclusion.
    public=[package/'manifest.json',package/'gateways.json',package/'validation/gateway-linux-results.json']
    public+=sorted(p for p in (package/'static').rglob('*') if p.is_file())
    private=sorted(p for p in (package/'gateways').rglob('*') if p.is_file())
    paths=public+private
    c.require(not any(p.is_symlink() for p in paths),'Archive symlink rejected')
    records=[{'path':p.relative_to(package).as_posix(),'sha256':c.file_sha(p),'bytes':p.stat().st_size,'visibility':'private' if p in private else 'public'} for p in sorted(paths)]
    (package/'FILE_MANIFEST.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
    (package/'SHA256SUMS').write_text(''.join(r['sha256']+'  '+r['path']+'\n' for r in records),encoding='utf-8')
    public+=[package/'FILE_MANIFEST.json',package/'SHA256SUMS']
    tag=('hk103' if manifest['target']=='103.30.76.93' else '47')+'-'+manifest['commit'][:12]+'-'+manifest['buildVersion']
    results={}
    for flavor,files in [('deployment',public),('rollback-private',private)]:
        allowed={p.relative_to(package).as_posix() for p in files}
        out=output/('naumi-'+tag+'-'+flavor+'.tar.gz');c.require(not out.exists(),'New distinct sealed archive required')
        with tarfile.open(out,'w:gz') as archive:
            for p in files:
                relative=p.relative_to(package).as_posix();raw=p.read_bytes();info=tarfile.TarInfo(relative);info.size=len(raw)
                info.mode=0o755 if p.name=='ROLLBACK.sh' else 0o600 if flavor=='rollback-private' else 0o644
                info.mtime=0;archive.addfile(info,io.BytesIO(raw))
        with tarfile.open(out,'r:gz') as archive:
            members=archive.getmembers();c.require(len(members)==len(files),'Archive member count mismatch')
            for member in members:
                c.require(member.isfile() and member.name in allowed,'Unexpected tar member')
                c.require(c.sha(archive.extractfile(member).read())==c.file_sha(package/member.name),'Reopened tar bytes mismatch')
        results[flavor]={'path':str(out),'sha256':c.file_sha(out),'bytes':out.stat().st_size,'files':len(files),'allMembersReopenedAndHashVerified':True}
    with tempfile.TemporaryDirectory(prefix='naumi-sealed-roundtrip-') as folder:
        combined=Path(folder)
        for item in results.values():
            with tarfile.open(item['path'],'r:gz') as archive:archive.extractall(combined,filter='data')
        descriptors=json.loads((combined/'gateways.json').read_text())
        for d in descriptors.values():
            for item in [d['report'],*d['before'].values(),*d['after'].values()]:c.require(c.file_sha(combined/item['path'])==item['sha256'],'Combined deployment descriptor mismatch')
        for record in records:c.require(c.file_sha(combined/record['path'])==record['sha256'],'Combined extracted file hash mismatch')
    results.update({'packageRoot':str(package),'source':manifest['commit'],'buildVersion':manifest['buildVersion'],'target':manifest['target'],'image':manifest['image'],
                    'baselineDumpSha256':manifest['baselineDumpSha256'],'staticAssets':manifest['totalUrls'],'prefixCounts':manifest['prefixCounts'],
                    'transitions':manifest['transitions'],'extractBothIntoSameRoot':True,'combinedExtractionAndAllDescriptorsReopenedAndVerified':True,
                    'publicConfigBodiesIncluded':False,'privateRuntimeConfigIncluded':False,'fixturePrivateTlsKeyIncluded':False,
                    'nginxValidationReportSha256':manifest['nginxVerificationSha256'],'canonicalSessionReplaced':False,'liveConnections':0,'published':False})
    (output/'FINAL_PACKAGE_REPORT.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
    return results


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--package',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();r=seal(a.package,a.output);print('LATEST_PACKAGE_SEALED=PASS TARGET='+r['target']+' STATIC='+str(r['staticAssets'])+' PUBLIC_CONFIG_BODIES=0 TAR_ROUNDTRIP=EXACT LIVE_CONNECTIONS=0')
