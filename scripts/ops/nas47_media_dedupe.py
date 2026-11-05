#!/usr/bin/env python3
"""47 local media duplicate eviction (maintenance, not a release).

verify: read-only. A local file qualifies only when
  catalog remote_ready=true, catalog bytes == local size,
  sha256(local) == catalog sha256 == sha256(NAS GET body), and the file
  (ino/size/mtime_ns) is unchanged across the check. Files newer than the
  cutoff are never considered. No lock, no deletion, no DB writes.
evict: consumes verified.jsonl. Per batch it holds the three 47 deploy locks,
  re-reads catalog state, re-checks ino/size/mtime_ns and re-hashes the local
  file, writes an fsynced INTENT, unlinks that exact file, writes DELETED.
  Directories, DB, volumes and NAS objects are never touched.
"""
import argparse, datetime, fcntl, hashlib, hmac, json, os, pathlib, stat, subprocess, sys, threading, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path('/opt/naumi-staging/data/media')
LOCKS = ['/opt/naumi-staging/releases/deploy.lock', '/opt/naumi-reverse-hub/releases/deploy.lock', '/opt/reference-workbench/deploy.lock']
CRED = '/root/.nas47-garage.json'
CHUNK = 1 << 20

def sha_file(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(CHUNK), b''):
            h.update(b)
    return h.hexdigest()

def catalog(keys=None):
    sql = "SELECT key, remote_ready, bytes, sha256 FROM app_media_assets"
    out = subprocess.run(['docker', 'exec', 'naumi-staging-db-1', 'psql', '-U', 'naumi_staging', '-d', 'naumi_staging', '-At', '-F', '\t',
                          '-c', 'SET default_transaction_read_only=on', '-c', sql], check=True, capture_output=True, text=True).stdout
    rows = {}
    for line in out.splitlines():
        parts = line.split('\t')
        if len(parts) != 4:
            continue
        rows[parts[0]] = {'ready': parts[1] == 't', 'bytes': int(parts[2]) if parts[2] else -1, 'sha256': parts[3]}
    return rows

def safe_path(key):
    parts = pathlib.PurePosixPath(key).parts
    if not key or key.startswith('/') or '\\' in key or any(p in ('.', '..', '') for p in parts):
        raise ValueError('KEY_ESCAPE')
    p = ROOT.joinpath(*parts)
    if not p.resolve().is_relative_to(ROOT.resolve()) or any(q.is_symlink() for q in p.parents if q != ROOT and q.is_relative_to(ROOT)):
        raise ValueError('RESOLVED_ESCAPE')
    return p

class Nas:
    def __init__(self):
        c = json.load(open(CRED))
        self.ak, self.sk, self.bucket, self.region = c['accessKeyId'], c['secretAccessKey'], c['bucket'], c.get('region') or 'garage'
        self.endpoint = urllib.parse.urlparse(c['endpointHost47'])
    def sha(self, key):
        path = '/' + urllib.parse.quote(self.bucket) + '/' + '/'.join(urllib.parse.quote(x, safe='') for x in key.split('/'))
        now = datetime.datetime.now(datetime.timezone.utc)
        amz, day = now.strftime('%Y%m%dT%H%M%SZ'), now.strftime('%Y%m%d')
        empty = hashlib.sha256(b'').hexdigest()
        headers = {'host': self.endpoint.netloc, 'x-amz-content-sha256': empty, 'x-amz-date': amz}
        names = sorted(headers)
        canonical = '\n'.join(['GET', path, '', ''.join(f'{k}:{headers[k]}\n' for k in names), ';'.join(names), empty])
        scope = f'{day}/{self.region}/s3/aws4_request'
        k = hmac.new(('AWS4' + self.sk).encode(), day.encode(), hashlib.sha256).digest()
        for part in (self.region, 's3', 'aws4_request'):
            k = hmac.new(k, part.encode(), hashlib.sha256).digest()
        sig = hmac.new(k, '\n'.join(['AWS4-HMAC-SHA256', amz, scope, hashlib.sha256(canonical.encode()).hexdigest()]).encode(), hashlib.sha256).hexdigest()
        headers['authorization'] = f'AWS4-HMAC-SHA256 Credential={self.ak}/{scope}, SignedHeaders={";".join(names)}, Signature={sig}'
        req = urllib.request.Request(f'{self.endpoint.scheme}://{self.endpoint.netloc}{path}', headers={k: v for k, v in headers.items() if k != 'host'})
        h, n = hashlib.sha256(), 0
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                for b in iter(lambda: r.read(CHUNK), b''):
                    h.update(b); n += len(b)
        except urllib.error.HTTPError as e:
            return None, e.code
        return (h.hexdigest(), n), 200

def same(st, item):
    return stat.S_ISREG(st.st_mode) and st.st_ino == item['ino'] and st.st_size == item['size'] and st.st_mtime_ns == item['mtime_ns']

def verify(args):
    work = pathlib.Path(args.work); work.mkdir(parents=True, exist_ok=True); os.chmod(work, 0o700)
    cutoff = time.time() - args.min_age_hours * 3600
    cat = catalog()
    items = []
    for dirpath, dirs, files in os.walk(ROOT, followlinks=False):
        for name in files:
            p = pathlib.Path(dirpath, name); st = p.lstat()
            if not stat.S_ISREG(st.st_mode) or st.st_mtime >= cutoff:
                continue
            items.append({'key': p.relative_to(ROOT).as_posix(), 'ino': st.st_ino, 'size': st.st_size, 'mtime_ns': st.st_mtime_ns})
    items.sort(key=lambda v: v['key'])
    if args.limit:
        step = max(1, len(items) // args.limit); items = items[::step][:args.limit]
    done = set()
    out_path = work / 'verified.jsonl'
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            r = json.loads(line); done.add(r['key'])
    totals = {'candidates': len(items), 'verified': 0, 'bytes': 0, 'skipped_done': 0, 'not_ready': 0, 'catalog_mismatch': 0, 'nas_missing': 0, 'nas_error': 0, 'nas_mismatch': 0, 'changed': 0, 'error': 0}
    lock = threading.Lock(); out = open(out_path, 'a'); rej = open(work / 'retained.jsonl', 'a')
    nas = Nas(); started = time.time()
    def record(f, obj):
        with lock:
            f.write(json.dumps(obj) + '\n'); f.flush(); os.fsync(f.fileno())
    def one(item):
        key = item['key']
        if key in done:
            totals['skipped_done'] += 1; return
        try:
            c = cat.get(key)
            if not c or not c['ready']:
                totals['not_ready'] += 1; record(rej, {'key': key, 'why': 'not_ready'}); return
            if c['bytes'] != item['size']:
                totals['catalog_mismatch'] += 1; record(rej, {'key': key, 'why': 'catalog_size'}); return
            p = safe_path(key)
            if not same(p.lstat(), item):
                totals['changed'] += 1; return
            local = sha_file(p)
            if local != c['sha256']:
                totals['catalog_mismatch'] += 1; record(rej, {'key': key, 'why': 'catalog_sha'}); return
            remote, code = nas.sha(key)
            if remote is None:
                totals['nas_missing' if code == 404 else 'nas_error'] += 1; record(rej, {'key': key, 'why': f'nas_{code}'}); return
            if remote != (local, item['size']):
                totals['nas_mismatch'] += 1; record(rej, {'key': key, 'why': 'nas_sha', 'nasBytes': remote[1]}); return
            if not same(p.lstat(), item):
                totals['changed'] += 1; return
            record(out, {**item, 'sha256': local})
            with lock:
                totals['verified'] += 1; totals['bytes'] += item['size']
        except Exception as e:
            totals['error'] += 1; record(rej, {'key': key, 'why': 'error', 'code': type(e).__name__})
    def progress():
        s = {**totals, 'elapsedSec': round(time.time() - started), 'at': datetime.datetime.now().isoformat(timespec='seconds')}
        tmp = work / 'SUMMARY.json.tmp'; tmp.write_text(json.dumps(s)); os.replace(tmp, work / 'SUMMARY.json')
    stop = threading.Event()
    def ticker():
        while not stop.wait(10): progress()
    threading.Thread(target=ticker, daemon=True).start()
    with ThreadPoolExecutor(args.workers) as ex:
        list(ex.map(one, items))
    stop.set(); progress(); out.close(); rej.close()
    print(json.dumps({**totals, 'elapsedSec': round(time.time() - started)}))

def evict(args):
    work = pathlib.Path(args.work)
    entries = [json.loads(l) for l in (work / 'verified.jsonl').read_text().splitlines() if l]
    log_path = work / 'evicted.jsonl'
    finished = set()
    if log_path.exists():
        for l in log_path.read_text().splitlines():
            r = json.loads(l)
            if r['phase'] == 'DELETED': finished.add(r['key'])
    entries = [e for e in entries if e['key'] not in finished]
    if args.limit: entries = entries[:args.limit]
    res = {'deleted': 0, 'bytesDeleted': 0, 'retainedChanged': 0, 'retainedMissing': 0, 'retainedCatalog': 0, 'batches': 0}
    log = open(log_path, 'a'); os.chmod(log_path, 0o600)
    for i in range(0, len(entries), args.batch):
        batch = entries[i:i + args.batch]
        fds = [os.open(p, os.O_RDWR | os.O_CREAT, 0o600) for p in LOCKS]
        try:
            deadline = time.time() + 180
            for fd in fds:
                while True:
                    try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB); break
                    except BlockingIOError:
                        if time.time() > deadline: raise SystemExit('LOCK_TIMEOUT')
                        time.sleep(0.5)
            cat = catalog()
            for item in batch:
                key = item['key']; c = cat.get(key)
                if not c or not c['ready'] or c['sha256'] != item['sha256'] or c['bytes'] != item['size']:
                    res['retainedCatalog'] += 1; continue
                p = safe_path(key)
                try: st = p.lstat()
                except FileNotFoundError: res['retainedMissing'] += 1; continue
                if not same(st, item) or sha_file(p) != item['sha256'] or not same(p.lstat(), item):
                    res['retainedChanged'] += 1; continue
                log.write(json.dumps({'phase': 'INTENT', 'key': key, 'sha256': item['sha256'], 'bytes': item['size']}) + '\n'); log.flush(); os.fsync(log.fileno())
                p.unlink()
                log.write(json.dumps({'phase': 'DELETED', 'key': key, 'sha256': item['sha256'], 'bytes': item['size'], 'at': datetime.datetime.now().isoformat(timespec='seconds')}) + '\n'); log.flush(); os.fsync(log.fileno())
                res['deleted'] += 1; res['bytesDeleted'] += item['size']
        finally:
            for fd in fds:
                fcntl.flock(fd, fcntl.LOCK_UN); os.close(fd)
        res['batches'] += 1
        time.sleep(args.pause)
    log.close()
    (work / 'EVICTION_RESULT.json').write_text(json.dumps(res))
    print(json.dumps(res))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('mode', choices=['verify', 'evict']); ap.add_argument('--work', required=True)
    ap.add_argument('--limit', type=int, default=0); ap.add_argument('--workers', type=int, default=2); ap.add_argument('--min-age-hours', type=float, default=48)
    ap.add_argument('--batch', type=int, default=500); ap.add_argument('--pause', type=float, default=3)
    a = ap.parse_args(); verify(a) if a.mode == 'verify' else evict(a)
