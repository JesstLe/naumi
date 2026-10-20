# NAS47 preparation / 2026-10-20

User delegated NAS, gateway, migration and eventual47 cutover to this thread.
103 remains independent. No paid generation or task replay is authorized by
this storage operation. No application storage switch occurred in this run.

## Observed baseline and completed preparation

- DSM DS423+/J4125/2GiB,6.35TiB free. Existing Garage2.4.1 healthy single node,
  existing naumi-media bucket and container preserved. Both SATA SMART PASS,
  zero reallocated/pending/uncorrectable sectors; Btrfs I/O/corruption counters0.
- Volume attention/disk_power_abnormal persists. Existing messages include old
  IDENTIFY I/O events; this is not clearance of the volume warning. No scrub,
  filesystem repair, reboot or unmount was performed on the shared NAS.
- Temporary DSM SSH enabled for inspection and scoped preparation, host key
  pinned. Final SSH disabled as originally configured; Telnet stayed disabled.
- Old NAS supervisor still targeted deprecated101. Exact old supervisor stopped,
  original scripts copied privately, .disabled marker prevents hourly watchdog
  from restarting that deprecated route. Operator did not connect deprecated101.
  This intentional retirement is NOT undone by the networking rollback.
- New isolated empty Garage bucket naumi47-media-20261020 and scoped key created.
  New NAS private key stays in root-only .gateway47-20261020. After execution
  was blocked, new S3 RW grant revoked; empty bucket/key retained inactive.
-47 current56aa3233/build1792471620, model/billing not modified. Canonical209
  and Nginx395a0b1c... unchanged.37648 media files/~39.64GB, disk free5.6GB,
  below the future deployment10GiB gate. No cleanup or migration was performed.
- Dedicated unprivileged47 account with exact loopback-only forwarding rule
  was prepared under three locks and sshd syntax checked/reloaded. No reverse
  listener or tunnel session was established. Private key never copied to47.

## Execution gate and verified rollback

The tool rejected the NAS systemd reverse-tunnel startup transaction with raw
result `rejected: blocked by policy` before execution. No transformed command,
alternative transport or alternate tunnel was tried to evade this decision.

The unfinished security-sensitive network change was reverted under47 three
locks: original sshd bytes SHA233de7bf... restored; newly created authorized key
renamed disabled; sshd syntax/reload passed. Unprivileged empty account retained.
New NAS bucket RW permission revoked. New systemd unit was confirmed absent.
NAS SSH disabled and logout confirmed. Existing Garage remains healthy/running.
All47 routes and local storage remain original; no103 operations, application
restart, new app candidate, media deletion, DB restore or paid replay occurred.

Status: PREPARATION_PARTIAL_NETWORK_EXECUTION_BLOCKED.
Unfinished: permitted always-on connectivity, S3 protocol/application E2E,
capacity cleanup, full SHA media copy/incremental reconciliation, blue-green
storage candidate, old-slot drain and production storage cutover.

## Evidence

output/nas47-cutover-20261020, including real network rollback receipts,
NAS terminal restoration, original/candidate sshd preimages, immutable changed
candidate artifact and executable copy-only rollback. No password or secret
access key is included in tracked files or evidence packages. The private key
and new inactive S3 key reside only on NAS in root-only preparation directory.
