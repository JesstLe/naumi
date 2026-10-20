# 47 APIB Seedream configuration publication — actual partial result

## Scope and fixed runtime

User requested Pro as an existing-model standby plus four independent Jimeng
versions. This was configuration only: no application candidate/deploy/restart,
no103 operations, no submit/generation, no paid tests or paid health probes.
Web/Worker remain56aa32336cfdd5ec37a133d02db67d25806c3a21/build1792471620,
same image38e64646c4d68850ec4791a2708553ebf753602f9dedda7a16b9034d20e49078.
787 compiled server JS files matched byte-for-byte between the fixed local image,
running Web and running Worker. Three normalized runtime source hashes were
regenerated from that build source, not copied from old recipeR2. Nginx and
canonical revision209 stayed unchanged; active program release is COMPLETE.

## Real transactions

All operations used the same three47 deployment locks and model/billing CAS.
Fresh baseline was modelv123/digestb2a690938f291c005c814876ba05161539f76ab066094424fb13c11219b8607d,
billingv8; reserved UUID was confirmed absent and no publication was in flight.
Readable pg_dump backup was saved before publication.

1. Original55-delta PLAN/APPLY/VERIFY completed:
   publication01cf62df-1474-4e98-b3af-8cadd978173b,
   v123->124, phase=`applied`, digest
   e78810bee2bf9b18f802d42145ffb70a39575d490f58f4bf8a4be8c21dc6ff61.
   Six actual public HTTPS plan requests succeeded. Atv124, Flash requested4K
   planned effective2K with12credits unchanged. This was NOT paid output proof.
2. Actual negative public plan tests exposed an admission gap: existing Pro
   rejects11 references with409, but the four unverified direct public models
   accept11 with200/eligible. Their real adapter correctly rejects>10 before
   upload/submission (local PG/adapter regression), so the planner could promise
   a task that later fails. Four independent versions do not pass acceptance.
3. A configuration-only single-source supplierRouting experiment was checked
   locally, never published: it enforces reference count but current catalog
   suppresses the per-model ratio fallback whenever supplierRouting exists.
   That alternative failed the ratio/catalog check and was discarded. No
   product source was modified to hide either failure.
4. A new selective rollback publication inverted exactly44owned fields while
   retaining11Pro fields/routing:
   37d6fdda-7547-4ddc-84c4-44ab86158444,
   v124->125, phase=`applied`, digest
   5840a02e40be4ddbf3db47dbab9e9febd29532c38048116d659524677ded1b78.
   Pro public/primary/standby rows remain unchanged from124. Other providers,
   upstreams, business/defaults, billingv8 and prices match the baseline.

## Final status at14:28 CST

`PARTIAL_APPLIED_PRO_STANDBY_ACTIVE_FOUR_MODELS_HOLD`.

- APIB seedream-5-0-pro is a standby on existing jimeng-image-5.0-pro. Original
  primary, priority, default and selling prices remain unchanged. verified=false.
- APIB supports only documented1K/2K and6admitted ratios here. Original Pro
  frontend still exposes1K/2K/4K and8ratios. Actual4K plans include original
  local-jimeng-50-pro only; do not claim APIB native4K or automatic per-channel
  4K failover from this configuration publication.
- Four new public models were removed and their upstreams restored disabled:
  4.0/4.5/5.0Flash/5.0Lite. Their11pixel conflicts remain HOLD. No mask,
  transparency, extra references, procurement price or capability verification
  was invented.
- Final actual public HTTPS plans:3tiers*8ratios=24/24HTTP200. APIB eligible on
  1K/2K for21:9,3:2,4:3,1:1,3:4,2:3.16:9/9:16 use original primary.4K uses
  original primary,12credits.10references passed with APIB eligible;11returned
  409IMAGEGEN_NO_CHANNEL. Existing real partial-alpha1500x1500 image used as a
  valid mask also returned409IMAGEGEN_NO_CHANNEL. No new media uploaded.
-43quarantined old image jobs remain needs_attention/unsettled. No replay,
  settlement, refund or lease reset. Operator supplier calls0; other users'
  concurrent generation is not claimed0. No pending configuration publication.
- Earlier runtime health tests and local simulation are kept separate from
  public plan acceptance and paid supplier execution. Paid acceptance remains
  PAUSED_BY_USER. No program modification/deploy was done for the reference gap.

## Operator tooling and limitations

The new host operator pins current successor, full Web/Worker identities and
compiled code, installs private immutable /tmp administrative bundles, executes
versioned publication, exports receipts, and uses only public GET/plan for
acceptance. Final source adds mandatory negative-reference gating so future
invocations do not label this gap complete. The initial live invocation ran the
pre-negative-gate operator; negative tests and partial rollback were separate
held-lock follow-up operations, not retroactively represented as automatic.

`seedream-partial-hold.mjs` inverts only44owned fields, rejects changed owned
fields/dependencies, and preserves later unrelated labels/weights and Pro
routing. Its copy tests passed, as did7host-operator tests and the existing
42-case PG/adapter/publication/unknown-idempotence/selective rollback suite.
Full tsc result and final artifact hashes live in VERIFICATION.txt.

Fix needed before re-enabling four models: enforce documented reference count
for unverified direct image sources in planning without losing per-wire catalog
ratios; integrate and validate in a separately authorized program release.
Do not simply set verified=true or change existing Pro/public prices.

Local evidence: output/apib-seedream-publication47-20261020/.
Private host evidence: /opt/naumi-staging/evidence/apib-seedream-publication47-20261020/.
No internal status is added to public release notes.
