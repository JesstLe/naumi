#!/usr/bin/env bash
# Tests real probe control flow against mock storage, never real OSS.
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
COMMIT=${1:?Full candidate commit required}
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]]
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
IMAGE=$(docker inspect naumi-staging-app-1 --format '{{.Image}}')
test "$(docker inspect naumi-staging-app-1 --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$COMMIT"
SOURCE="$ROOT/source/$COMMIT-clean"
test -r "$SOURCE/src/lib/storage.ts"
python3 - "$ROOT/config/prepare-oss-probe.py" <<'PY'
import importlib.util, pathlib, os, sys, tempfile
spec=importlib.util.spec_from_file_location('probe',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory(prefix='oss-probe-config-fixture-') as d:
    p=pathlib.Path(d);src=p/'config';out=p/'private.env'
    fields={'NAUMI_OSS_ENDPOINT':'https://s3.oss-cn-hangzhou.aliyuncs.com','NAUMI_OSS_REGION':'cn-hangzhou','NAUMI_OSS_ACCESS_KEY_ID':'fixture-only','NAUMI_OSS_SECRET_ACCESS_KEY':'fixture-only','NAUMI_OSS_BUCKET':'fixture-staging'}
    text=''.join(k+'='+v+'\n' for k,v in fields.items())
    src.write_text(text);src.chmod(0o600)
    env=m.render(src,out);assert env['S3_ENDPOINT'].startswith('https://s3.oss-')
    assert out.stat().st_mode&0o777==0o600;out.unlink()
    cases=[text.replace('s3.oss-','oss-'),text+'NAUMI_OSS_BUCKET=duplicate\n',text.replace('fixture-only','$(touch /tmp/never)'),text.replace('cn-hangzhou.aliyuncs','cn-beijing.aliyuncs'),text.replace('https://','http://'),text+'UNKNOWN=value\n']
    for bad in cases:
        src.write_text(bad)
        try:m.render(src,out)
        except (AssertionError,KeyError,ValueError):pass
        else:raise AssertionError('invalid config accepted')
        assert not out.exists()
    src.write_text(text);src.chmod(0o644)
    try:m.render(src,out)
    except AssertionError:pass
    else:raise AssertionError('insecure mode accepted')
    src.chmod(0o600);link=p/'link';link.symlink_to(src)
    try:m.render(link,out)
    except AssertionError:pass
    else:raise AssertionError('symlink accepted')
print('OSS_PROBE_CONFIG_FIXTURE=PASS PUBLIC=1 LITERAL_PARSER=1 MODE_0600=1 NEGATIVE_CASES=8 COMMAND_EXECUTION=0')
PY
docker run --rm --network none --cpus 1 --memory 768m \
  --add-host oss-fixture.local:127.0.0.1 --add-host fixture-bucket.oss-fixture.local:127.0.0.1 \
  --tmpfs /evidence:rw,mode=0700 \
  -v "$SOURCE:/source:ro" -v naumi-staging-build-deps:/source/node_modules:ro \
  -v "$ROOT/config/verify-oss-live.ts:/tmp/verify-oss-live.ts:ro" \
  -v "$ROOT/config/verify-oss-probe-fixture.ts:/tmp/verify-oss-probe-fixture.ts:ro" \
  --user root "$IMAGE" node --conditions react-server /tmp/verify-oss-probe-fixture.ts
echo 'OSS_PROBE_FIXTURE=PASS LIVE_SWITCH=0 REAL_REQUESTS=0'
