"""Derive a small Linux fixture from the exact committed production media stage.

This image tests the real launcher/runtime/worker; it is not a full App release.
No working-tree files, credentials, DB files or business media enter its context.
"""
import hashlib
import io
import json
import pathlib
import re
import subprocess
import sys
import tarfile

commit, assets_raw, output_raw = sys.argv[1:]
if len(commit) != 40 or any(c not in "0123456789abcdef" for c in commit):
    raise ValueError("Exact committed source required")
assets, output = pathlib.Path(assets_raw).resolve(), pathlib.Path(output_raw).resolve()
output.mkdir(parents=True, exist_ok=False)
modern = subprocess.run(["git", "cat-file", "-e", commit + ":services/media-worker/engine.mjs"], capture_output=True).returncode == 0
files = ["Dockerfile", "scripts/video-media-worker.mjs", "scripts/verify-video-media-sandbox.mjs"]
files += (["services/media-worker/sandbox.c", "services/media-worker/prepare-runtime.sh",
           "services/media-worker/engine.mjs", "services/media-worker/main.mjs",
           "src/modules/media/contract.mjs", "src/modules/media/bundle.mjs"] if modern else
          ["scripts/video-fusion/media-sandbox.c", "scripts/video-fusion/prepare-media-runtime.sh",
           "scripts/video-fusion/media-engine.mjs", "scripts/video-fusion/media-bundle.mjs"])
archive = subprocess.check_output(["git", "archive", "--format=tar", commit, *files])
with tarfile.open(fileobj=io.BytesIO(archive)) as source:
    for name in files:
        member = source.getmember(name)
        if not member.isfile():
            raise ValueError("Regular committed file required")
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.extractfile(member).read())
production = (output / "Dockerfile").read_text(encoding="utf-8")
start = re.search(r"^FROM .+ AS media-runtime$", production, re.M).start()
end = re.search(r"^FROM .+ AS runner$", production[start:], re.M).start() + start
stage = production[start:end]
base = re.search(r"^ARG NODE_BASE_IMAGE=.+$", production, re.M)
base_arg = base.group(0) + "\n" if base else ""
runner_base = "${NODE_BASE_IMAGE}" if base else "node:24-bookworm-slim"
runner = f"""FROM {runner_base} AS verify
WORKDIR /app
ARG SOURCE_COMMIT
ENV NODE_ENV=production SOURCE_COMMIT=$SOURCE_COMMIT
COPY --from=media-runtime /opt/naumi-media-runtime /opt/naumi-media-runtime
COPY --from=media-runtime /usr/local/bin/naumi-media-sandbox /usr/local/bin/naumi-media-sandbox
COPY . .
USER root
CMD ["node","scripts/verify-video-media-sandbox.mjs"]
"""
(output / "Dockerfile.media-fixture").write_text(base_arg + stage + runner, encoding="utf-8", newline="\n")
manifest = json.loads((assets / "manifest.json").read_text(encoding="utf-8"))
video = next(v for v in manifest["files"] if v["name"] == "landscape-4-audio.mp4")
raw = (assets / video["name"]).read_bytes()
if hashlib.sha256(raw).hexdigest() != video["sha256"]:
    raise ValueError("Original fixture asset changed")
fixture = output / "fixture-assets"
fixture.mkdir()
(fixture / video["name"]).write_bytes(raw)
(fixture / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
evidence = {"owner": "canvas-video-fusion-20261013", "sourceCommit": commit,
            "productionStageSha256": hashlib.sha256(stage.encode()).hexdigest(),
            "files": {name: hashlib.sha256((output / name).read_bytes()).hexdigest() for name in files},
            "originalFixtureSha256": video["sha256"], "fullAppImage": False}
(output / "fixture-source.json").write_text(json.dumps(evidence), encoding="utf-8")
with tarfile.open(str(output) + ".tar.gz", "w:gz") as packed:
    for file in sorted(output.rglob("*")):
        if file.is_file():
            packed.add(file, arcname=file.relative_to(output))
print(json.dumps({"context": str(output), "archive": str(output) + ".tar.gz", "sourceCommit": commit,
                  "fullAppImage": False}))
