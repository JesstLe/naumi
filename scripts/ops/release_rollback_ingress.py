#!/usr/bin/env python3
"""Read-only Nginx identity observations for a graceful rollback ingress seal."""
import json
import time

from release47_host import require

# No shell, user-provided program, signals, task callbacks or response bodies.
OBSERVE = r'''
import json,pathlib
root=pathlib.Path('/proc')
def process(pid):
 p=root/str(pid); stat=(p/'stat').read_text().rsplit(')',1)[1].split()
 return {'pid':int(pid),'parent':int(stat[1]),'startTicks':int(stat[19]),
         'command':' '.join((p/'cmdline').read_bytes().replace(b'\0',b' ').decode().split())}
pid=int(pathlib.Path('/run/nginx.pid').read_text().strip()); master=process(pid)
assert master['command'].startswith('nginx: master process ')
workers=[]; shutting_down=0
for p in root.iterdir():
 if not p.name.isdigit():continue
 try: row=process(int(p.name))
 except (FileNotFoundError,ProcessLookupError):continue
 if row['parent']==pid and row['command'].startswith('nginx: worker process'):
  workers.append({'pid':row['pid'],'startTicks':row['startTicks']})
  shutting_down+=int('shutting down' in row['command'])
assert process(pid)==master
print(json.dumps({'master':{'pid':pid,'startTicks':master['startTicks']},'workers':sorted(workers,key=lambda r:r['pid']),'shuttingDown':shutting_down}))
'''


def observe(tx):
    result=json.loads(tx.run(['python3','-c',OBSERVE]))
    master=result.get('master',{}); workers=result.get('workers')
    require(all(type(master.get(k)) is int and master[k]>0 for k in ('pid','startTicks')) and
            isinstance(workers,list) and 0<len(workers)<=128 and
            all(set(w)=={'pid','startTicks'} and all(type(w[k]) is int and w[k]>0 for k in w) for w in workers) and
            len({w['pid'] for w in workers})==len(workers) and
            type(result.get('shuttingDown')) is int and 0<=result['shuttingDown']<=len(workers),
            'NGINX_PROCESS_OBSERVATION_INCOMPLETE')
    return result


def drained(before, after):
    require(before['master']==after['master'], 'NGINX_MASTER_CHANGED_DURING_ROLLBACK')
    original={(r['pid'],r['startTicks']) for r in before['workers']}
    return after.get('shuttingDown',0)==0 and not original.intersection((r['pid'],r['startTicks']) for r in after['workers'])


def wait_drained(tx, before, timeout=30):
    deadline=time.monotonic()+timeout
    while True:
        after=observe(tx)
        if drained(before,after):return after
        require(time.monotonic()<deadline,'OLD_NGINX_WORKERS_NOT_DRAINED')
        time.sleep(.25)


def maintenance_probes(tx):
    # Actual pinned 103 TLS virtual host. No proxy, upstream or paid endpoint.
    for path in ('/api/version','/api/health','/desktop','/enterprise'):
        status=tx.run(['curl','--noproxy','*','--resolve','naumi.top:443:127.0.0.1','--insecure',
                       '--silent','--show-error','--max-time','3','--output','/dev/null',
                       '--write-out','%{http_code}','https://naumi.top'+path],timeout=5)
        require(status==b'503','ROLLBACK_MAINTENANCE_HTTP_NOT_SEALED')
    return {'paths':4,'status':503,'origin':'loopback-pinned-TLS-vhost'}
