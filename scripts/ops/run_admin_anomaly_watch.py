#!/usr/bin/env python3
"""One scheduled read; all persisted artifacts stay in this checkout's ignored output."""
import argparse,datetime as dt,json,os,pathlib,subprocess,sys,uuid

def main():
    p=argparse.ArgumentParser();p.add_argument('--identity',required=True);p.add_argument('--known-hosts',required=True);p.add_argument('--ssh',default='ssh');p.add_argument('--node',default='node');p.add_argument('--minimum-interval-seconds',type=int,default=0);a=p.parse_args()
    if not 0<=a.minimum_interval_seconds<=86400:p.error('minimum interval must be 0..86400 seconds')
    root=pathlib.Path(__file__).resolve().parents[2];out=root/'output/admin-anomaly-watch-20261026';out.mkdir(parents=True,exist_ok=True)
    lock=out/'collector.lock'
    handle=open(lock,'a+b');handle.seek(0)
    if not handle.read(1):handle.write(b'0');handle.flush()
    handle.seek(0)
    try:
        if os.name=='nt':
            import msvcrt;msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl;fcntl.flock(handle,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:handle.close();print('ADMIN_ANOMALY_WATCH=SKIPPED ACTIVE_COLLECTOR=1');return 3
    run=out/'runs'/(dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]);run.mkdir(parents=True)
    def save_result(value):
        value={'observedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'run':run.name,**value}
        (run/'RESULT.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        temporary=out/('LATEST_RUN.tmp-'+uuid.uuid4().hex)
        temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        os.replace(temporary,out/'LATEST_RUN.json')
    try:
        previous=out/'LATEST_RUN.json'
        if a.minimum_interval_seconds and previous.exists():
            latest=json.loads(previous.read_text(encoding='utf-8'))
            age=(dt.datetime.now(dt.timezone.utc)-dt.datetime.fromisoformat(latest['observedAt'])).total_seconds()
            if age<0:raise RuntimeError('RECENT_RUN_CLOCK_CHANGED')
            if age<a.minimum_interval_seconds:
                (run/'SKIPPED.json').write_text(json.dumps({'reason':'RECENT_RUN','previousRun':latest['run'],'minimumIntervalSeconds':a.minimum_interval_seconds}),encoding='utf-8')
                print('ADMIN_ANOMALY_WATCH=SKIPPED RECENT_RUN=1');return 3
        identity=pathlib.Path(a.identity).resolve(strict=True);known=pathlib.Path(a.known_hosts).resolve(strict=True)
        result=subprocess.run([a.ssh,'-i',str(identity),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','UserKnownHostsFile='+str(known),'-o','ConnectTimeout=15','root@47.105.59.142','python3 -B -'],input=(root/'scripts/ops/admin_anomaly_remote.py').read_bytes(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=180)
        raw=run/'observation.private.json';raw.write_bytes(result.stdout);(run/'stderr.private.txt').write_bytes(result.stderr)
        if result.returncode:
            save_result({'result':'COLLECTION_FAILED','exit':result.returncode,'cleanBillOfHealth':False})
            print('ADMIN_ANOMALY_WATCH=COLLECTION_FAILED EXIT='+str(result.returncode));return 1
        process=subprocess.run([a.node,str(root/'scripts/admin-anomaly-benchmark.cjs'),str(raw),str(out/'ledger')],capture_output=True,text=True,encoding='utf8',cwd=root)
        (run/'analysis.log').write_text(process.stdout+process.stderr,encoding='utf8')
        if process.returncode:
            save_result({'result':'ANALYSIS_FAILED','exit':process.returncode,'cleanBillOfHealth':False})
        else:
            save_result({'result':'RECORDED','exit':0,'raw':'observation.private.json','ledger':str(out/'ledger/cases.json'),'report':str(out/'ledger/LATEST.md')})
        print((process.stdout+process.stderr).strip());return process.returncode
    except subprocess.TimeoutExpired as error:
        (run/'observation.private.json').write_bytes(error.stdout or b'')
        (run/'stderr.private.txt').write_bytes(error.stderr or b'')
        save_result({'result':'COLLECTION_TIMEOUT','exit':124,'cleanBillOfHealth':False})
        print('ADMIN_ANOMALY_WATCH=COLLECTION_TIMEOUT');return 1
    except Exception as error:
        save_result({'result':'COLLECTION_FAILED','exit':1,'errorType':type(error).__name__,'cleanBillOfHealth':False})
        print('ADMIN_ANOMALY_WATCH=ERROR '+type(error).__name__);return 1
    finally:handle.close()

if __name__=='__main__':
    try:raise SystemExit(main())
    except Exception as error:print('ADMIN_ANOMALY_WATCH=ERROR '+type(error).__name__);raise SystemExit(1)
