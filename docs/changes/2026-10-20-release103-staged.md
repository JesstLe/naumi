# 103 staged release — 2026-10-20

User explicitly re-authorized immediate deployment. Product remains the tested
56aa3233/build1792471620 fixed image, not the ops commit or a copied 47 config.
Fresh103 baseline: 13 containers, old8af8 UI/c05a API, model112/billing8.

## Capacity strategy

Do not lower Web1536/Worker128/media3072 caps or count Swap. The media
container is created stopped, including its private scratch and fixed binding.
Stage1 starts only Web/paused Worker with full2688MiB overlap allowance.
After candidate DB/session/project/UI tests and exact Nginx/static union CAS,
route to newWeb; retire five unreferenced oldUI slots gracefully. Re-read
MemAvailable and measured Web/Worker resident anon+shmem, subtract only those
already-resident pages from full5760MiB budget. Only a passing full remaining
budget permits media start. Failure restores retained oldUI before inverse
Nginx reload. This staged process is not a claim that video requests during the
short media-unstarted transition have been exercised without interruption.

## Existing uncertain work

Two Oct15 parent/child operations still cycle in old API/Worker. Do not start a
second scanning Worker or reset them. Keep old API/Worker until real handoff
proof or independently reviewed preservation exists. Web cutover may therefore
finish with WORKER_HANDOFF_PENDING rather than invent COMPLETE. Imported
history guards, billing, media, configuration and originals stay independent.

## Evidence

output/release103-staged-20261020. Final facts appended after execution.

## Observed outcome at16:00 CST

Public Web now56aa32336cfdd5ec37a133d02db67d25806c3a21/build1792471620.
Same fixed image38e646... for Web, paused newWorker, isolated media service.
Media real health sandbox=true, draining=false; startup ran sandbox ffmpeg.
Five oldUI slots are stopped/restart=no (CIDs/images retained). NewWeb/media
restart=unless-stopped and signed startup admission=open. Full-cap headroom
recheck5542MiB available versus5441MiB remaining peak incl1024MiB reserve.
Model112/billing8 stayed independent and equal. Real HTTP /api/imagegen/plan
returned200 for gpt-image-2/1K/3:4/medium, eligible platform-images:9ba2827204791ed8,
6credits; no submit or supplier request. Native admin session/project list/API
and all UI surfaces200; anonymous projects401; internal control404.

Final status WEB_DEPLOYED_WORKER_HANDOFF_PENDING, not COMPLETE. Old API and
legacy caller remain together for two October15 unresolved operations; the
new caller is running paused, never resumed. Original task preservation
comparison PASS with0missing/0original supplier mutation/0new original rows.
No original tasks were replayed, refunded or marked recovered.

### Execution corrections kept in original journal

Missing worker descriptor failed before media create. Original acknowledged
image-import/backup were not repeated. Switched-stage retirement initially
rejected its baseline-only gateway CAS; recovery now accepts an explicit
hash-bound staged gateway. An acceptance evidence filename collision then
triggered an inverse attempt: oldUI containers restarted, but gateway hash
check blocked the inverse before any gateway write. That stale-preimage bug
was corrected using saved original bytes. The same original release resumed,
reverified all identities, re-retired those5UI slots, and preserved exact final
new gateway bytes. Errors and failed inverse receipts remain in execution.log;
this is not a claim that a successful live rollback rehearsal occurred.
Real copy-only inverse restoration is separately verified. Actual continuous
public probes cover original version through final version; counts in evidence.
