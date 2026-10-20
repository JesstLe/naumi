# 103 synchronization / historical UI maintenance — 2026-10-20

User request: `也同步更新一下103服务器`; maintenance answer:
`直接删了就行，历史那些好久不用了`.

## Baseline and boundary

103-only. Fresh public source 8af8ee6 / build1791975598, 25 running
containers, about 2.7GiB MemAvailable. Two original deployment locks apply.
Independent DB/config/billing/media remain on103; no47 runtime data copied.
The fixed verified program image56aa3233/build1792471620 is reusable, but103
deployment is not yet performed. Seedream configuration stays separate/HOLD.

## Historical cleanup module

12 exact pinned historical UI containers passed fresh Nginx, Docker, network
alias and effective systemd reference checks; connections and active DB calls
were zero at the audit. Live ports13012/13027/13038/13039/13040/13041/13062 and
all infrastructure remain protected. Unknown historical process-memory work is
an explicitly accepted maintenance limitation, not a complete-drain receipt.

The new operator module backs up DB readably, saves private inspect/config,
checks each target again twice, stops gracefully without SIGKILL escalation,
commits its writable layer to a retained rollback image, saves stopped-container
recreation spec, and removes only that stopped CID without `-f` or `-v`.
No image/volume/database/media removal or paid task replay exists. Recreating
historical containers defaults to stopped/restart=no; resuming unknown old
autonomous work requires separate review.

Execution, capacity result and subsequent candidate/cutover evidence will be
appended after actual observations. This document does not claim deployment.

## Actual completion at 13:57 CST — cleanup done, application NOT deployed

- Deleted 20 obsolete UI containers: 12 had been running; 8 were already
  stopped. All retained original/snapshot images, bind-mounted DB/media and
  private recreation specs. Twenty real stopped-container rollback-copy checks
  passed; none of the copies was started. Running count is now13, down from25.
- The first stopped-container pass held before any service mutation because
  port13015 has a read-only one-off program overlay. It was explicitly reviewed
  and SHA-bound, preserved privately, and accepted in the revised pass. Original
  rejected plan/evidence remain intact. No arbitrary overlay was ignored.
- Readable pg_dump backups: 32,933,568 and32,934,647 bytes, each reopened using
  pg_restore --list; neither was restored. Nginx and canonical state SHA remain
  exactly fa9ecb10... and8471569f... respectively. All13 protected original
  container identities/image/StartedAt/restart policies remain unchanged.
- Final MemAvailable4804.859375MiB versus unchanged full dual-slot budget
  5760MiB (Web1536 + caller128 + isolated media3072 + host1024). Shortfall
  955.140625MiB. Disk free60,794,499,072 bytes. Status is
  `NOT_DEPLOYED_MEMORY_GATE`; no candidate/import/reload/live-slot stop occurred.
  Recommended next capacity change: add2GiB RAM, then refresh capacity/ownership
  and perform the complete103-specific blue-green transaction. Swap is excluded.
- Public source remains8af8ee6ee83579fed34a01ac5db86326f9602e3e/build1791975598.
  Main/desktop/enterprise/team/canvas/health/version/session returned200;
  unauthenticated projects and Fleet status returned401. This is availability
  and auth-boundary checking, not authenticated affected-feature acceptance.
- Independent103 config isv112/billing8, not47v123. Task proof projection is
  complete:11 nonterminal image records (9pending/2needs_attention),26billing,
  158supplier-call and4cost-job records. These categories overlap and are not
  added into a job total. Full projection initially exceeded its byte bound;
  original result is retained, proof projection passed with original full rows
  in readable dumps. No historical job reset/replay/isolation was performed.
- Operator supplier calls0; no other server operated. Seedream activation was
  not performed. Legacy session/Worker ownership still needs review before the
  future migration; database nonterminal counts are not a process drain proof.

Local evidence: `output/release103-resolution-20261020/FINAL_STATUS.json`,
`TASK_PROOF.json`, `VERIFICATION.txt` and four artifacts. Host evidence:
`/opt/naumi-staging/evidence/release103-resolution-20261020/`.
Maintenance code is task-branch-only; no change to old operator authorization,
product source, shared checkout, main or application release status.
