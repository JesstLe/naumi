# One-shot Node GC utility

`scripts/ops/collect_node_gc_once.mjs` reuses the local Inspector ownership and
listener restoration guards. It sends exactly one `HeapProfiler.collectGarbage`,
two `Runtime.getHeapUsage`, and two cleanup/identity `Runtime.evaluate` calls.
It does not query Maps, take snapshots, change prototypes, call application
handlers, pause the debugger explicitly, terminate the process, or emit a drain.

```sh
docker exec -i -u TARGET_UID -e NODE_OPTIONS= CID node --max-old-space-size=64 \
  --input-type=module - --pid 1 --allow-sigusr1 --accept-full-gc \
  --allowed-target-listen-ports 3000 < collect_node_gc_once.mjs
```

The caller must use the PID's actual UID (root without CAP_SYS_PTRACE can receive
EACCES on another UID's /proc/exe/environ), pin exact CID/image/source externally,
and retain normal operation/release locks. /proc/exe verifies native Node even
when Next changes process.title. Existing startup/debug environment or unexpected
PID-owned listener causes HOLD before SIGUSR1. Only the inspector this invocation
opened on loopback is closed; the exact original listener set must be restored.
The helper requires --max-old-space-size=64, empty NODE_OPTIONS and host available
RAM >=1024MiB. Target used heap defaults to an explicit 4096MiB upper gate.

Full GC can reclaim unreachable V8 allocations without discarding reachable
sessions/tasks. It does **not** promise RSS/cgroup reduction, eliminate live heap,
preserve external application consistency against concurrent work, or constitute
drain/capacity acceptance. It pauses the target. Client deadlines do not interrupt
target GC; timeout is HOLD, not termination. Normal V8 finalization semantics may
run naturally; this utility never invokes application callbacks directly.

Real isolated Node24 fixture test:
`python scripts/ops/test_collect_node_gc_once.py`.
It compares HTTP-observed reachable sentinel (40000 rows) and pending Promise/task
before/after, verifies one GC only, lower used heap, process alive/OOM=false,
Inspector closure/listener restoration, and cleans only its newly labelled
fixture. Artifacts: `output/node-gc-once-fixture/{GC_RESULT.json,RESULT.json}`.
No production connection or restart is performed by this test.
