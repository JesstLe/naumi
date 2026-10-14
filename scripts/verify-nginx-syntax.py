#!/usr/bin/env python3
"""Real Linux Nginx regression; syntax-only, no reload or business writes."""
import argparse
import hashlib
import json
import pathlib
import stat
import subprocess
from nginx_syntax import check_gateway_syntax

args = argparse.ArgumentParser()
args.add_argument("evidence", type=pathlib.Path)
args.add_argument("--gateway", type=pathlib.Path, default=pathlib.Path("/etc/nginx/sites-available/default"))
options = args.parse_args()
evidence = options.evidence.resolve()
evidence.mkdir(parents=True, exist_ok=True)
gateway = options.gateway.read_bytes()


def production_state():
    result = {"gatewaySha256": hashlib.sha256(options.gateway.read_bytes()).hexdigest()}
    for name in ("body", "proxy", "fastcgi", "uwsgi", "scgi"):
        path = pathlib.Path("/var/lib/nginx") / name
        if path.exists():
            info = path.stat()
            result[str(path)] = [info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)]
        else:
            result[str(path)] = None
    return result


before = production_state()
try:
    for label in ("candidate", "rollback-check"):
        check_gateway_syntax(evidence, label, gateway.decode("utf-8"))
    try:
        check_gateway_syntax(evidence, "invalid", "server { definitely_invalid_directive on; }")
        raise AssertionError("Invalid configuration was accepted")
    except subprocess.CalledProcessError:
        pass
    for label, body in (("../outside", ""), ("override", "server { client_body_temp_path /var/lib/nginx/body; }")):
        try:
            check_gateway_syntax(evidence, label, body)
            raise AssertionError("Unsafe syntax-check configuration was accepted")
        except ValueError:
            pass
finally:
    after = production_state()
    assert before == after, "Production gateway or Nginx temp directory permissions changed"
    (evidence / "nginx-syntax-regression.json").write_text(json.dumps({"before": before, "after": after}, indent=2))
print("PASS actual Nginx candidate/rollback syntax, invalid rejection, isolated paths, production permissions unchanged")
