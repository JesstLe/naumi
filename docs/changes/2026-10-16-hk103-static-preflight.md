# 103 static-only preflight (offline verified)

## Implementation

`scripts/ops/release103_static_preflight.py` builds two exact-CAS gateway bundles
from the reviewed original complete nginx-T and all three exact disk files. Only
the site file changes. Three more-specific `/_next/static/` namespaces alias the
real final0614 unified3027-URL disk union. Seventeen known named static fallbacks
and nine surviving page/Next references retire. Every surviving dynamic
proxy_pass, suffix rewriting, identity header, timeout, Fleet, deny and TLS
directive stays byte-identical. Dynamic404 now stays on its original backend
instead of traversing the retired chain; this difference is intentional.

Both descriptors include a complete three-file before closure, a one-file after,
full before/after dump SHA and fresh-realpath mapping. Existing HostTransaction
must preserve `sites-enabled/default -> ../sites-available/default`, perform
fresh full-T+disk CAS, syntax, smooth reload and final acceptance. This module
does not connect to hosts or install anything.

## Concentrated acceptance completed

Command: `python scripts/ops/test_release103_static_preflight_nginx.py`, exit0.
Actual Linux Nginx1.27, bounded local mock backend128MiB and Nginx128MiB. Synthetic
TLS fixture at original paths, local www-data and worker_processes1 are the only
fixture adaptations. Real Linux symlink was retained throughout.

- Baseline:48 retained dynamic classes,96 HTTP+TLS probes; actual full nginx-T
  matched captured source after the documented worker-count-only adaptation.
- Modified:all3027 real HTTP bodies matched manifest SHA+size; all96 dynamic
  backend/path/header/status responses equaled baseline. Three missing static
  files returned404; three directories returned403.
- Rollback:actual executable ROLLBACK.sh ran on another copied Linux tree; exact
  original site and full dump restored, all96 original dynamic responses matched,
  symlink retained. Candidate artifacts remain changed.
- Negative checks rejected changed dump and exact-file CAS. All descriptors and
  artifact files were reopened and hashes verified.

Evidence root (ignored, includes captured configs):
`E:/Workspace/naumi/output/release103-evening-20261016/static-preflight-0614-20261016`.
`results.json` and each bundle's `VERIFICATION.txt` contain literal outputs.

Before full-T: `10cda9f769a1696f237d4beb9e1ecc141168ffc9d9612fac9b59039b177193d9`.
Static after full-T: `fa9ecb10fb1a527a1363008ff3c08920b18ebc7d717b69c3a70d9ac372d31c6e`.
Static after site: `0b13609cbc9fcf30a0f26bafeb44820c2c43e26bceb54796bfeb84fa0814fd12`.

## Follow-on release boundary

Old final0614 maintenance/open/rollback descriptors use the original baseline and
must NOT be applied after static preflight. Rebase their before closure onto the
static after state; candidate/maintenance after bytes remain reviewed originals.
Subsequent candidate rollback must return to static preflight, not resurrect the
retired fallback chains. Original static-preflight rollback is valid only while
all historical backend dependencies remain available/restored and the lock owner
verifies them. Static removal alone does not prove old Agent sessions are drained.

No production connections, supplier calls, DB restoration or task replay occurred.
Actual Next/DB functional acceptance and production release are not implied.
