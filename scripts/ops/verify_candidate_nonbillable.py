#!/usr/bin/env python3
"""Finite 47 candidate nonbillable operator. Caller retains original release locks.

No SSH, registration, permission/config change, model call, drain toggle or deletion.
Reads private native cookie on host; sends it only over docker-exec stdin, not argv.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

COMMIT='7bdcd8b644e8771646003f68055585f257df40f0'
VERSION='1792146767'
IMAGE='sha256:14a8d2ab2c76068569a8c9fe9dde81fc581166f9d108e8dbf8b347ca09cd7375'
ROOT=Path('/opt/naumi-staging/evidence/release47-window-20261016-main7bd')


def require(ok,code):
    if not ok:raise ValueError(code)


def private_read(path,root,limit):
    require(path.is_absolute() and not path.is_symlink() and path.resolve().is_relative_to(root.resolve()) and path.is_file(),'PRIVATE_INPUT_PATH')
    require(not path.stat().st_mode & 0o077 and path.stat().st_size<=limit,'PRIVATE_INPUT_MODE_OR_SIZE')
    return path.read_bytes()


def pin(row,cid):
    env=dict(x.split('=',1) for x in row['Config'].get('Env',[]) if '=' in x)
    require(row['Id']==cid and row['Image']==IMAGE and row['State']['Running'] is True and not row['State'].get('Paused') and env.get('SOURCE_COMMIT')==COMMIT and env.get('BUILD_VERSION')==VERSION,'FIXED_RUNNING_CANDIDATE_REQUIRED')
    require(row['HostConfig']['PortBindings']=={'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'13100'}]},'EXACT_LOOPBACK_13100_REQUIRED')
    return {'id':cid,'image':row['Image'],'name':row['Name'].lstrip('/'),'startedAt':row['State']['StartedAt'],'hostPid':row['State']['Pid']}


def inspect(cid):
    p=subprocess.run(['docker','inspect',cid],capture_output=True,timeout=30,check=True)
    rows=json.loads(p.stdout);require(len(rows)==1,'AMBIGUOUS_CANDIDATE');return rows[0]


def execute(cid,cookie,owned,script):
    config={'runId':str(uuid.uuid4()),'cookie':cookie,'ownedMedia':owned,'commit':COMMIT,'version':VERSION}
    require(script.count('__PRIVATE_CONFIG__')==1,'RUNNER_TEMPLATE_INVALID')
    source=script.replace('__PRIVATE_CONFIG__',json.dumps(config,ensure_ascii=False))
    proc=subprocess.run(['docker','exec','-i','-e','NODE_OPTIONS=',cid,'node','--input-type=module','-'],input=source.encode(),capture_output=True,timeout=360)
    require(len(proc.stdout)<=2*1024*1024 and len(proc.stderr)<=1024*1024,'RUNNER_OUTPUT_TOO_LARGE')
    try:report=json.loads(proc.stdout)
    except (ValueError,UnicodeError):raise ValueError('RUNNER_RESULT_MISSING') from None
    require(report.get('runId')==config['runId'] and report.get('kind')=='candidate-nonbillable-api-acceptance','RUNNER_RESULT_IDENTITY')
    report['operatorExitStatus']=proc.returncode
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--candidate-cid',required=True);p.add_argument('--expected-host-sha256',required=True);p.add_argument('--cookie',type=Path,required=True);p.add_argument('--owned-media',type=Path,required=True);a=p.parse_args()
    require(os.name=='posix' and os.geteuid()==0,'ROOT_LINUX_OPERATOR_REQUIRED')
    require(re.fullmatch('[a-f0-9]{64}',a.candidate_cid),'EXACT_CID_REQUIRED')
    require(re.fullmatch('[a-f0-9]{64}',a.expected_host_sha256) and hashlib.sha256(Path('/etc/machine-id').read_bytes().strip()).hexdigest()==a.expected_host_sha256,'HOST_MACHINE_IDENTITY_REQUIRED')
    require(ROOT.is_dir() and not ROOT.is_symlink() and not ROOT.stat().st_mode&0o077,'PRIVATE_EVIDENCE_ROOT_REQUIRED')
    cookie=private_read(a.cookie,ROOT,8192).decode().strip();require(cookie.startswith('nv_user=') and '\n' not in cookie and '\r' not in cookie,'RAW_NATIVE_COOKIE_REQUIRED')
    owned=json.loads(private_read(a.owned_media,ROOT,16*1024*1024));require(isinstance(owned,list) and all(isinstance(x,dict) for x in owned),'OWNED_MEDIA_ARRAY_REQUIRED')
    script_path=Path(__file__).with_suffix('.mjs');script=script_path.read_text(encoding='utf-8-sig')
    before=pin(inspect(a.candidate_cid),a.candidate_cid)
    report=execute(a.candidate_cid,cookie,owned,script)
    after=pin(inspect(a.candidate_cid),a.candidate_cid);require(before==after,'CANDIDATE_CHANGED_DURING_QA')
    report.update(containerIdentity=before,target='47.105.59.142',hostLoopbackPort=13100,sourceCommit=COMMIT,buildVersion=VERSION,runnerSha256=hashlib.sha256(script_path.read_bytes()).hexdigest(),runnerExecutedOnProductionCandidate=True,originalReleaseLocks='caller-owned-not-independently-verified-by-runner')
    path=ROOT/('qa-nonbillable-'+report['runId']+'.json');raw=json.dumps(report,ensure_ascii=False,indent=2).encode()+b'\n'
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
    require(path.read_bytes()==raw,'REPORT_REOPEN_FAILED')
    print('CANDIDATE_API_QA='+report['result']+' CHECKS='+str(report.get('checks'))+' REPORT='+path.name+' SHA256='+hashlib.sha256(raw).hexdigest())
    return 0 if report['result']=='PASS' and report['operatorExitStatus']==0 else 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception:print('CANDIDATE_API_QA=HOLD OPERATOR_OR_PROTOCOL_ERROR');raise SystemExit(2)
