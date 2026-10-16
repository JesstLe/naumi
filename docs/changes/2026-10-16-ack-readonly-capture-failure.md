# Explicitly acknowledge a failed read-only capture without accepting it

The original capture request can be resent byte-for-byte with two control flags:
`reconcile: true, acknowledgeFailure: true`. These flags are excluded from its
original binding; action/UUID/expectedRevision/artifact remain hash-bound and
unchanged. The flag is forbidden on new operations, other actions, absent
reconcile, or any value other than literal true.

Closure requires the original UNKNOWN capture-acceptance operation, phase
CANDIDATES, the latest history row matching its UNKNOWN outcome, all other
operations acknowledged, and no collectedAcceptance, acceptance, acceptedDescriptor,
preservation, activation, gateway-open or rollback/APP-open state. Only four known
GET result failures qualify: HTTP_FEATURE_RESPONSE_FAILED,
HTTP_FEATURE_ASSERTION_FAILED, HTTP_FEATURE_BODY_HASH_FAILED and
HTTP_FEATURE_BODY_CONTENT_FAILED. Transport/process/unknown errors remain blocked.

No adapter or HTTP call occurs. The record becomes ACKNOWLEDGED with distinct
`outcome: FAILED_READONLY`, a failure receipt bound to its original request hash,
`acceptanceEvidence: false` and the original error. Existing request/hash/history
and evidence files remain unchanged; a failure-closure history row is appended.
The return is READ_ONLY_CAPTURE_FAILED, including on repeated original UUID calls,
not ACKNOWLEDGED acceptance or a successful check. Phase stays CANDIDATES.

A corrected immutable specification requires a **new UUID** and its own normal
capture operation. The old artifact is never substituted; no plan/candidate/
production journal is manually edited. Authorization/CAS checks remain active.
Fixture tests cover restart, retained old evidence, failed idempotent replay,
new-spec capture, changed binding/UUID/nonread actions, partial success, other
pending operations, wrong phase, unknown error and missing explicit flags.
