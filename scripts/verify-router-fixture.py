#!/usr/bin/env python3
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("router_fixture", Path(__file__).with_name("prepare-router-fixture.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix="naumi-router-source-") as folder:
    root = Path(folder)
    archive = root / "router-source.tar.gz"
    commit = "a" * 40
    def create(name):
        with tarfile.open(archive, "w:gz", format=tarfile.PAX_FORMAT, pax_headers={"comment": commit}) as stream:
            member = tarfile.TarInfo(name); member.size = 7
            stream.addfile(member, io.BytesIO(b"fixture"))
    create("go.mod")
    manifest = root / "manifest.json"
    data = {"repository": "JesstLe/naumi-router", "commit": commit, "archive": archive.name, "sha256": "0" * 64}
    manifest.write_text(json.dumps(data))
    try:
        module.prepare(manifest, root / "bad")
        raise AssertionError("bad source hash accepted")
    except ValueError as error:
        assert "SHA mismatch" in str(error)
    assert not (root / "bad").exists()
    data["sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest.write_text(json.dumps(data))
    assert module.prepare(manifest, root / "valid") == commit
    assert (root / "valid" / "go.mod").read_bytes() == b"fixture"
    create("../escape")
    data["sha256"] = hashlib.sha256(archive.read_bytes()).hexdigest()
    manifest.write_text(json.dumps(data))
    try:
        module.prepare(manifest, root / "unsafe")
        raise AssertionError("traversal accepted")
    except ValueError as error:
        assert "unsafe" in str(error)
    assert not (root / "unsafe").exists()
print("ROUTER_FIXTURE_HASH_COMMIT_AND_EXTRACTION=PASS")
