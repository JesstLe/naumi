# AI Gateway Implementation Plan

> Execution: native implementation in this session, with an independent whole-branch review. User authorized execution on 2026-10-02.

**Goal:** Make paid image routing recoverable, idempotent, request-priced and observable through the existing New API boundary.

**Architecture:** Naumi owns business jobs and product credits. New API remains the gateway. Router owns durable provider attempts and policy.

**Tech Stack:** Next.js/TypeScript, Go 1.25, bbolt 1.4.3, existing provider adapters.

**Spec:** `docs/superpowers/specs/2026-10-02-ai-gateway-design.md`

## Global Constraints

- Never log or commit usable credentials, prompts or reference-image inputs in Router execution records.
- Preserve production settings, databases and media; never enable an unverified provider automatically.
- Ambiguous paid submissions cannot become fresh provider attempts.
- Tests use local fake providers; live paid supplier validation is not inferred from mock tests.

## Review Focus

- Process dies between submission and task checkpoint: same upstream idempotency key or fail closed.
- Concurrent reuse of an operation ID: one executor, different payload conflicts.
- Result-store failure after paid completion: recovery must poll the same task.
- Multipart routing extensions and native resolution must survive New API forwarding.
- OpenAI-compatible providers without documented idempotency must never be resubmitted after ambiguity.

## Task 1 — Durable execution and provider recovery

Files: Router `internal/execution/store.go`, `internal/execution/store_test.go`, `internal/api/server.go`, `internal/provider/{apimart,fal,provider}.go`, `internal/domain/image.go`, `cmd/server/main.go`.

Interfaces: `Store.Load/Save`, in-process operation claim, `ImageRequest.Execution` with attempt key, task ID and checkpoint callback. State is committed before an upstream POST. Completed responses replay. `FallbackSafe=false` yields HTTP 504, never generic 502.

- [ ] Add durable operations, content hash binding and attempts with recoverable provider task identity.
- [ ] Verify duplicate requests, conflicts, restart recovery and unsafe fallback using local HTTP fixtures.
- [ ] Run `go test ./...` and `go vet ./...`.

## Task 2 — Policy, pricing and runtime health

Files: Router `internal/routing/engine.go`, `internal/routing/engine_test.go`, `internal/routing/health.go`, `internal/provider/openai.go`, config examples and API execution.

Price entries match resolution, quality and edit mode. Policy first filters capabilities, then sorts total request estimates. Runtime provider concurrency and circuit cooldown govern eligibility without paid probes.

- [ ] Implement task requirements, price matrices, health and bounded concurrency.
- [ ] Add generic OpenAI Images transport with fail-closed paid-submission behavior.
- [ ] Verify exact route choices, missing price tiers, circuit recovery and concurrency bounds.

## Task 3 — Naumi operation contract

Files: `src/lib/image-gateway.ts`, image generation, suite and A+ transports, `scripts/verify-image-gateway.ts`.

Each durable image operation has a stable ID, sent as `extra_fields.naumi.operation_id` in both JSON and multipart. Router aliases receive explicit requested resolution. Non-idempotent image transports have no blind automatic retry.

- [ ] Pass stable IDs and capabilities through all recoverable image paths.
- [ ] Verify the actual outbound JSON/multipart bodies against a fake provider.
- [ ] Run TypeScript, lint, production build and affected image regression checks.

## Task 4 — Release and review

Files: Router service/compose/release scripts, implementation handoff and production verification records.

- [ ] Add durable state directory to deployment, preserve config, and prepare backup/rollback.
- [ ] Review the complete diff independently and repair findings.
- [ ] Publish fixed versions after checks; validate actual versions, health, state retention and affected requests.
- [ ] If live access is unavailable, report the exact blocker and leave deployable artifacts and review links.
