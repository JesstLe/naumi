"""Adjudicate PROCESS observations, never domain/supplier outcomes.

A retained paid-unknown observation remains a fence. Neither lease expiry nor
a dead process permits a paid retry. The caller proves exact old-boot death
and runs the returned observation-only updates in one transaction under locks.
"""
from release47_host import require


def resolutions(rows, *, old_boot, new_boot, dead_owner, jobs, empty_canvas, supplier_leases):
    require(dead_owner is True and old_boot != new_boot, 'EXACT_DEAD_OWNER_PROOF_REQUIRED')
    result = []
    for row in rows:
        require(row['boot_id'] == old_boot and row['activity_kind'] == 'accepted-work' and
                row['state'] in ['active', 'unknown'], 'ORPHAN_BASELINE_CHANGED')
        scope = row['work_scope']
        if scope == 'durable-image':
            job_id = row['work_key'].removeprefix('generate:')
            job = jobs.get(job_id)
            require(job and job['kind'] == 'generate' and job['lease_token'] == row['claim_token'] and
                    job['expired'] is True, 'JOB_CLAIM_NOT_EXACT_OR_EXPIRED')
            # A result hash alone is not a recoverable result. Only already
            # persisted images permit the normal code's supplier-free branch.
            images = job['snapshot'].get('images') or []
            paid = job['snapshot'].get('paidOperations', {}).get(job_id, {})
            if not images or paid.get('state') != 'done':
                continue  # keep the exact old fence and the paid intent unchanged
            require(all(i.get('id') and i.get('url', '').startswith('/media/') for i in images),
                    'MANAGED_PERSISTED_RESULTS_REQUIRED')
            result.append((row, 'owner-terminated:persisted-result-continuation'))
        elif scope == 'canvas-image':
            require(row['work_key'].startswith('claim:') and row['claim_token'] is None and empty_canvas,
                    'CANVAS_SCAN_NOT_PROVEN_UNCLAIMED')
            result.append((row, 'owner-terminated:unclaimed-scanner'))
        elif scope == 'supplier-scan':
            require(row['claim_token'] is None and supplier_leases == 0, 'SUPPLIER_QUERY_LEASE_UNRESOLVED')
            result.append((row, 'owner-terminated:query-scanner-no-live-lease'))
        else:
            raise ValueError('UNACCOUNTED_ORPHAN_SCOPE')
    return result
