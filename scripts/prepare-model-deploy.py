#!/usr/bin/env python3
"""Prepare private deployment files on the host; never log secret values.

Original environment files are read-only. The caller backs them up and installs
prepared files only while ingress and workers are paused. Re-running preparation
retains the same envelope key so historical encrypted projections stay readable.
"""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import secrets
import shlex
import tempfile
from urllib.parse import urlsplit

APP_KEYS = {"NAUMI_ROUTER_MANAGEMENT_URL", "NAUMI_ROUTER_MANAGEMENT_TOKEN", "NAUMI_ROUTER_GENERATION_URL", "NAUMI_ROUTER_GENERATION_TOKEN", "MODEL_CONFIG_ENVELOPE_SECRET", "MODEL_CONFIG_TRUSTED_ORIGINS"}
ROUTER_KEYS = {"NAUMI_ROUTER_MANAGEMENT_ADDR", "NAUMI_ROUTER_MANAGEMENT_TOKEN", "MODEL_CONFIG_ENVELOPE_SECRET", "MODEL_CONFIG_TRUSTED_ORIGINS"}

def read_env(path):
    result = {}
    for line in Path(path).read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name in result:
            raise ValueError("duplicate environment key")
        # Interpret quoted literals without executing/interpolating shell code.
        if value[:1] in ["'", '"']:
            parts = shlex.split(value, comments=False)
            if len(parts) != 1:
                raise ValueError("invalid quoted environment value")
            value = parts[0]
        result[name] = value
    return result

def origin(value):
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ValueError("expected exact origin")
    host = parsed.hostname.lower().rstrip(".")
    if host in {"metadata", "metadata.google.internal", "instance-data", "100.100.100.200"}:
        raise ValueError("metadata origin is forbidden")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address:
        if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
            address = address.ipv4_mapped
        if address.is_link_local or address.is_unspecified or address.is_multicast or str(address) == "fd00:ec2::254":
            raise ValueError("metadata/invalid origin is forbidden")
    port = parsed.port
    authority = f"[{host}]" if ":" in host else host
    if port and not (parsed.scheme == "http" and port == 80 or parsed.scheme == "https" and port == 443):
        authority += f":{port}"
    return f"{parsed.scheme}://{authority}"

def write_private(path, content):
    descriptor, temporary = tempfile.mkstemp(prefix=".prepared-", dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600) if hasattr(os, "fchmod") else None
        with os.fdopen(descriptor, "w", newline="\n") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def merged(original, keys, values):
    lines = [line for line in original.splitlines() if line.split("=", 1)[0] not in keys]
    return "\n".join(lines) + "\n" + "".join(f"{key}={value}\n" for key, value in sorted(values.items()))

def prepare(app_path, router_path, origins_path, output):
    app_path, router_path, output = Path(app_path), Path(router_path), Path(output)
    app, router = read_env(app_path), read_env(router_path)
    generation = router.get("NAUMI_ROUTER_TOKEN", "")
    if len(generation) < 24:
        raise ValueError("existing generation credential unavailable")
    origins = json.loads(Path(origins_path).read_text())
    if not isinstance(origins, list) or len(origins) > 100:
        raise ValueError("invalid origin list")
    trusted = sorted({origin(item) for item in origins} | {"http://172.20.0.1:8086", "http://172.20.0.1:8087"})
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    if output.is_symlink():
        raise ValueError("output must be a private real directory")
    os.chmod(output, 0o700)
    secret_path = output / "model-secrets.env"
    if secret_path.exists():
        private = read_env(secret_path)
    else:
        # Preserve existing registered secrets during a subsequent rollout.
        private = {key: app.get(key) or router.get(key) or secrets.token_hex(32) for key in ["NAUMI_ROUTER_MANAGEMENT_TOKEN", "MODEL_CONFIG_ENVELOPE_SECRET"]}
        for key in private:
            if app.get(key) and router.get(key) and app[key] != router[key]:
                raise ValueError("existing private credentials disagree")
        write_private(secret_path, merged("", set(), private))
    if any(len(private.get(key, "")) < 32 for key in ["NAUMI_ROUTER_MANAGEMENT_TOKEN", "MODEL_CONFIG_ENVELOPE_SECRET"]) or len({generation, *private.values()}) != 3:
        raise ValueError("private credentials must be independent")
    if any("\n" in value or "\r" in value or "$" in value for value in private.values()):
        raise ValueError("unsupported private credential format")
    values = {**private, "MODEL_CONFIG_TRUSTED_ORIGINS": ",".join(trusted)}
    app_values = {**values, "NAUMI_ROUTER_MANAGEMENT_URL": "http://172.20.0.1:8086", "NAUMI_ROUTER_GENERATION_URL": "http://172.20.0.1:8087/v1", "NAUMI_ROUTER_GENERATION_TOKEN": generation}
    write_private(output / "app.env", merged(app_path.read_text(), APP_KEYS, app_values))
    write_private(output / "router.env", merged(router_path.read_text(), ROUTER_KEYS, {**values, "NAUMI_ROUTER_MANAGEMENT_ADDR": "127.0.0.1:8082"}))

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ["app-env", "router-env", "trusted-origins", "output"]:
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    prepare(args.app_env, args.router_env, args.trusted_origins, args.output)
    print("PRIVATE_MODEL_ENV_PREPARED=PASS")
