"""Validate gateway syntax without initializing production Nginx temp paths."""
import pathlib
import re
import subprocess
import tempfile


def _quoted(path: pathlib.Path) -> str:
    return '"' + str(path).replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$') + '"'


def check_gateway_syntax(evidence: pathlib.Path, label: str, body: str) -> pathlib.Path:
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", label):
        raise ValueError("Invalid syntax-check label")
    if re.search(r"\b(?:client_body|proxy|fastcgi|uwsgi|scgi)_temp_path\s+", body):
        raise ValueError("Gateway overrides isolated syntax-check temp paths")
    root = pathlib.Path(tempfile.mkdtemp(prefix="nginx-check-" + label + "-", dir=evidence.resolve()))
    directives = []
    for name in ("client_body", "proxy", "fastcgi", "uwsgi", "scgi"):
        directives.append(f"{name}_temp_path {_quoted(root / name)};")
    config = root / "nginx.conf"
    config.write_text(
        f"pid {_quoted(root / 'nginx.pid')};\n"
        f"lock_file {_quoted(root / 'nginx.lock')};\n"
        f"error_log {_quoted(root / 'error.log')};\n"
        "events {}\nhttp {\naccess_log off;\n"
        + "\n".join(directives) + "\n" + body + "\n}\n",
        encoding="utf-8",
    )
    subprocess.run(["nginx", "-t", "-c", str(config), "-p", str(root)], check=True)
    return config
