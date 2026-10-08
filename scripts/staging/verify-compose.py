#!/usr/bin/env python3
"""Verify resolved staging Compose without printing any environment secrets."""
import json
import re
import sys
from pathlib import Path


def verify(config):
    assert config.get("name") == "naumi-staging", "project name"
    services = config["services"]
    assert set(services) == {"db", "app", "video-worker"}, "service set"
    app, db, worker = (services[k] for k in ("app", "db", "video-worker"))
    assert re.fullmatch(r"ghcr\.io/jesstle/naumi:[0-9a-f]{40}", app["image"]), "fixed image tag"
    assert worker["image"] == app["image"], "worker image"
    assert not db.get("ports"), "database must not publish ports"
    ports = app["ports"]
    assert len(ports) == 1 and ports[0].get("host_ip") == "127.0.0.1", "loopback-only app"
    assert str(ports[0]["published"]) == "13012" and ports[0]["target"] == 3000, "app port"
    assert "workers" in worker.get("profiles", []), "worker opt-in profile"
    env = app["environment"]
    assert env["STORAGE_DRIVER"] == "local", "local storage"
    assert env["MEDIA_DIR"] == "/data/media", "media path"
    assert env["NAUMI_VIDEO_WORKER"] == "0", "internal worker disabled"
    assert env["NAUMI_ENVIRONMENT"] == "staging", "staging environment"
    assert env["NAUMI_STAGING_HISTORY_GUARD"] == "1", "history guard mandatory"
    assert "@db:5432/" in env["DATABASE_URL"], "independent database"
    assert "101.133.166.67" not in env["DATABASE_URL"], "production database isolation"
    for key in ("NAUMI_ROUTER_MANAGEMENT_URL", "NAUMI_ROUTER_GENERATION_URL", "NAUMI_ROUTER_COST_URL"):
        assert "101.133.166.67" not in env.get(key, ""), "production router isolation: " + key
    for key in ("S3_ENDPOINT", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_PUBLIC_BASE_URL", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"):
        assert not env.get(key), "remote media config must be empty: " + key
    expected = {"db": ("/opt/naumi-staging/data/postgres", "/var/lib/postgresql/data"), "app": ("/opt/naumi-staging/data/media", "/data/media")}
    for name, (source, target) in expected.items():
        mounts = services[name]["volumes"]
        assert len(mounts) == 1, "volume count: " + name
        assert mounts[0]["type"] == "bind" and mounts[0]["source"] == source and mounts[0]["target"] == target, "isolated persistent path: " + name
    assert worker["environment"]["NAUMI_APP_ORIGIN"] == "http://app:3000", "worker staging origin"


if __name__ == "__main__":
    try:
        verify(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")))
    except (AssertionError, KeyError, ValueError, IndexError) as exc:
        print("STAGING_COMPOSE_RESULT=FAIL REASON=" + str(exc))
        sys.exit(1)
    print("STAGING_COMPOSE_RESULT=PASS PROJECT=naumi-staging MEDIA=local DB=private APP=loopback WORKER=opt-in")
