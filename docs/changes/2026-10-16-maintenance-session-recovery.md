# Maintenance session recovery, capacity and HK topology / 2026-10-16

## Delivered scope

Only `release_maintenance_session.py`, its focused test and this note change.
Root's uncommitted proof snapshot kwargs are retained and included: projection proof,
row_limit5000 and the source-audited additive-table set. No server connection,
supplier call, publication or production cleanup is performed by this subtask.

The existing original UUID, request/plan hash, canonical CAS and UNKNOWN history
remain mandatory. No new UUID, changed expectedRevision or altered manifest can
silently replace an unresolved operation. This update repairs specific proven
no-workload-side-effect failures instead of acknowledging generic failed reads.

## Recovery behavior

### Web/Worker start

Underlying host/controls functions write a fixed start-intent only AFTER all identity,
configuration and RAM gates, BEFORE issuing docker start. Explicit original-UUID
reconcile may re-run those same gates only when that intent is absent, its path is
not a symlink and the inspected container exactly equals the original stopped
identity, including original start time/image/name/restart policy. A changed/running
identity without intent stays UNKNOWN. An existing start-intent plus a stopped
container stays UNKNOWN: no second start is guessed after an ambiguous command.

A successful worker start followed by a failed status read reuses/pins the persisted
running identity and retries only status observation; it does not issue start again.
Paused/QUIESCENT and zero unresolved ticks are still required. Creation without a
real receipt is not guessed, renamed, removed or re-created.

### Backup

Each original operation has a durable private backup-attempt journal. Reconcile
first reopens available exact evidence and checks full file hash/length, original
DB identity, TOC hash and complete custom archive decoding. Decoding runs
`pg_restore --file=/dev/null --no-owner --no-acl` with no `-d/--dbname`; SQL is discarded,
never connected/restored to any database. A TOC-only success cannot hide corrupt data.

A failed/partial read may run a fresh read-only pg_dump in a new700 attempt folder;
old dumps and failed evidence are preserved. No arbitrary read error becomes PASS,
no business data is modified, and no existing artifact is overwritten/deleted.
Unknown hashes/failed new reads keep the canonical operation unresolved.

### Gateway

Every original operation binds its exact bundle descriptor and resolved closure,
and retains immutable per-attempt write evidence. After automatic exact rollback,
reconcile freshly verifies full before-dump SHA AND every source-file byte, then
repeats the same original CAS in a new evidence folder. When the after-dump is already
visible, a matching actual write-intent and all exact after/unchanged bytes are
required before syntax-check/reload reconciliation. Merely matching a new dump SHA
without an original write-intent is not an acknowledgement. External drift stays
UNKNOWN; root's full-closure switch/rollback behavior is unchanged.

## Capacity and legacy caller preconditions

Immediately before the first maintenance gateway503, a read-only preflight sums
ALL concurrently required candidate Web budgets, the one new Worker budget and a
minimum1024MiB reserve. Every Web contributes max(cap,measured peak). Worker contributes
max(cap,declared peak across Web budgets); reserve contributes the largest declared
host reserve. Only actual `/proc/meminfo` MemAvailable counts, never Swap.

Thus HK1045MiB with nearly exhausted Swap fails BEFORE503, not halfway through a
three-Web rollout. Same UUID can be explicitly re-evaluated after real capacity
changes. The executor does not retire old UI-only slots to make room: static-union
proof, old-client/reference audit and an explicit per-slot retirement remain separate
authorized work. Without them, it stops at this precondition.

Root's current observations47≈1753MiB and HK≈1045MiB are both below a2048MiB
single-Web budget; this module does not turn a maintenance exception into implicit
permission to stop their old Apps. A future explicitly named
`maintenance-retire-readonly-ui` action is not implemented here. It would need
per-CID UI-only role, full static alias replacement and actual route/Worker/internal
references, explicit timer0, absence of persistent task/Agent ownership, plus exact
original-CID rollback evidence. Interrupted rendering under a maintenance exception
is not proof unknown Agent work drained. Task snapshot completeness is not process
stoppability or retirement authority.

Preflight also pins every declared old workload identity and all candidate source
Webs. Baseline may contain only standard Webs and the explicitly audited old caller,
not PostgreSQL/Hub/Redis/unknown executors. Every old Web must already have explicit
`NAUMI_VIDEO_WORKER=0`; absent/default settings are not equivalent. This module does
not mutate old App environment or claim that docker pause on the external caller
stopped App-internal timers.

Activation repeats these legacy checks before each candidate App resume, gateway
switch and new Worker resume. Finish repeats them. Rollback first explicitly pauses
the new Worker and verifies no UNKNOWN tick, then revalidates legacy state before
gateway/original caller restoration. A lost old-caller unpause response can be
reconciled only after new Worker quiescence and exact original restore-intent, not
from a free-form boolean. Original accepted work/legacy counters remain unknown;
MIGRATED_CLEANUP_PENDING remains distinct from COMPLETE.

## Explicit HK one-Web / three-UI topology

Default103 still requires main→desktop→enterprise separately compiled variants.
Only103 may explicitly choose `runtimeTopology="unified-web-three-ui"` with exactly
one main Web and compiled assetPrefix empty. It must retain required login/canvas/
private-media/old-client checks AND `desktop-ui`/`enterprise-ui`. A896MiB main plus
128MiB Worker and1024MiB reserve requires2048MiB actual MemAvailable. This is not
proof current HK has that capacity or that a candidate's UI is working.

The complete open-gateway bundle must be generated for that topology and verified
with the same exact full closure SHA; topology does not weaken gateway CAS.
Both UI checks bind the one actual main container/preload boot and require:

- Concrete loopback `/desktop` or `/enterprise` page response and body assertions;
- CUA/Playwright browser runner, actual hashed PNG, fresh same-boot hydrated role
  snapshot and no recorded browser errors;
- Desktop tablist+heading and enterprise button+heading assertions with nonempty
  accessible names, recomputed against actual visible elements in the DOM artifact.

HTTP200/Next shell or a plain HTTP GET collector is rejected for these two checks.
Actual authenticated desktop home/enterprise management roles and data are sampled
by root's browser QA; this executor checks artifact identity/content, not supplier
generation or business permission completeness beyond recorded assertions.

Browser evidence schema (values come from actual current browser, not hand-written
PASS) for each corresponding check:

```javascript
// Execute in the QA runner after actual navigation/hydration and concrete role
// assertions. Example uses existing Playwright page and the current verified binding.
const roles = ui === 'desktop-ui'
  ? [{role:'tablist', name:'工作空间展示'}, {role:'heading', name:'从这里，开始你的创作'}]
  : [{role:'button', name:'组织与成员'}, {role:'heading', name:actualEnterpriseName}];
const elements = [];
for (const role of roles) {
  const locator = page.getByRole(role.role, {name:role.name, exact:true});
  await locator.first().waitFor({state:'visible'});
  elements.push({...role, visible:await locator.first().isVisible()});
}
const dom = {kind:'hydrated-role-snapshot-v1', containerId:binding.container.id,
  bootId:binding.appIdentity.bootId, url:page.url(), hydrated:true,
  errors:actualRecordedPageErrors, observedAt:new Date().toISOString(), elements};
// Persist dom JSON and page.screenshot PNG in the private evidence folder;
// compute actual SHA256 descriptors, alongside the actual HTTP response/body.
check.dom = persistedDomDescriptor;
check.screenshot = persistedPngDescriptor;
check.roleAssertions = roles;
check.runner = 'playwright';
```

The ordinary nonbillable HTTP collector remains usable for other checks. Root may
combine its reports and actual browser checks in one acceptance report before the
`acceptance` RPC, supplying its hashed descriptor in the step's artifact field.

## Concentrated verification

Windows focused session tests pass (one explicit POSIX lock fixture skipped).
Current focused count33 includes a real isolated PostgreSQL custom archive decoded
to /dev/null and verifies its source table retains2 rows. Combined Windows97 tests
pass with12 POSIX-only skips; Linux97 pass with the2 Docker/PG fixture tests skipped.
Linux disposable `python:3.12-slim --network none` combined session/host/controls/
maintenance/worker tests pass, including actual flock lifetime, failed-before-start
RAM gates, ambiguous start no-replay, backup reread/corrupt artifact preservation,
gateway automatic rollback→same UUID recovery, legacy timer guard, UNKNOWN tick
rollback guard and positive/negative unified UI artifact checks. These are isolated
tests, not47/103 deployment or supplier acceptance. Literal commands and outputs
are recorded in the task's reopened VERIFICATION evidence.
