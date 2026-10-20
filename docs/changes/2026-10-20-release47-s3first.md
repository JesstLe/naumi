# 2026-10-20 47 complete development integration / S3-first candidate

## State
- User requested all development branches merged and released to47, then continued the interrupted run.
- Independent worktree `E:/Workspace/naumi-release47-s3first`, branch `codex/release47-s3first-20261020`.
- Refreshed origin/main `3f940b8618797ddf8a9eddf908b47896f48f2a72`. Integration `fecfff04` includes enterprise workflow, original uploads, Agent attachments, frame selection, feedback, durable queues, NAS tunnel ops and remote-first storage.
- All remote development tips are ancestors. Four explicitly historical `*-rollback-compat` refs remain excluded. Local `codex/backup-4087-before-dock-split` and `codex/canvas-parameter-baseline` are historical baseline/backup snapshots, not unfinished development to replay.

## Integration corrections
- The prior merge typed uploaded assets as CanvasFrameChoice but still accessed sourceWidth/sourceHeight, causing actual TypeScript and Linux Next build failures.
- Copy original decoded dimensions into the shared choice width/height fields, and derive both automatic frame and manual choice from them. Keep upload reference-count/scope guards and explicit resolved ratio before plan.
- Real submitter regression now sends mixed actual File ratios and intentionally square transport metadata. It verifies source consensus3:4 and chosen4:3, without using transport dimensions or changing explicit ratio/fingerprint.
- Add a real storage-module fixture for remote-first success (no local file), local fallback on remote failure, remote-first reads, local compatibility and size/path bounds. This is isolated regression, not NAS/prod acceptance.

## Live preflight, 2026-10-20 20:58 CST
- Three-lock snapshot acquired/released. Canonical revision209, active release47-resolution-20261020 COMPLETE.
- Web/Worker source56aa3233/build1792471620, same image38e64646; no new program candidate.
- Model125/digest5840a02e..., billing8, no inflight configuration publication. This program task does not activate models, change prices or run paid acceptance.
- NAS connection established by prior work. Existing media runner continues unchanged; observed12,000 PUT/~22.67GB, errors/mismatch0. Its HEAD skip is size-only, so it is not full SHA verification.
- Free disk8.3GiB is below the10GiB deployment gate. No business media deleted to manufacture capacity.
- Sixteen orphan process observations belong to boot236cc455, which ended before current07:36:27Z Web start: thirteen pending paid jobs (started, images0, expired matching claim, reservation/hold retained), one media-variant and two reference-sync observations. They are separate from the prior43 isolated jobs. No observation/domain mutation performed; requested explicit user handling for these13 before release.

## Verification and remaining release work
- First integrated TypeScript and Linux build failed on the merge dimension mismatch; original failing logs retained.
- After correction: actual multi-reference submitter46, server plan/FormData70, Agent attachments34, storage20 passed. Remaining concentrated PG/type/build results are recorded in output/release47-s3first-20261020.
- Public candidate note binds this candidate's actual build version; not proof of production publication.
- Pending: finalized full regression/image, disk reserve, authorized handling of new old-boot incidents, three-lock candidate/S3 auth and actual storage byte checks, compatibility and graceful cutover/drain.
- No103/retired-server operations, unknown paid retries, task success reclassification or production config changes in this continuation.
