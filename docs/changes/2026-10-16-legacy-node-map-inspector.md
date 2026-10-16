# Legacy Node Map observation — local isolated fixture

## Deliverable

- `scripts/ops/audit_legacy_node_maps.mjs`: Node 24 container-local Inspector collector.
- `scripts/ops/fixture_legacy_node_maps.cjs`: no Naumi/DB/supplier synthetic target.
- `scripts/ops/test_audit_legacy_node_maps.py`: actual Docker/Inspector integration fixtures.
- No production connection, target business method, snapshot, breakpoint, pause command, database mutation, container retirement, or ordinary drain receipt.

## Explicit cost and bounds

`Runtime.queryObjects` invokes V8 `HeapProfiler::QueryObjects`, which calls
`CollectAllAvailableGarbage(kHeapProfiler)` followed by `CombinedHeapObjectIterator`.
Source: https://raw.githubusercontent.com/v8/v8/main/src/profiler/heap-profiler.cc .
This **forces full GC and scans the whole heap**. A client timeout cannot interrupt
that target pause or strictly bound its target allocations. Explicit
`--accept-full-gc` is mandatory; target heap <=512MiB and host MemAvailable >=1024MiB
are checked before querying. Context/map/entry/candidate limits fail closed.

## Invocation (script delivered by stdin, no file written in old app)

```sh
docker exec -i -e NODE_OPTIONS= CID node --input-type=module - \
  --pid 1 --allow-sigusr1 --accept-full-gc \
  --allowed-target-listen-ports 3000 < audit_legacy_node_maps.mjs
```

The target PID must be a Linux Node process. Startup inspect/debug options,
an existing default inspector endpoint, and any PID-owned listening socket not
on the explicit business-listener allowlist cause HOLD **before SIGUSR1**.
This also conservatively protects dynamically opened alternate-port inspectors.
Only an inspector opened by this invocation and confirmed to belong to that PID
is closed. The collector releases object groups, schedules `inspector.close()`,
disconnects, verifies the endpoint is absent and verifies the exact original
PID-owned TCP listener set. Existing debugger sessions are never attached/closed.

## Schema 1 and interpretation

- `kind=legacy-node-inspector-map-observation`
- Success: `coverage=all-enumerated-context-native-map-prototypes`,
  `contextMapEnumerationComplete=true`, `workerDiscoveryAvailable=true`,
  `workerTargets=0`, stable execution-context set, inspector closure confirmed.
- Every enumerated execution context's `Map.prototype` is queried. V8 prototype
  matching includes subclasses. Matching map keys are normalizedEmail::sessionId;
  only hashes are emitted. This is **shape-based classification**, not lexical
  access to variables named SESSIONS/CREATING or arbitrary object graph traversal.
- `sourceConfirmedNativeMapConstructionRequired=true`: the consumer must bind
  actual source/image evidence of the native `new Map()` SESSIONS/CREATING and
  confirm no custom/prototype-replaced Map construction. Otherwise coverage
  does not prove those maps were included. Empty maps have no attributable name.
- `countsSemantics=per-context-sum-upper-bound`. Cross-world object handles cannot
  be compared by callFunctionOn; no heap tracking/snapshot/prototype mutation is
  used to invent identity. `uniqueCountsGuaranteed` is true only for a single
  context. Multiple contexts may conservatively overcount; they do not permit
  subtracting active results. Shared-native-Map VM and independent VM fixtures
  exercise the actual V8 behavior.
- `sessionObservations` aggregates identical key hashes; conflicting fields HOLD.
  Fields: keyHash, running, canvasExecuting, tmp, persistState, toolResultsState.
  Promise states are absent/pending/fulfilled/rejected/unknown, obtained through
  Inspector internal PromiseState, never Promise.then or agent methods.
- `creatingObservations`: keyHash, promiseState. Counts separately record pending,
  settled and unknown Promise references. Pending persist/tool results are active.
- Proxies are rejected before target descriptor inspection. Accessor fields are
  unknown and never invoked. Only own data descriptors classify session fields.
- `OBSERVED_MAPS_IDLE` means no observed active/unknown matching map entry, **not**
  complete drain, preservation, no future creation, or permission to stop.
  tmp-idle still needs explicit preservation; nonempty idle sessions need a
  separate DB/ownership/persistence comparison. A strict consumer can require
  sessions=0 and creatingPromises=0.
- `ordinaryDrainReceipt=null` always. Source binding, maintenance/admission gates,
  sockets, PG activity, accepted tasks, caller/reference checks, backup/restore,
  locks, two >=30s observations, and authorized single-CID execution remain separate.

## Fixture validation

```powershell
python scripts/ops/test_audit_legacy_node_maps.py --output output/legacy-map-audit-fixtures
```

Fixtures cover empty, idle, running, canvas-only, tmp, pending/settled creator,
pending persist/tool, independent/shared-Map VM contexts, Map subclass,
getter/proxy nonexecution, dynamically opened alternate inspector rejection,
map bound failure, exact listener restoration, alive process/no OOM, stdin CLI,
and two empty observations >=30s apart. Result evidence is generated locally;
production execution and capacity release remain unperformed by this agent.
