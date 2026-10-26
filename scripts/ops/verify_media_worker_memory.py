from pathlib import Path
import hashlib, json, subprocess, uuid, os, shutil, wave, time, threading, argparse, re, sys

def verify_oom_free(samples, final_snapshot):
    if not samples or not isinstance(final_snapshot, dict):
        raise RuntimeError('FINAL_CGROUP_EVIDENCE_REQUIRED')
    for sample in [*samples, final_snapshot]:
        if not isinstance(sample, dict) or not isinstance(sample.get('events'), str):
            raise RuntimeError('OOM_COUNTERS_MISSING')
        try:
            counters = dict(line.split() for line in sample['events'].splitlines() if line.strip())
            values = [int(counters[key]) for key in ('oom', 'oom_kill', 'oom_group_kill')]
        except (KeyError, TypeError, ValueError):
            raise RuntimeError('OOM_COUNTERS_MISSING') from None
        if any(value != 0 for value in values):
            raise RuntimeError('OOM_EVENTS_OBSERVED')

def main():
    parser = argparse.ArgumentParser(description='Local WSL-only fixed-image media HTTP memory regression; no production connections.')
    parser.add_argument('--image', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--profiles', type=int, nargs='+', default=[3072])
    options = parser.parse_args()
    if os.name != 'posix' or os.geteuid() != 0 or (not os.environ.get('WSL_DISTRO_NAME')):
        raise SystemExit('LOCAL_ROOT_WSL_FIXTURE_REQUIRED')
    if not re.fullmatch('sha256:[a-f0-9]{64}', options.image) or not re.fullmatch('[a-f0-9]{40}', options.source):
        raise SystemExit('FIXED_IMAGE_AND_SOURCE_REQUIRED')
    if not 1 <= len(options.profiles) <= 2 or len(set(options.profiles)) != len(options.profiles) or any((not 2048 <= n <= 4096 for n in options.profiles)):
        raise SystemExit('ONE_OR_TWO_BOUNDED_EXPERIMENTAL_PROFILES_REQUIRED')
    repo = Path(__file__).resolve().parents[2]
    source = options.source
    image = options.image
    tag = 'media-max-io63-' + uuid.uuid4().hex
    root = Path('/var/tmp') / tag
    root.mkdir(mode=448)
    (root / 'OWNER').write_text(tag)
    base = repo / 'output/video-media-memory'
    base.mkdir(parents=True, exist_ok=True)
    export = base / ('media-max-io-profiles-' + tag[-12:])
    export.mkdir(mode=448)
    (base / 'LATEST_MEDIA_MAX_IO_PROBE.json').write_text(json.dumps({'root': str(root), 'export': str(export), 'tag': tag}))
    script = repo / 'scripts/ops/test_media_worker_max_io.mjs'

    def run(args, **kw):
        result = subprocess.run(args, capture_output=True, **kw)
        if result.returncode:
            raise RuntimeError('FIXTURE_COMMAND_FAILED:' + args[0] + ':' + args[1])
        return result.stdout

    def text(args):
        return run(args).decode().strip()

    def digest(file):
        h = hashlib.sha256()
        with file.open('rb') as f:
            for block in iter(lambda: f.read(1048576), b''):
                h.update(block)
        return h.hexdigest()
    results = []
    created = []
    try:
        info = json.loads(text(['docker', 'image', 'inspect', image]))[0]
        if not 'microsoft' in text(['docker', 'info', '--format', '{{.KernelVersion}}']).lower():
            raise RuntimeError('LOCAL_WSL_DOCKER_REQUIRED')
        if not (info['Id'] == image and dict((x.split('=', 1) for x in info['Config']['Env']))['SOURCE_COMMIT'] == source):
            raise RuntimeError('LOCAL_FIXTURE_PRECONDITION_FAILED')
        if not shutil.disk_usage(root).free > 6 * 1024 ** 3:
            raise RuntimeError('LOCAL_FIXTURE_PRECONDITION_FAILED')
        original = root / 'original.wav'
        frames = (249 * 1024 * 1024 - 44) // 2
        with wave.open(str(original), 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(48000)
            remaining = frames * 2
            block = bytes(1048576)
            while remaining:
                chunk = block[:min(remaining, len(block))]
                out.writeframesraw(chunk)
                remaining -= len(chunk)
        input_sha = digest(original)
        if not original.stat().st_size == 249 * 1024 * 1024:
            raise RuntimeError('LOCAL_FIXTURE_PRECONDITION_FAILED')
        for memory in options.profiles:
            work = root / str(memory)
            work.mkdir()
            scratch = work / 'scratch'
            scratch.mkdir()
            client = work / 'probe'
            client.mkdir()
            jobs = [{'id': str(uuid.uuid4())} for _ in range(2)]
            for job in jobs:
                target = scratch / job['id'] / 'inputs'
                target.mkdir(parents=True)
                shutil.copyfile(original, target / 'input-0.wav')
            (client / 'config.json').write_text(json.dumps({'owner': 'canvas-video-fusion-20261013', 'sourceCommit': source, 'jobs': jobs, 'inputBytes': original.stat().st_size, 'inputSha256': input_sha}))
            shutil.copyfile(script, client / 'probe.mjs')
            name = tag + '-' + str(memory)
            args = ['docker', 'run', '-d', '--name', name, '--label', 'io.naumi.media-max-io=' + tag, '--network', 'none', '--user', '0:0', '--read-only', '--cap-drop', 'ALL']
            for cap in ('SYS_CHROOT', 'SETUID', 'SETGID', 'CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'KILL'):
                args += ['--cap-add', cap]
            args += ['--security-opt', 'no-new-privileges', '--pids-limit', '160', '--memory=' + str(memory) + 'm', '--memory-swap=' + str(memory) + 'm', '--cpus=1', '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777', '--tmpfs', '/tmp/naumi-media-sandbox:rw,exec,nosuid,nodev,size=2g,mode=755', '--tmpfs', '/data:rw,size=1m,mode=755', '--mount', 'type=bind,src=' + str(scratch) + ',dst=/scratch', '--mount', 'type=bind,src=' + str(client) + ',dst=/probe,readonly', '-e', 'MEDIA_WORKER_SECRET=synthetic-local-media-memory-probe-' + tag, '-e', 'MEDIA_JOB_DIR=/scratch', '--entrypoint', 'node', image, 'scripts/video-media-worker.mjs']
            run(args)
            created.append(name)
            print('MEDIA_MAX_IO_PROFILE_START=' + str(memory), flush=True)
            start = time.time()
            initial = json.loads(text(['docker', 'inspect', name]))[0]
            (export / (str(memory) + '-initial-state.json')).write_text(json.dumps({'id': initial['Id'], 'image': initial['Image'], 'state': initial['State']}, indent=2))
            cgroup_line = next((x for x in Path('/proc/' + str(initial['State']['Pid']) + '/cgroup').read_text().splitlines() if x.startswith('0::')))
            cgroup = (Path('/sys/fs/cgroup') / cgroup_line[3:].lstrip('/')).resolve()
            if not cgroup.is_relative_to(Path('/sys/fs/cgroup')):
                raise RuntimeError('LOCAL_FIXTURE_PRECONDITION_FAILED')
            done = threading.Event()
            samples = []

            def read_snapshot():
                return {'at': time.time(), 'current': int((cgroup / 'memory.current').read_text()), 'peak': int((cgroup / 'memory.peak').read_text()), 'events': (cgroup / 'memory.events').read_text(), 'stat': (cgroup / 'memory.stat').read_text()}

            def sample():
                while not done.is_set():
                    try:
                        value = read_snapshot()
                        samples.append(value)
                        with (export / (str(memory) + '-samples.jsonl')).open('a') as out:
                            out.write(json.dumps(value) + '\n')
                    except OSError:
                        pass
                    done.wait(0.1)
            monitor = threading.Thread(target=sample, daemon=True)
            monitor.start()
            try:
                result = subprocess.run(['docker', 'exec', '-e', 'MEDIA_MEMORY_VERIFY_OWNER=canvas-video-fusion-20261013', name, 'node', '/probe/probe.mjs'], capture_output=True, timeout=270)
            finally:
                done.set()
                monitor.join(timeout=5)
            (export / (str(memory) + '-client.log')).write_bytes(result.stdout + result.stderr)
            row = json.loads(text(['docker', 'inspect', name]))[0]
            try:
                final_snapshot = read_snapshot()
            except OSError:
                final_snapshot = None
            item = {'memoryMiB': memory, 'exitCode': result.returncode, 'image': image, 'sourceCommit': source, 'containerId': row['Id'], 'state': row['State'], 'samples': len(samples), 'verification': 'PENDING', 'maximumObservedBytes': max((x['peak'] for x in samples), default=None), 'productionConnections': 0, 'supplierCalls': 0}
            results.append(item)
            (export / 'RESULTS.json').write_text(json.dumps(results, indent=2))
            events_raw = run(['docker', 'events', '--since', str(int(start) - 1), '--until', str(int(time.time()) + 1), '--filter', 'container=' + row['Id'], '--format', '{{json .}}'])
            events = [json.loads(x) for x in events_raw.decode().splitlines() if x.strip()]
            (export / (str(memory) + '-docker-events.json')).write_text(json.dumps([{'action': x.get('Action'), 'time': x.get('timeNano'), 'exitCode': x.get('Actor', {}).get('Attributes', {}).get('exitCode')} for x in events], indent=2))
            (export / (str(memory) + '-last-memory.json')).write_text(json.dumps(final_snapshot if final_snapshot is not None else {'unavailable': True}, indent=2))
            runlog = run(['docker', 'logs', name])
            (export / (str(memory) + '-worker.log')).write_bytes(runlog)
            if (scratch / 'PROBE_RESULT.json').exists():
                shutil.copyfile(scratch / 'PROBE_RESULT.json', export / (str(memory) + '-result.json'))
            print('MEDIA_MAX_IO_PROFILE_EXIT=' + str(memory) + ':' + str(result.returncode), flush=True)
            if result.returncode:
                break
            if not row['State']['Running'] or row['State']['OOMKilled'] or row['State'].get('Restarting') or row['State'].get('Paused'):
                raise RuntimeError('FIXTURE_WORKER_NOT_STABLE')
            verify_oom_free(samples, final_snapshot)
            witness = json.loads((scratch / 'PROBE_RESULT.json').read_text())
            if witness.get('result') != 'PASS' or witness.get('peakRunning') != 2 or len(witness.get('verified', [])) != 2:
                raise RuntimeError('TWO_REAL_MEDIA_RESULTS_NOT_VERIFIED')
            item['verification'] = 'PASS'
            item['finalMemoryPeakBytes'] = final_snapshot['peak']
            (export / 'RESULTS.json').write_text(json.dumps(results, indent=2))
            run(['docker', 'rm', '-fv', name])
            created.remove(name)
            shutil.rmtree(work)
        print('MEDIA_MAX_IO_PROFILES_COMPLETE=' + str(export), flush=True)
        if any((row['exitCode'] for row in results)):
            raise SystemExit(1)
    except Exception as error:
        (export / 'FAILURE.json').write_text(json.dumps({'errorType': type(error).__name__, 'message': str(error), 'productionConnections': 0}))
        raise
    finally:
        for name in created:
            row = json.loads(text(['docker', 'inspect', name]))[0]
            if not row['Config']['Labels']['io.naumi.media-max-io'] == tag:
                raise RuntimeError('LOCAL_FIXTURE_PRECONDITION_FAILED')
            run(['docker', 'rm', '-fv', row['Id']])
        if not (root.parent == Path('/var/tmp') and root.name == tag and ((root / 'OWNER').read_text() == tag)):
            raise RuntimeError('LOCAL_FIXTURE_PRECONDITION_FAILED')
        shutil.rmtree(root)
        (export / 'CLEANUP.json').write_text(json.dumps({'ownedContainersRemoved': True, 'ownedScratchRemoved': True, 'productionConnections': 0}))

if __name__ == '__main__':
    main()
