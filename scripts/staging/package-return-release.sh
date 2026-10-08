#!/usr/bin/env bash
# Archive the already-built image, not a rebuild or a staging data export.
set -Eeuo pipefail
umask 077
ROOT=/opt/naumi-staging
test "$#" = 2
COMMIT=$1
SOURCE_SHA=$2
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ && "$SOURCE_SHA" =~ ^[0-9a-f]{64}$ ]]
test ! -e /opt/naumi/current
grep -qx 'ENVIRONMENT=staging' "$ROOT/ENVIRONMENT"
SOURCE="$ROOT/source/$COMMIT-clean.tar.gz"
RELEASE="$ROOT/releases/$COMMIT"
TARGET="$ROOT/return-packages/$COMMIT"
TAG="ghcr.io/jesstle/naumi:$COMMIT"
EXPECTED=$(tr -d '\r\n' < "$RELEASE/IMAGE_ID")
test "$(docker image inspect "$TAG" --format '{{.Id}}')" = "$EXPECTED"
test "$(docker image inspect "$TAG" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" = "$COMMIT"
test "$(docker inspect naumi-staging-app-1 --format '{{.Image}}')" = "$EXPECTED"
test "$(docker inspect naumi-staging-video-worker-1 --format '{{.Image}}')" = "$EXPECTED"
echo "$SOURCE_SHA  $SOURCE" | sha256sum -c -
python3 - "$SOURCE" <<'PY'
import tarfile, sys
with tarfile.open(sys.argv[1]) as t:
    names = set()
    for m in t:
        parts = m.name.removeprefix('./').split('/')
        assert not m.name.startswith('/') and '..' not in parts
        assert not any(p in {'.env', '.env.local', '.env.production', 'node_modules', '.next', '.git', 'output'} for p in parts), m.name
        assert not m.name.lower().endswith(('.pem', '.key')), m.name
        names.add(m.name.removeprefix('./'))
    assert {'package.json', 'package-lock.json', 'scripts/deploy-release.sh', 'docker-compose.yml'} <= names
print('RETURN_SOURCE=PASS CLEAN_FIXED_COMMIT=1')
PY
if test -d "$TARGET"; then
  test "$(cat "$TARGET/COMMIT")" = "$COMMIT"
  test "$(cat "$TARGET/IMAGE_ID")" = "$EXPECTED"
  test "$(sha256sum "$TARGET/source.tar.gz" | cut -d' ' -f1)" = "$SOURCE_SHA"
else
  install -d -m 700 "$TARGET"
  cp "$SOURCE" "$TARGET/source.tar.gz"
fi
cp "$RELEASE/COMMIT" "$RELEASE/IMAGE_ID" "$RELEASE/BUILD_VERSION" "$TARGET/"
if ! test -s "$TARGET/image.tar.gz"; then
  docker image save "$TAG" | gzip -n > "$TARGET/image.tar.gz.tmp"
  gzip -t "$TARGET/image.tar.gz.tmp"
  mv "$TARGET/image.tar.gz.tmp" "$TARGET/image.tar.gz"
fi
gzip -t "$TARGET/image.tar.gz"
python3 - "$TARGET/image.tar.gz" "$EXPECTED" "$COMMIT" <<'PY'
import tarfile, sys, json, hashlib
from pathlib import Path
with tarfile.open(sys.argv[1]) as t:
    manifest = json.load(t.extractfile('manifest.json'))
    assert len(manifest) == 1
    cfg = manifest[0]['Config']
    config_bytes = t.extractfile(cfg).read()
    config_id = 'sha256:' + hashlib.sha256(config_bytes).hexdigest()
    config = json.loads(config_bytes)
    assert config['config']['Labels']['org.opencontainers.image.revision'] == sys.argv[3]
    assert manifest[0]['RepoTags'] == ['ghcr.io/jesstle/naumi:' + sys.argv[3]]
    if 'index.json' in t.getnames():
        index = json.load(t.extractfile('index.json'))
        assert len(index['manifests']) == 1
        descriptor = index['manifests'][0]
        digest = descriptor['digest']
        assert digest == sys.argv[2]
        for m in t:
            if m.isfile() and m.name.startswith('blobs/sha256/'):
                h = hashlib.sha256()
                with t.extractfile(m) as f:
                    while chunk := f.read(1024 * 1024): h.update(chunk)
                assert h.hexdigest() == m.name.split('/')[-1], m.name
        image_manifest = json.load(t.extractfile('blobs/sha256/' + digest.split(':')[1]))
        assert image_manifest['config']['digest'] == config_id
    else:
        assert config_id == sys.argv[2]
    Path(sys.argv[1]).with_name('IMAGE_CONFIG_ID').write_text(config_id + '\n')
print('RETURN_IMAGE=PASS FIXED_BUILT_IMAGE=1 IMAGE_CONFIG_ID=' + config_id)
PY
cd "$TARGET"
sha256sum source.tar.gz image.tar.gz COMMIT IMAGE_ID IMAGE_CONFIG_ID BUILD_VERSION > SHA256SUMS
sha256sum -c SHA256SUMS
printf 'RETURN_PACKAGE=PASS COMMIT=%s IMAGE_ID=%s PRODUCTION_DEPLOYED=0 DATABASE_MEDIA_INCLUDED=0\n' "$COMMIT" "$EXPECTED"
