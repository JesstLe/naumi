# Isolate extra Node CLI probes from PID1's observer preload

The four maintenance helper paths (APP status, APP control, health/version PROBE,
worker status/control remote) explicitly pass `docker exec -e NODE_OPTIONS=`.
Only the new helper process receives this override. PID1 environment, candidate
clone configuration, observer preload and image/business source remain unchanged.
Actual HTTP status/control endpoints, authentication, boot/commit checks,
`bootSource=preload` and `transport.verified=true` remain required.

`verify_release_node_options_cli.py` creates one isolated local Node container.
Its real PID1 preload permits only the service entrypoint and rejects extra CLI
processes. Unfixed exec demonstrably fails; the real patched app_status,
LiveAdapter.verify and worker remote execute HTTP successfully. PID1's observer
flag, pending Promise, PID, configured NODE_OPTIONS and alive/no-OOM state remain
unchanged; the labelled fixture is removed. No production host is contacted.

Private-media acceptance additionally permits the actual `/media/` GET prefix,
alongside `/api/media/`. Similar-looking prefixes, arbitrary APIs and mutation
methods remain refused. No other feature-route allowance changes.
