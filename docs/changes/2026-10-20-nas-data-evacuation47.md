# 47 NAS data evacuation — 2026-10-20

## Latest authorization
- User requested all data moved to NAS, then removal of local duplicates on47.
- Treat media offload and a consistent database backup as distinct deliverables. A backup is not a live database relocation; running PostgreSQL/Redis, credentials and current rollback resources are not disposable duplicates.
- Preserve original paid-task receipts and billing holds. No supplier generation/replay, success reclassification, database restore, or model/price change.

## Observed work
- Reuse the existing authenticated NAS Garage tunnel and original migration container `19f0942545ec...`, without restart.
- Original migration copies37,660 files,39,641,836,919 bytes. Its same-size HEAD skip and PUT MD5/ETag are not full readback SHA evidence.
- Add `scripts/ops/nas47-verify-media.cjs`: immutable manifest, original-file metadata checks, streaming signed GET and SHA256, fsynced per-file evidence and atomic progress. Wait for original copy evidence before fetching; source mount is read-only. No local or remote delete in this verifier.
- Fresh manifest has37,666 regular files. Files created since the initial copy require an incremental tail pass; never label the original snapshot all current media.
- Exact verifier container `8afbd5ff9d37...`,192MiB/0.35CPU. First attempt failed EACCES after dropping all capabilities; retained evidence, restarted a new explicit verifier with read-only source plus DAC_OVERRIDE. No broad chmod of source files.
- Real verifier fixture: signed GET, matching bytes, corrupted bytes,404.18 checks pass, all source bytes retained.
- Consistent main database dump434,389,519 bytes, SHA256 `d439175930c09db11a7d5a49a76620280bcfbd729a3095214c71a2115d418033`, actual PGDMP header and pg_restore listing checked. Upload/readback is separate, pending until receipt.
- Initial backup upload mistakenly named a312-byte backup descriptor `.dump`. This is not a database backup. Corrected upload uses `naumi-database-verified-20261020.dump`; old descriptor object must not be used for restore. Do not erase the failed evidence or claim it passed DB verification.
- Hub SQLite online backup220,798,976 bytes and private configuration archive1,434,726 bytes were uploaded and read back with exact SHA. Neither establishes live DB migration.
- New API PostgreSQL consistent dump142,524 bytes, SHA256 `dce95a4f4e803caed61fd502e11c3719567e64933bb7a270d73361a1246dc853`; own NAS uploader started. Live source DB retained.
- Root ext4 reserve adjusted783,061→182,983 blocks(1%) under three locks. Available space8,888,827,904→11,340,349,440 bytes at that observation, zero file deletion/restart. Exact reserve rollback is privately retained.

## Program/cutover boundary
- Refreshed main08ac0bd8 contains a newly completed stored-delivery coordination-pool fix. Existing built da1aaa52 is not that newer source.
- Attempts to build08ac0bd8 failed because local Docker Desktop lost its Linux engine; raw error `DockerDesktop/Wsl/ExecError`, data disk UUID not found. No VHD reset/unregister/delete was performed. This is not an App acceptance result.
- No new47 Web/Worker candidate or gateway cutover in this phase. Old47 remains56aa3233/build1792471620/local storage.
- T3 preview_open returned `The calling provider no longer owns an active thread run.` Do not fabricate browser acceptance or a browser-ready marker.

## Removal gates (not yet satisfied)
1. Complete initial copy, incremental tail and full GET SHA verification; missing/error/mismatch/changed entries stay local.
2. New fixed Web/Worker blue-green uses NAS private proxy, validates existing auth/media and new writes. Old local-only slots must be drained/stopped, with recovery that also reads NAS.
3. Three-lock deletion plan binds exact paths, source metadata/hash, NAS SHA and canonical active release. Retain DB/media catalog, payment history, recent backups, current plus two successful releases and a tested restore path.
4. Remove only exact verified duplicate media, not a directory tree, volume, DB or unknown object. Record each deletion and resulting free bytes. New outage fallbacks remain until separately copied/read back.

## Evidence locations
- Local: `E:/Workspace/naumi-release47-s3first/output/release47-s3first-20261020/`.
- Host: `/opt/naumi-staging/evidence/nas47-full-verification-20261020/proof-r2/` and `/opt/naumi-staging/evidence/nas47-data-backup-20261020/`.
- Credentials remain private; no key or private full config is committed.
- Current result: copying/verifying, **not all migrated, not storage switched, local business deletion0**.
