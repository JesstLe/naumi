#!/usr/bin/env python3
"""Unpack a pinned, SHA-verified Router test source without cross-repo credentials."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import tarfile

def prepare(manifest_path, destination):
    manifest_path, destination = Path(manifest_path), Path(destination)
    manifest = json.loads(manifest_path.read_text())
    if set(manifest) != {"repository", "commit", "archive", "sha256"} or manifest["repository"] != "JesstLe/naumi-router" or not re.fullmatch(r"[a-f0-9]{40}", manifest["commit"]) or not re.fullmatch(r"[a-f0-9]{64}", manifest["sha256"]) or manifest["archive"] != "router-source.tar.gz":
        raise ValueError("invalid pinned Router manifest")
    archive = manifest_path.parent / manifest["archive"]
    if hashlib.sha256(archive.read_bytes()).hexdigest() != manifest["sha256"]:
        raise ValueError("Router source SHA mismatch")
    if destination.exists():
        raise ValueError("fixture destination must be new")
    with tarfile.open(archive) as source:
        if source.pax_headers.get("comment") != manifest["commit"]:
            raise ValueError("Router archive commit mismatch")
        members = source.getmembers()
        if len(members) > 5000 or sum(member.size for member in members) > 20 * 1024 * 1024:
            raise ValueError("oversize Router fixture")
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or ".." in path.parts or "\\" in member.name or not (member.isfile() or member.isdir()):
                raise ValueError("unsafe Router archive member")
        destination.mkdir(parents=True)
        source.extractall(destination, filter="data")
    return manifest["commit"]

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="scripts/fixtures/router-source/manifest.json", type=Path)
    parser.add_argument("--destination", required=True, type=Path)
    args = parser.parse_args()
    print("PINNED_ROUTER_TEST_SOURCE=" + prepare(args.manifest, args.destination))
