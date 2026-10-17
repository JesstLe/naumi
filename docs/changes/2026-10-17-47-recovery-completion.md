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

6 observation-policy tests, 13 supervisor tests, and existing 23 real Node Worker/control tests passed. Includes unknown persistence, exact boot/revision idempotency, failed readiness, intentional stop, operator drain, restart budget and target drift.
Live side-slot crash/restart, actual task continuation, successor tick receipt, systemd timer and rollback-copy verification are pending until recorded below. No test result implies deployment.

## Rollback semantics

Disable only the new supervisor timer/service; pause successor Worker through its current exact authenticated boot/revision. Preserve original unknown Worker and its receipt. Do not resume that Worker, lower live RAM to the OOM limit, undo completed user work, restore business DB or replay a supplier request.
An application rollback uses the unchanged fixed production image and current 2GiB minimum; historical 896MiB identity-pinned rollback is not accepted as current recovery.

## Coordination

origin/main refreshed to e997b290; unrelated new UI/video/lightbox changes are not part of this runtime-only repair. Later feature deployment must separately integrate accepted branches and retain shared uncommitted admin work.
