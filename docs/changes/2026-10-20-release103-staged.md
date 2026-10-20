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
