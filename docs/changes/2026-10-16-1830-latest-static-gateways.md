# 18:30 latest-source47/HK static and gateway preparation

## Fixed inputs and boundary

Source `7bdcd8b644e8771646003f68055585f257df40f0`, build `1792146767`.
Main image `sha256:14a8d2ab2c76068569a8c9fe9dde81fc581166f9d108e8dbf8b347ca09cd7375`.
HK unified image `sha256:8f2507908de464e2be5acf03d4d6f536e074fd8f5d08e7ba9c77068c6687d073`.
Both compiled root assetPrefix. The backend agent owns their actual Next QA;
this task proves local static/config bytes and Nginx routing, not production
Next/database acceptance. No production connections, canonical-session changes,
main changes, paid calls, or candidate image startup by these preparation tools.

Root independently confirmed47 fresh live full-T
`f854851f4c836f2bd4e12425e5ea0944c23c9fd44a7021fa81912b00f37a97e8`
and all4 exact disk configs/realpaths equal the captured source. HK baseline is
the actually applied static-live full-T
`fa9ecb10fb1a527a1363008ff3c08920b18ebc7d717b69c3a70d9ac372d31c6e`.
Historical original65-route inventory is deliberately NOT used to render latest
HK. New renderer accepts only reviewed51 static-live route classes, no named
fallback/interception, three old disk aliases and unchanged Fleet/deny/TLS.

## Implementation

- `prepare_latest_release_assets.py`: inspect fixed image env source/build,
  create stopped owned container, copy static and compiled prefix metadata,
  remove stopped container, verify every prior union byte, conflict-check merge
  candidate root URLs, materialize and reopen every final byte. Public manifests
  contain no local source paths/private config.
- `prepare_latest47_gateway.py`: explicit fresh full-T+all exact files+realpaths,
  reuse strict reviewed47 routing policy/maps/17847 preservation, four linked
  CAS transitions, exact original-live rollback.
- `prepare_latest103_gateway.py`: direct51-class static-live renderer; suffix
  rewrite/identity policy and centralized enterprise API match reviewed candidate
  policy. Four CAS states roll back tofa9e, never resurrect historical fallbacks.
- `verify_latest_gateway_package.py`: bounded Linux Nginx128MiB plus synthetic
  backend128MiB, exact real paths/symlinks, production cert paths with generated
  fixture cert, worker_processes1 only. Five actual graceful transitions verify
  complete before-T+all disk preimages, exact after-T, syntax and routing.
  Executable ROLLBACK.sh runs on another copied Linux tree; modified artifacts
  remain changed. No actual candidate app is started.
- `seal_latest_gateway_package.py`: public allowlist is static, descriptors,
  manifest/hash inventory and validation result only; all actual config bodies
  go into private archive. Generated fixture cert/key and copied config scratch
  are excluded. Every tar member is reopened/hash-checked; both archives are
  extracted together in a temporary directory and all descriptors/records re-read.

## Completed concentrated evidence

`python -m unittest discover -s scripts/ops -p test_latest_gateway_offline.py -v`:
5/5 pass, exit0. It rejects original65/stale/changed static-live/invalid origins
and compares new candidate+maintenance directive semantics to reviewed originals.

`python scripts/ops/verify_latest_gateway_package.py --package <47 package>`:
`BASELINE=PASS TARGET=47.105.59.142 FULL_DUMP=EXACT DISK_CLOSURE=4 SYMLINKS=PRESERVED`
`LATEST_GATEWAY=PASS TARGET=47.105.59.142 STATIC_HTTP_HASHES=1029 TRANSITIONS=5 FULL_DUMP_DISK_CAS=EXACT SYMLINKS=PRESERVED`
Exit0. Old721 static URLs retained,308 new URLs,1029 total; conditional legacy17847
and nv_user/wb_session login maps retained through maintenance and rollback.

Same command for HK:
`BASELINE=PASS TARGET=103.30.76.93 FULL_DUMP=EXACT DISK_CLOSURE=3 SYMLINKS=PRESERVED`
`LATEST_GATEWAY=PASS TARGET=103.30.76.93 STATIC_HTTP_HASHES=3334 TRANSITIONS=5 FULL_DUMP_DISK_CAS=EXACT SYMLINKS=PRESERVED`
Exit0. Old3027 retained,307 new URLs; root1678/desktop670/enterprise986.48 retained
dynamic classes checked per state; Fleet13062/denies preserved and new identity
headers applied only on candidate routes. Both fixture container pairs removed.

Actual separate-copy rollback command:
`bash /package/gateways/maintenance/ROLLBACK.sh /fixture/rollback-copy`
Literal output on each host fixture:
`ROLLBACK=PASS PATCHED_SOURCE_FILES=1 ORIGINAL_BYTES=RESTORED SYMLINK=PRESERVED RELOAD=NOT_EXECUTED`
Exit0. Live fixture full-T/dynamic behavior ultimately restored to the exact
respective baseline. Four artifacts (MODIFIED_FILE, DIFF_FILE.patch,
VERIFICATION.txt, executable ROLLBACK.sh) in every transition reopened.

## Result locations and exact states

47 root: `E:/Workspace/naumi/output/release47-evening-20261016/final-prepared-7bdcd8b`
- Maintenance full-T `387821eeec4a46977295e74f335d788aeaace8d3aa5ca3c8e4a2487451843410`.
- Candidate full-T `285373f6eb5c10f806e6dd7e2ea71e47f4ef660b1ff72c4a306ca23f2588245f`.
- Deployment tar SHA `c54a89808e9769155ebffd5fb5639bff0e20a173358ee891819c2c2472644502`.
- Private tar SHA `560c5009c51865a7de55d8a99cc531d1a00e9594ff371df141e49af369108ab6`.

HK root: `E:/Workspace/naumi/output/release103-evening-20261016/final-prepared-7bdcd8b-unified`
- Maintenance full-T `bd29eeb21aad0851a21c77ee6612a2fbaa592891ce875fda05dd5caf0a1831c0`.
- Candidate full-T `3ceee772f32d06fcc1765fdd4100834fed75f862e3e797b557a3d14e0c4a316c`.
- Both normal rollback targets remain exactfa9e static-live.
- Deployment tar SHA `0fe8379d07a8b6e951d98ab286203fcac620f4c57fe517dd4a5427eb4cc13d23`.
- Private tar SHA `229cbcdb8c0e011a43d0c476db00471fc5a19e360697d2787f84d897089f4cf8`.

Each root contains `FINAL_PACKAGE_REPORT.json` and `package/gateways.json`.
Each package's `validation/gateway-linux-results.json` and per-transition
`VERIFICATION.txt` bind observed outputs/hashes/paths. Extract each host's two
archives into one separate root. Existing old0614 canonical BASELINED revision2
cannot be repurposed by overwriting manifests; root must create the new fixed
source/image/build session and revalidate fresh live baseline under its locks.
