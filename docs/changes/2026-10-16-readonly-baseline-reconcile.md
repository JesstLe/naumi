# Reconcile a failed read-only initial inventory under its original UUID

`MaintenanceSession.dispatch(baseline)` now permits explicit original-UUID
reconciliation only when the durable UNKNOWN operation failed before assigning
`baselineInventory`, therefore before calling the first task snapshot. Both 47
and HK use the same mechanism; no authorization, capacity, plan or request-binding
rule changes.

Required state is strictly NEW and contains only the initial state keys plus
status/lastError. Initial lifecycle fields must retain their exact defaults,
webs must be empty, retired empty, and there must be exactly one operation: the
original UNKNOWN baseline request with expectedRevision=0 and no extra request
fields. Its history contains only same-UUID baseline UNKNOWN rows, with revision
equal to history length+1. INTENT-only crash uncertainty remains refused.

Any `before` or `baselineInventory` key, even null or empty, any worker, backup,
maintenance/freeze/gateway/capacity/acceptance/rollback field, unknown future state
key, created web, changed lifecycle default, extra operation/history action or
partial result remains refused before adapter calls. In particular, a task
snapshot failure has already assigned baselineInventory and cannot rebaseline.

A permitted retry reruns full fresh inventory and then takes the first snapshot,
acknowledging the existing operation UUID. Acknowledged replay remains a no-op.
No canonical journal, UUID, snapshot, or plan is manually patched. Tests exercise
restart/reopen, both targets, snapshot/partial/lifecycle negative cases, wrong
binding/new UUID and explicit-reconcile requirements; no real host is connected.
