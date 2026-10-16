#!/usr/bin/env python3
"""Prepare exact four-state 47 gateway CAS bundles locally; never contacts a host."""
import argparse,base64,json,pathlib,re,subprocess,uuid
import release_client_compat as c
from release47_maintenance import maintenance_gateway

COMMIT='6272c5ecb95b67aca6858d949d5da26157f4b6c4'
IMAGE='sha256:139690342ccda3d6dd05712ad7950dcb75507105229ec54c0d42d89f114d5bfd'
SITE='/etc/nginx/sites-enabled/reference-workbench'
OLD=['http://127.0.0.1:'+str(p)for p in [13070,13071,13068,13063,13052,13072,13073]]
def run(args):return subprocess.check_output(args,stderr=subprocess.STDOUT).decode().strip()

def prepare(source,root,candidate='http://127.0.0.1:13100',static_root='/var/www/naumi-assets-compat/6272c5ecb95b',*,commit=COMMIT,image_id=IMAGE,build_version='1792132681'):
 c.require(re.fullmatch('[a-f0-9]{40}',commit)and re.fullmatch('sha256:[a-f0-9]{64}',image_id)and build_version.isdecimal(),'Pinned full commit/image/build required')
 c.require(not root.exists(),'New output directory required');root.mkdir(parents=True)
 text=(source/'nginx-full.txt').read_bytes().decode();parsed=c.Dump(text)
 metadata=json.loads((source/'legacy-assets/configs.json').read_text(encoding='utf8'))
 c.require(set(metadata)==set(parsed.files),'Exact four-file source closure required')
 raw={}
 for name,item in metadata.items():
  body=base64.b64decode(item['base64'],validate=True);c.require(c.sha(body)==item['sha256'],'Original disk hash mismatch')
  c.require((source/'legacy-assets/exact-configs'/name.lstrip('/')).read_bytes()==body,'Exact disk copy mismatch')
  c.require(parsed.files[name]in[body.decode(),body.decode()+'\n'],'Full dump/source separator mismatch');raw[name]=body
 image=run(['docker','image','inspect',image_id,'--format','{{.Id}}']);c.require(image==image_id,'Final fixed image mismatch')
 container='final47-assets-'+uuid.uuid4().hex[:10];static=root/'candidate-static';static.mkdir()
 run(['docker','create','--name',container,'--label','io.naumi.final47-assets=1',image_id])
 try:
  run(['docker','cp',container+':/app/.next/static/.',str(static)])
  run(['docker','cp',container+':/app/server.js',str(root/'candidate-server.js')])
 finally:run(['docker','rm','-v',container])
 sources=[(p.name,p/'.next/static')for p in(source/'legacy-assets').iterdir()if(p/'.next/static').is_dir()]
 c.require(len(sources)==6,'Six actual legacy builds required');sources.append(('final'+commit[:12],static))
 alias_url='/_next/static/chunks/1528-73f862c260cda885.js';alias=source/'legacy-assets/alias/var/www/naumi-canvas-credits47/73f862c260cd/1528-73f862c260cda885.js'
 manifest=c.collect_assets(sources,[(alias_url,alias)]);c.materialize_assets(manifest,root/'static-union')
 patches,opened,open_report=c.render_gateway(text,SITE,candidate,OLD,static_root,manifest)
 maintenance_gateway(opened,candidate,root/'maintenance-render',baseline_dump=text,source_files=raw)
 maintained=(root/'maintenance-render/nginx.after.txt').read_bytes().decode()
 def closure_raw(dump):
  d=c.Dump(dump);return {n:b[:-1].encode()if parsed.files[n]==raw[n].decode()+'\n' else b.encode()for n,b in d.files.items()}
 snapshots={'original':(text,raw),'maintenance':(maintained,closure_raw(maintained)),'candidate':(opened,closure_raw(opened))}
 transitions={'maintenance':('original','maintenance'),'open':('maintenance','candidate'),'rollback-maintenance':('maintenance','original'),'rollback-open':('candidate','original')}
 descriptors={};reports={}
 def descriptor(path):return {'path':path.relative_to(root).as_posix(),'sha256':c.file_sha(path)}
 for kind,(before_state,after_state)in transitions.items():
  before,before_raw=snapshots[before_state];after,after_raw=snapshots[after_state];out=root/'gateways'/kind
  changes={n:b for n,b in c.Dump(after).files.items()if b!=c.Dump(before).files[n]}
  report={**open_report,'kind':'naumi47-final-'+kind,'beforeDumpSha256':c.sha(before.encode()),'afterDumpSha256':c.sha(after.encode()),'fromState':before_state,'toState':after_state,'commit':commit,'buildVersion':build_version,'continuousBlueGreen':False}
  c.write_gateway_bundle(before,changes,after,report,out,before_raw)
  all_before={}
  for n,b in before_raw.items():
   target=out/'closure-before'/n.lstrip('/');target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b);all_before[n]=descriptor(target)
  descriptors[kind]={'report':descriptor(out/'report.json'),'before':all_before,'after':{p['path']:descriptor(out/p['after'])for p in report['patches']}}
  reports[kind]={'from':before_state,'to':after_state,'beforeDumpSha256':report['beforeDumpSha256'],'afterDumpSha256':report['afterDumpSha256'],'patches':len(report['patches'])}
  for patch in report['patches']:c.require((out/patch['after']).read_bytes()==after_raw[patch['path']],'Transition raw bytes mismatch')
 c.require(reports['maintenance']['afterDumpSha256']==reports['open']['beforeDumpSha256']==reports['rollback-maintenance']['beforeDumpSha256'],'Maintenance CAS chain mismatch')
 c.require(reports['open']['afterDumpSha256']==reports['rollback-open']['beforeDumpSha256'],'Open rollback CAS mismatch')
 c.require(reports['rollback-open']['afterDumpSha256']==reports['rollback-maintenance']['afterDumpSha256']==c.sha(text.encode()),'Original rollback closure mismatch')
 (root/'gateways.json').write_text(json.dumps(descriptors,indent=2)+'\n',encoding='utf8')
 (root/'source-paths-private.json').write_text(json.dumps({n:{'realPath':v['realPath'],'sha256':v['sha256'],'logicalIsSymlink':n!=v['realPath']}for n,v in metadata.items()},indent=2)+'\n',encoding='utf8')
 summary={'schemaVersion':1,'commit':commit,'buildVersion':build_version,'image':image_id,'candidateOrigin':candidate,'staticRoot':static_root,'legacyBuilds':6,'assets':len(manifest['assets']),'aliasesPreserved':1,'filesInClosure':len(raw),'transitions':reports,'descriptor':descriptor(root/'gateways.json'),'localOnly':True,'published':False}
 (root/'prepared-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
 print('FINAL47_PREPARED=PASS STATIC='+str(len(manifest['assets']))+' CLOSURE='+str(len(raw))+' FOUR_CAS_TRANSITIONS=VERIFIED IMAGE='+image_id)
 return summary

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',required=True,type=pathlib.Path);parser.add_argument('--output',required=True,type=pathlib.Path);parser.add_argument('--commit',default=COMMIT);parser.add_argument('--image',default=IMAGE);parser.add_argument('--build-version',default='1792132681');parser.add_argument('--candidate-origin',default='http://127.0.0.1:13100');parser.add_argument('--static-root',default='/var/www/naumi-assets-compat/6272c5ecb95b');args=parser.parse_args();prepare(args.source.resolve(),args.output.resolve(),args.candidate_origin,args.static_root,commit=args.commit,image_id=args.image,build_version=args.build_version)
