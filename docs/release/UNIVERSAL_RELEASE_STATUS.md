# PR #28: release, recovery and monitoring

This branch extends the existing controller and Cloudflare adapter. It does not enable production deployment. Historical PR23 operators remain separate and must not be treated as universal entry points.

## Implemented

- `universal-release.mjs` requires a verified write barrier for code-only and schema-changing releases. It keeps that barrier through checkpoint, rehearsal, migration, activation and recovery. Recovery inspects the actual schema after ambiguous provider responses, selects source or compatible fallback, and retains maintenance when recovery cannot be verified.
- `cloudflare-isolated-adapter.mjs` implements the controller's complete interface using the Cloudflare deployments/versions and D1 APIs. It checks resource identities, exact version database/build/schema bindings, live HTTP maintenance, restored schema/rows/sequences/foreign keys, candidate and fallback HTTP readiness on the restored database, checkpoint freshness and source state before activation. Production and Preview targets are rejected before mutation.
- Snapshot capture and restoration reuse `d1-snapshot.mjs`. Migration errors are not blindly retried. A partial migration cannot reopen the source Worker unless its database still matches the original checkpoint.
- Optional media recovery uses the existing private R2 backup/restore gateway, with exact isolated source/archive/restored bucket binding checks. The D1 drill has no R2 binding; it does not claim R2 end-to-end coverage.
- `isolated-release-drill.yml` provisions only run-scoped disposable Workers and D1 databases, applies repository migrations through 31, restores a checkpoint, rehearses migration 32 and both versions, and drives the controller. Four scenarios cover success, post-migration timeout, post-activation timeout and a post-readiness failure. Assertions check final schema, active version, reopened writes, trip count and foreign keys. Successful runs delete only their own disposable resources; failed runs retain them for inspection. Safe JSON reports are uploaded as artifacts.
- The drill runs on relevant pushes to this PR branch and explicit workflow dispatch. It requires the existing Cloudflare Actions secrets; it has no production environment or production resource target.
- Monitoring evaluates backup freshness, HTTP availability, Worker error aggregates and active deployment independently. Missing telemetry fails explicitly. Workflow failures, timeouts and cancellation remain visible as failed jobs.
- `infra-monitor-alert.mjs` opens or updates one GitHub Issue per failing workflow, links its run, and closes the matching alert after recovery. The alert job checks out trusted main code and ignores workflow-run events from foreign repositories or non-main branches. Issues require Actions `issues: write`. Email notification depends on repository subscriptions; email delivery is not asserted.

## Validation and remaining external evidence

Local tests exercise the full adapter/controller with actual repository migrations and SQLite data, including ambiguous migration/activation, candidate binding mismatch and partial migration. A separate workerd/Miniflare D1 test restores schema31 and applies the actual schema32 migration while preserving business rows, registry, maintenance and foreign keys. These tests do not claim live Cloudflare control-plane coverage.

The complete npm test suite and Worker dry-run build are the local review gates. Live Cloudflare evidence belongs to the isolated Actions drill artifacts. This cloud machine has no Cloudflare secret bindings; GitHub REST/GraphQL requests return `Forbidden`, although Git fetch/push is available. Consequently, cloud run completion, GitHub Issue delivery and changes to PR metadata cannot be confirmed from this machine. Review the new drill's four artifacts before merging. Production activation and R2 end-to-end validation remain outside this isolated D1 drill.

No production deployment, remote production migration, production data deletion, or new PR is part of this change.
