# Task snapshot proof / source audit / 2026-10-16

## Scope and actual result

This change retains root's uncommitted materialized-root SQL optimization and
proof projection, and hardens source-audited preservation fields. Only the snapshot
module/tests and this note are committed. No47/103 connection, publication,
supplier request, transaction claim, database restore or task replay was executed.

Root independently observed the original recursive graph and correlated ledger
EXISTS hit the production5s statement timeout. The retained implementation uses
bounded psql JSON variables and per-table SELECTs in the SAME read-only repeatable
read transaction, hashable ledger semi-joins, noTEMP/DDL and unchanged
1000ms lock/5000ms statement/5000ms idle timeouts. Real host re-observation is the
root release owner's work; local fixtures do not establish production readiness.

## Correctness changes

- Supplier state is NOT IN audited terminal states. `adapters.ts` preserves raw
  supplier statuses, so running/accepted/new unknown states cannot be silently
  excluded by a narrow active allow-list. Terminal delayed-cost calls remain
  selected through actual original cost-job/paid-operation relations, not every
  historical cost-pending row.
- Graph includes cost-job payload.callId, router payload.operation and
  payload.context.operationId, and image snapshot.paidOperations keys. Exact
  terminal supplier calls→original accounts/outputs remain retained. Unrelated
  terminal calls do not expand merely from shared account identity.
- Supplier output `supplier_ref_hash` is retained in proof rows and compared as
  original supplier identity. Task email/owner/user_email and stage wire_model
  enter the private frozen digest, without exporting PII in public summaries.
- Actual reference body and immutable fields of each plans entry enter the digest;
  actual video/canvas parameters (including request, prompt, references, workflow
  encrypted snapshot and unknown/new fields) are now frozen, not just a four-field
  parameter subset. Top-level prompt, input/source artwork, video references,
  idempotency, legacy cost, size/seconds also remain frozen.
- Python full projection and PostgreSQL proof normalization share the same lists
  and are tested against actual SQL, including JSON null/empty values and order.
- Added `led-canvas-image-` association from db.ts's actual legacy/modern settlement.
- Source-catalog-confirmed additive absence retains activeCount=null and explicit
  absence evidence, never drain=0. After an absent table appears, malformed,
  incomplete or over-limit rows remain unknown. tick_id is retained in proof rows.

## Audited progress exclusions (only these)

`payload.cancelRequested`: `imagegen/cancel.ts` sets this after acceptance.

`parameters.submissionState`: `video/cancellation.ts` atomically changes
prepared→sending. `upstreamStarted/upstreamResult/qualityAudit`: db.ts canvas
submission/result checkpoint. `resultAssets/resultArtworkIds/resultMetadataWarnings`
and `resultAssetManifest`: db.ts video completion and video/result-assets.ts.
`acceptedOutputs/preparation`: model-config/apimart-preset.ts and
reverse-hub-images.ts record actual accepted/downloaded outputs.

Reference plans exclude only `state/startedAt/text/error`, written by
reference-workbench/service.ts's claim/executeText result path. Source/annotated,
prompt, settings, geometry, inputs, quote, frozen plan, child/session IDs and unknown
future fields remain protected. New fields require an explicit source audit.

## Deliberate conservative boundaries

Normal reserved→settled billing hash changes are accepted; immutable quote/identity
remains compared. An original reservation row disappearing is still a preservation
violation even when a corresponding settled operation and new ledger row exist.
This is deliberate: automatic wallet/credit-batch conservation is not proven by
these rows alone. Root may perform separate manual audit; this module does not
waive missing rows, forge COMPLETE or call a missing reservation a new submission.

Supplier account credential reference/base URL/protocol are digest-bound. Encrypted
credential row contents are not independently selected here; preservation of the
reference is not proof the underlying encrypted value was unchanged. Full original
business data and credentials remain in root's separately readable private DB
backup. The proof snapshot is comparison evidence, not a recovery/restore payload.
Supplier NULL parameters→first frozen request initialization and clearing a failed
pre-submit request can conservatively require review; no automatic waiver is added.

The allowed catalog-additive set is source-specific (runtime receipts plus this
release's reference/media modules on103), not a generic absent-table escape hatch.
All other missing/over-limit/invalid tables remain unknown. Projection type changes
fail comparison; existing snapshots made with an older frozen digest require a new
paired baseline, not cross-version comparison. `drainProven` always remains false.

## Verification

```powershell
$env:NAUMI_VERIFY_ISOLATED_DB='1'
python -m unittest discover -s scripts/ops -p test_release47_task_snapshot.py -v
```

21 snapshot tests passed, including explicit isolated local PostgreSQL fixture and original
15 tests. Real SQL checks cover bounded roots, missing/additive tables, proof ticks,
paid-child/router/task-job terminal call relations, unknown supplier statuses,
normal completion/cancellation progress, frozen request/owner/plan mutations,
output identity mutation and unchanged business row counts during collection.
Only a random schema in the existing isolated packaging fixture is created/dropped;
no production DB or supplier is used. Snapshot/session/host/worker combined67 tests
passed (one POSIX-only lock fixture skipped on Windows). Full original hash, focused baseline/modified/
rollback commands and literal outputs are preserved in the task's ignored evidence.

Minimal session invocation remains:

```python
collect_task_snapshot(tx.run, fixed_db_identity, private_save,
    previous=before, row_limit=5000, projection='proof',
    allow_absent_tables=ADDITIVE_TABLES)
```

The root owner's session-only parameter change remains separate/uncommitted by
this subtask. Proof baseline alone never substitutes for a readable complete backup.
