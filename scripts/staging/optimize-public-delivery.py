#!/usr/bin/env python3
"""Add negotiated demo previews to an existing gateway; never cache HTML/APIs.

Usage: optimize-public-delivery.py ORIGINAL_CONF CANDIDATE_CONF
The caller must hold deploy.lock, validate nginx -t and retain ORIGINAL_CONF.
"""
import sys
from pathlib import Path

HTTP_MARKER = "    map $http_upgrade $connection_upgrade {"
SERVER_MARKER = "        # Only internal workers call this via the existing private app endpoint."
BEGIN = "# NAUMI_PUBLIC_DELIVERY_V1"

HTTP = r"""    # NAUMI_PUBLIC_DELIVERY_V1
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # Only raster demo assets use this map. Fetch/download, ranges and custom
    # queries retain the original; Next's optimizer receives no remote URL.
    map "$http_accept|$http_range|$args" $naumi_demo_delivery {
        default $request_uri;
        ~*^.*image/webp.*\|\|$ "/_next/image?url=$uri&w=1080&q=80";
    }

"""

SERVER = r"""        # Browser previews only: canonical URLs, files and API inputs stay intact.
        # Keep this allowlist narrower than /media (business originals).
        location ~* ^/demos/[a-z0-9_/-]+\.(?:png|jpe?g)$ {
            proxy_pass http://127.0.0.1:13012$naumi_demo_delivery;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header Connection "";
            proxy_hide_header Cache-Control;
            proxy_hide_header Vary;
            add_header Cache-Control "public, max-age=3600";
            add_header Vary Accept always;
            add_header X-Naumi-Delivery "demo-preview-v1" always;
            proxy_intercept_errors on;
            error_page 400 415 500 502 504 = @naumi_demo_original;
            proxy_buffering on;
            proxy_read_timeout 30s;
        }

        location @naumi_demo_original {
            proxy_pass http://127.0.0.1:13012;
            proxy_set_header Host $host;
            add_header Vary Accept always;
        }

"""


def optimize(original: str) -> str:
    if BEGIN in original:
        raise ValueError("delivery optimization already installed")
    if original.count(HTTP_MARKER) != 1 or original.count(SERVER_MARKER) != 1:
        raise ValueError("gateway shape changed; inspect before modifying")
    if "location ^~ /api/video/worker/ { return 403; }" not in original:
        raise ValueError("private worker guard missing")
    if "proxy_pass http://127.0.0.1:13012;" not in original:
        raise ValueError("expected local app upstream missing")
    return original.replace(HTTP_MARKER, HTTP + HTTP_MARKER, 1).replace(
        SERVER_MARKER, SERVER + SERVER_MARKER, 1
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: optimize-public-delivery.py ORIGINAL_CONF CANDIDATE_CONF")
    source, candidate = map(Path, sys.argv[1:])
    if source.resolve() == candidate.resolve():
        raise SystemExit("candidate must not overwrite the original")
    candidate.write_text(optimize(source.read_text()), encoding="utf-8")
    candidate.chmod(0o600)
