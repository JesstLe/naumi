# 47 crash recovery completion — 2026-10-17

## Scope and implementation

Emergency continuation of 19a46a54; shared checkout and other feature work remain untouched.
Production compiled application stays 7bdcd8b / 1792146767, original fixed image.
No new supplier diagnostic, paid replay, database restore or gateway rewrite.

- Root-only, host/image/config/hash-pinned supervisor holds the original three locks.
- Readiness covers DB, exact version, an existing authenticated session, projects and canvas before opening a fresh Web boot.
- Exact stopped-container crash recovery is rate-limited; clean stops and same-boot operator drain/pause remain respected.
- UNKNOWN Worker ticks are never erased, completed or rePOSTed. An explicitly audited successor scanner has a fresh identity/store; original unresolved scanner evidence and per-job fences remain preserved.
- Observation adjudication separates process termination from domain completion. Persisted-result continuation is allowed only with exact expired claim and managed saved images; an unknown paid job keeps its fence.
- Canonical runtimeRecovery is a journalled extension; original plan/acceptance/history remain intact. Release stays CLEANUP_PENDING while historical drain or any user result remains unproven.

## Concentrated tests (local)

6 observation-policy tests, 17 supervisor tests, 4 persisted-parent receipt tests, 2 rollback tests, 9 host gates, existing 23 Node Worker/control tests and one real process crash/restart test passed. Includes unknown persistence, exact boot/revision idempotency, failed readiness, intentional stop, operator drain, restart budget and target drift.
Actual live results follow. Fixture/source rollback is separate from the live operations rollback; neither claims to restore a historical business image or database.

## Rollback semantics

Disable only the new supervisor timer/service; pause successor Worker through its current exact authenticated boot/revision. Preserve original unknown Worker and its receipt. Do not resume that Worker, lower live RAM to the OOM limit, undo completed user work, restore business DB or replay a supplier request.
An application rollback uses the unchanged fixed production image and current 2GiB minimum; historical 896MiB identity-pinned rollback is not accepted as current recovery.

## Coordination

origin/main refreshed to e997b290; unrelated new UI/video/lightbox changes are not part of this runtime-only repair. Later feature deployment must separately integrate accepted branches and retain shared uncommitted admin work.

## Live closure (Beijing 2026-10-17 10:21)

- Emergency Web remains the same container, same image, same 09:32:53 boot; no additional restart. RAM cap 2048MiB, current1123MiB, peak1172MiB, new-boot cgroup oom/oom_kill=0, host MemAvailable4383MiB.
- All changes used the three original host locks. An overlapping supervisor run deferred to the lock; acquisition failures caused no mutation and no lock bypass.
- One unrouted, same-image Web probe was actually SIGKILLed, automatically restarted, checked against DB/existing login/projects/canvas, opened on a new boot, then drained and stopped. Initial test failures (state mount review and Docker mount-array ordering) were corrected before enrollment. Online Web stayed unchanged.
- Process-observation operation d7eee332-91b0-4578-9fed-08338ad51b00 closed only three dead-process scanner/continuation observations, not business outcomes. The unknown paid job retains its original activity fence.
- Original child job-a239a3df… finished from its already-persisted result. Original media4096x4096,16,833,862 bytes,SHA256 0cb1f07d8cd57f39abe804731c25dcbb394d392c510ed57e0c400edac1fd7396 remains unchanged. One artwork, one supplier call and one ledger entry. A newly exposed existing12MiB receipt-input limit rejected the16MiB original; after full Sharp decode, exact owner/plan/settlement and no-transform checks, its parent receipt was corrected by CAS. Authenticated public `/api/imagegen` now returns succeeded,1 artifact,12 charged credits; actual private-media GET bytes/hash match. No new charge or generation.
- job-d2c9a9c0… has one response-received supplier call, but no durable output bytes/task ID. It and its parent now explicitly show needs_attention; billing is hold,0 charge/refund entries; original paid intent/lease/fence remain. User-visible message says original output needs checking and will not be submitted/charged again. **This one user result remains unresolved, not recovered or refunded.**
- Handoff0497b6eb-7151-4a43-828d-2275a2488b69 archived the original unknown Worker store byte-for-byte. The old scanner is gracefully stopped (exit2 accurately denotes UNKNOWN). Its original running tick receipt9fb445c5… stays unchanged. Successor92d7e0e308a7… has fresh scanner identity/state and the same14a8d2ab… image as Web. This is a new periodic scan, not a rePOST of the interrupted tick or permission to retry paid jobs.
- Actual production supervisor rollback was executed: timer disabled, successor authenticated/drained, Web unchanged. After a clean-tick drain, successor alone was SIGKILLed, timer re-enabled; systemd started the exact same successor container, new boot5b3390df-17aa-465b-a5e0-97a268a31787, resumed it without uncertainty and obtained completed server receipts. No original unknown state was cleared.
- Root-only immutable host kit `/opt/naumi-staging/releases/recovery-supervisor-20261017-v2`, systemd `naumi47-recovery.timer`,20-second inactive interval, enabled+active. Policies deliberately remain Docker restart=no: the checked host supervisor handles crashes instead of blindly reopening admission. Clean manual stops and same-boot drain/pause are respected. UNKNOWN remains paused and requires exact incident adjudication. Three attempts/hour and physical RAM gates bound restart loops. Host reboot behavior has fixture coverage, not an actual production reboot test.
- All eight previously stopped historical slots now also have restart=no. No container/image/volume/DB/media was deleted. Stopped probe and original Worker remain rollback/incident materials, not extra running services. Exactly7 running containers:1 Web+1 Worker+5 infrastructure.
- Canonical revision40, original plan hash/acceptance preserved; current running identities rebound through runtimeRecovery. Phase remains MIGRATED_CLEANUP_PENDING: historical full drain proof and the one missing paid output are not fabricated as COMPLETE. Current ops rollback passes live identity checks; historical896MiB/stale-boot rollback is not represented as usable.
- Public version/health/existing session/projects/Skills/canvas200, parent owner receipts200 and anonymous401. Final exact output: `FINAL_WEB_WORKER_RECOVERY=PASS PUBLIC_OWNER_RECEIPT=PASS ORIGINAL_MEDIA_SHA=PASS SUPPLIER_REPLAY=0 UNRESOLVED_PAID_OUTPUT=1`.

## Current versions and evidence

Business code7bdcd8b644e8771646003f68055585f257df40f0; build1792146767/v2026.10.16-183247; image sha256:14a8d2ab2c76068569a8c9fe9dde81fc581166f9d108e8dbf8b347ca09cd7375. Runtime supervisor code is separate from the business image. No feature publication or model-config publication was performed.
Supervisor source SHA25691b2b2f1410e91434c39548e3453fd024e7cbcde707b69c7fa0410007bb0b539; current rollback source SHA2565b3bebee41c70aae0b1c565211d07551091b544beab4620c33b6c4968a5f7c29. Both compared with installed files and reopened.
Local evidence `E:/Workspace/naumi/output/server47-recovery-completion-20261017`; remote private evidence `/opt/naumi-staging/evidence/release47-window-20261016-main7bd/recovery-completion-20261017`. Public sanitized final receipt FINAL_RECOVERY_COMPLETION.json. Raw job payloads and frozen credentials remain private on the host, not in Git or the deliverable bundle.

## Remaining boundaries, not hidden completion

1. One supplied image response was lost before its payload became durable. Held for supplier request-receipt recovery; a hash/delivery flag alone cannot reconstruct its bytes. No speculative second request.
2. The general12MiB output-receipt reader defect has a narrow original-task correction here, not a new compiled business-code deployment. A later application candidate should separate trusted generated-output receipt limits from untrusted input limits, with bounded pixel decoding and full blue/green acceptance.
3. Historical rollout remains CLEANUP_PENDING until its original drain invariants can be proven. Supervisor rollback disables automation and pauses the successor; it does not reset canonical history, lower RAM, restore DB or replay tasks.
4. Readiness deliberately uses a private existing authenticated session. Session expiry/revocation fails closed, logged by systemd; its health credential must be renewed before expiry. It is not a permanent hidden account or authentication bypass.
5. Other completed UI/lightbox/model-management branches are registered for a later feature candidate; this emergency did not merge/deploy them or touch shared18 uncommitted files.
