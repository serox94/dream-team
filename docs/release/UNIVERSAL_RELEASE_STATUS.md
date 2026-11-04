# PR #28 — release, recovery and monitoring evidence

No production deployment or production migration was executed. The existing controller and adapter are extended; historical PR23 operators remain separate.

## Diagnosed failures

The original run `41874304542` recorded three PRECHECK `CLOUDFLARE_ACCESS` errors without HTTP/Cloudflare codes, and one completed scenario. Those numeric fields were discarded by the original reporter and cannot be inferred later. The user reported 9/10 D1 databases: four parallel scenarios each allocating two databases were incompatible with that available capacity. This was a construction defect, not a confirmed explanation of every API failure.

A read-only [retained-artifact diagnostic, run 41885865689](https://github.com/serox94/dream-team/actions/runs/41885865689) recovered the actual later failure from run `41882379305` (`d7bc318`): **HTTP 429, Cloudflare 7429, POST_D1**, stage `UPLOAD_DISPOSABLE_WORKERS`. This separately confirms throttling. The diagnostic has Actions read permission and no Cloudflare credentials; it emits only safe error fields.

## Capacity, request budget and cleanup

- A full inventory precedes allocation. At ten databases the test blocks without creating or deleting anything. An existing same-name database is never adopted.
- All four scenarios share one newly created, run-scoped D1 database. The D1 job uses one concurrency group across runs. Independent Issue verification can run in parallel.
- Source checkpoints are captured and restored into that same **owned synthetic test database** before/after rehearsal. No historical database is reset, reused or deleted.
- The Cloudflare client spaces requests by at least 500 ms (at most 600 calls per five minutes). Cloudflare documents a [shared limit of 1200 API calls per five minutes](https://developers.cloudflare.com/fundamentals/api/reference/limits/). Remaining budget is left for other clients; it is not a guarantee about their traffic.
- Verified read-only D1 queries can back off twice after HTTP 429, honoring Retry-After and a bounded wait. Longer server cooldowns fail closed without an early request. Transport errors and mutations, including migration and restore batches, are never blindly replayed.
- Owned recovery operations group up to 16 reads or 20 intact write statements, with SQL byte limits and individually bound long values retained. No trigger SQL is split. Schema, every table's rows, sequences, foreign keys and integrity are still verified.
- A successful-create receipt records exact database identity and attempted Workers. Both normal `finally` and a separate `always()` step clean only those resources and verify deletion. The independent cleanup has its own time budget. A hard runner loss still requires reviewing that receipt; there is no historical-resource sweep.

A superseded unbatched run `41887056024` was cancelled with exact run/commit/workflow/branch guards; [control run 41889313076](https://github.com/serox94/dream-team/actions/runs/41889313076) confirmed **owned cleanup PASS**. Its one-time write-capable control workflow was removed after execution.

## Future production adapter — implemented, not invoked

`productionCloudflareAdapter()` is a library factory in the existing `cloudflare-isolated-adapter.mjs`. No CLI, schedule or deployment workflow invokes it. It is disabled before provider access unless explicitly enabled with fresh authorization.

A future operator supplies an immutable plan, active source UUID/build, target and compatible fallback UUID/build, expected account, one owned recovery D1 database and isolated candidate/fallback versions, plus the existing private media recovery gateway. Production and recovery databases must differ. The isolated entry point cannot enable production mode or reset production data.

Both approvals are required:

- `RELEASE:<candidate SHA>:<operator SHA>`.
- `PRODUCTION:<candidate SHA>:<operator SHA>:<source UUID>:<target UUID>:<production D1 UUID>:<source schema>:<target schema>:<migration SHA256 or none>`.

Preflight checks current main/operator/manual-run context, successful candidate validation and an isolated drill on the exact operator, competing operations, build triggers and deploy hooks. Source schema and the full migration registry are checked against immutable source Git contents, including historical source versions without APP_SCHEMA. Target/fallback versions declare compatibility. A schema-changing production plan supports one additive step and verifies its SQL digest against the candidate's migration file. D1/R2/auth/AI/assets binding drift is rejected. Direct mutation methods cannot bypass preflight.

The write barrier remains through checkpoint, rehearsal, migration and recovery. Production checkpoints round-trip through private R2. Candidate/fallback HTTP and auth checks run on the owned restored database. Source data is never reset: original rows/columns must remain intact except release-state settings; partial migration or failed recovery retains maintenance. Only approved versions can activate, source/checkpoint state is rechecked, and reopening verifies login/API behavior, reinstating maintenance on failure. R2 media recovery reuses the existing private gateway with exact binding checks. This D1 drill has no R2 binding and does not claim a new live R2 end-to-end trial.

A rollback after a completed release is a fresh code-only plan to an approved previous version compatible with the **current** schema. It requires new approvals/checkpoints/rehearsal; it never downgrades the database or reuses an old consent. A future caller must use the existing `dream-team-production` concurrency group and deliberately dispose of its own recovery resources.

## Monitoring and actual alert verification

Backup freshness, login HTTP, runtime error aggregates and active deployment are checked independently. Missing telemetry fails explicitly. Incident Issues are deduplicated by workflow and resolved after recovery. Foreign-repository/non-main workflow-run events cannot create production incident alerts. Scheduling changes become active only after merging.

Real testing exposed immediate list-read inconsistency: after creating an Issue, a following list lookup could miss it and create a duplicate. The client now retains the POST receipt, verifies title/bot identity before direct updates and closure, and disables cached reads. Both normalized GitHub Actions bot login forms are supported. Test cleanup closes only bot-owned verification Issues backed by this exact workflow's failed/cancelled run or failed verification job; human and production incident Issues are excluded.

[Run 41885272073](https://github.com/serox94/dream-team/actions/runs/41885272073) actually completed **CREATED → UPDATED → RESOLVED**, read back closed Issue #35, and cleaned prior failed tests. Later verification also passed for Issues #37 and #38. No open verification Issues remained in the public repository check. This proves GitHub Issue delivery and lifecycle, not email subscriptions.

## Validation

- Local full suite: 370/370 passed, including read-batch and write-replay safeguards. Workerd/Miniflare exercised restore, actual migration 31→32 and resetting the same owned D1. These local results are not substituted for cloud results.
- Worker dry-run build passed; no production deployment was performed.
- Real Cloudflare runs `41879320051`, `41883004792` and `41885272073` passed the four release/recovery scenarios and owned cleanup before the final batching change.
- Final rate-limited/batched [cloud run 41888354094](https://github.com/serox94/dream-team/actions/runs/41888354094), code commit `888218c66acac62fe5d16e68d2661e59cf548757`: **SUCCESS**. Release passed; injected activation, migration and post-readiness failures each recovered with PASS; normal and independent owned cleanup passed. The parallel Issue lifecycle verification also passed for Issue #38. Final documentation/test-only changes do not alter the cloud-tested adapter or D1 workflow.

Reports and annotations contain symbolic stages/errors, HTTP status, numeric provider code and safe scenario outcomes. Private rows, response bodies and credentials are not published. GitHub API is blocked in this cloud machine, but public run pages/annotations and the read-only Actions artifact inspector provide the cited evidence. The production adapter was tested with injected transports and was not activated against production.

## Review state

The existing PR #28 description/title were updated and Draft was converted to Ready for review after immutable cloud evidence and current Validate checks were verified: [run 41893117811](https://github.com/serox94/dream-team/actions/runs/41893117811). No merge was performed. The one-time PR metadata workflow was removed after this operation; no standing write-capable review automation remains.
