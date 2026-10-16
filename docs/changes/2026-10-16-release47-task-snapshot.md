# 47 accepted-task preservation snapshot — 2026-10-16

## Delivered module

`scripts/ops/release47_task_snapshot.py` is a standard-library read-only helper.
It does not connect by itself, migrate, claim, submit, cancel, restore or drain work.
The maintenance transaction owner supplies its existing locked transaction's
`run` and private `save` callables and the exact public identity of the DB container.

```python
from release47_task_snapshot import collect_task_snapshot, compare_task_snapshots

before = collect_task_snapshot(
    command=tx.run, db_identity=fixed_db_identity, private_save=tx.save,
    expected_database=None, row_limit=1000,
)
# Caller performs only its separately authorized operation.
after = collect_task_snapshot(
    command=tx.run, db_identity=fixed_db_identity, private_save=tx.save,
    previous=before, row_limit=1000,
)
comparison = compare_task_snapshots(before, after)
```

`previous` must be the `Snapshot` or its private dictionary, not the redacted
public summary. It explicitly retains original IDs after completion. Persisted
private originals must remain in the transaction owner's protected evidence
directory; neither raw rows nor inspected container environment enter public output.

## Scope and consistency

- Exact Docker DB ID, image, running/start identity and restart policy are pinned
  before and after SQL; actual DB name and schema bind the database identity hash.
- Single psql transaction: `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`.
  `lock_timeout=1000ms`, `statement_timeout=5000ms`, idle transaction timeout5000ms.
  Begin/end DB, read-only setting and snapshot token must agree.
- Original nonterminal image/canvas/video/reference/batch/workflow/media jobs,
  billing operations, supplier calls/cost jobs and durable runtime receipts are roots.
- Three directional graph expansions retain related terminal batch children,
  workflow nodes, supplier calls, original supplier accounts, outputs/callbacks,
  workflow runs, reservations, billing reconciliations/reviews, execution stages and
  associated ledger entries. Account IDs do not expand to every unrelated call.
- Original selected rows are private, including frozen payload/provider/capability,
  original supplier account/credential reference, lease and paid-operation fields.
  Whole-table billing/ledger have only count plus SHA256-leaf two64bit-sum summaries;
  original full-table business rows are never exported.
- At most1000 selected rows/table by default (explicit range1..5000); table JSON
  above512KiB exports no rows and marks unknown. Native output cap16MiB.
  SQL errors/timeouts or malformed evidence stop observation without raw error text.

## Comparison and deliberate boundaries

Missing original IDs, changed original supplier identity or frozen context,
mutated associated ledger entries, decreased global billing/ledger counts,
same-count changed global ledger hash, timestamp/terminal regressions are violations.
New settlement rows, newly acquired upstream IDs and paid-operation additions are
allowed if original bindings remain intact. Billing reserved-to-settled state changes
are expected, so same-count billing hash changes are not automatically corruption.
Supplier policy/FX changes and reservation deletion can require manual review;
the comparison does not silently reinterpret missing original rows as successful
settlement. It is a conservative preservation audit, not a migration/restore engine.

Missing optional tables, row/byte limits, duplicate IDs or incomplete selections
remain unknown. Every expected table must be observed for `preservationVerified`.
`noMissingJobs`/`noOriginalSupplierMutation` alone are insufficient because unknown
tables remain separately listed. `drainProven` is always false. Counts, leases or
terminal state do not prove detached App work/Agent execution stopped. This helper
does not establish complete account-wallet conservation or external supplier state.

## Verification

Executed locally only; no47 connection, supplier call or production mutation.

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
python -m unittest discover -s scripts/ops -p test_release47_task_snapshot.py -v
```

15 tests passed, including real SQL in the explicitly named local isolated
`naumi-packaging-skills-pg-20261016` fixture. The test creates/drops only a random
`task_snapshot_test_<uuid>` schema. It confirms no unrelated terminal supplier
account/call/output is exported, original account/outputs follow a terminal call
associated with a nonterminal job, prior IDs remain tracked after settlement,
missing tables remain unknown, oversized rows remain unknown, and business row
count is unchanged by collection. Unit coverage includes schema/limit injection,
read error redaction, ID binding, composite IDs, normal billing settlement,
added paid operations, supplier mutation, ledger mutation and duplicate IDs.

This commit does not install the helper or execute maintenance. The root release
owner integrates it into the independently authorized locked transaction.
