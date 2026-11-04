# PR #28: release, recovery, quota and alerts

This branch extends the existing release controller and Cloudflare adapter. No production deployment or production migration was executed. Historical PR23 operators remain separate.

## Failed cloud run and diagnosis

The user independently verified that commit `cd324436b9820948c8663489b45cbcb309d2573c` passed Validate DreamTeam, while isolated run `41874304542` failed. Several scenarios reported `CLOUDFLARE_ACCESS` at PRECHECK. The original reporter discarded HTTP status and Cloudflare error code; those fields cannot be recovered from that summary. The account inventory supplied by the user was 9/10 D1 databases. Four parallel scenarios requiring two databases each were incompatible with that capacity. This establishes a test-design defect, not the cause of every failed API operation.

`5c65e73` replaced that design with a single job and one newly created D1 database. The workflow concurrency group is shared across runs. Full D1 inventory is checked before creation: ten databases blocks without mutation; an existing same-name database is never adopted. Four scenarios run sequentially on the same owned database. Checkpoint restoration, migration rehearsal and candidate/fallback verification reuse it; before each scenario and after rehearsal, only synthetic data in this run's database is reset to its verified snapshot. No historical database is deleted, reset or reused.

Provider errors now retain only symbolic error, operation, HTTP status and numeric Cloudflare code. Account/subdomain lookup, single-D1 allocation, seeding, upload and release have separate stages. Controller-caught API failures also preserve status/code in the scenario report. No response bodies, secrets or application rows enter artifacts.

Real one-slot cloud evidence: [run 41879320051, drill job 126747419563](https://github.com/serox94/dream-team/actions/runs/41879320051/job/126747419563), commit `5c65e73adc432191a5e65342fb0343b6f2c9bbdd`: the drill script and artifact upload both completed successfully. The script only exits successfully after all four scenarios and owned-resource cleanup pass. This confirms the one-slot design against Cloudflare; it does not recover the old error codes or verify later commits.

## Cleanup

A successful-create ownership receipt records this run's exact database UUID/name and attempted disposable Workers. Normal `finally` cleanup runs on failure as well as success. A separate `always()` cleanup step handles the saved receipt after interruption of the main test step; its time budget is separate from that step. It validates current run/attempt, exact names and database identity, tolerates already-deleted resources, and verifies deletion. It never scans for historical resources to remove. Ownership and cleanup reports are uploaded with the scenario report. A hard runner loss can still require manual review of the receipt; no automatic historical-resource sweep is provided.

## Adapter for future production releases — implemented, not invoked

`productionCloudflareAdapter()` is a library factory in the existing `cloudflare-isolated-adapter.mjs`, sharing the controller implementation. There is no CLI, deployment trigger or workflow that invokes it. Its default is disabled, before provider access.

A future authorized operator supplies the exact immutable plan, active source UUID/build, target and compatible fallback UUID/build, expected account, an owned disposable recovery database with isolated candidate/fallback Worker versions, and the existing private media recovery gateway. Production and recovery databases must be distinct. The isolated entry point cannot opt into production mode or reset production data.

Both approvals are required:

- Controller: `RELEASE:<candidate SHA>:<operator SHA>`.
- Production capability: `PRODUCTION:<candidate SHA>:<operator SHA>:<source UUID>:<target UUID>:<production D1 UUID>:<source schema>:<target schema>:<migration SHA256 or none>`.

Preflight verifies current main/operator/manual-run context, successful candidate validation and isolated drill on the exact operator, absence of competing builds/releases/hooks and upload-only build triggers. Source schema and the full D1 migration registry are checked against `src/ensure-schema.js` at the immutable source build. This also supports an existing source version without APP_SCHEMA; newly uploaded target/fallback versions must declare their schema. A schema-changing plan is one additive migration step; its SQL digest must match the migration file at the candidate SHA. Arbitrary candidate/fallback D1, R2, auth, AI or asset binding changes are rejected. Both rehearsal and source migration must preserve every pre-existing business row and original column value (apart from explicit release-state settings); changed/deleted rows block activation.

The production path retains the write barrier, checks HTTP maintenance, verifies a stable snapshot and stores a round-trip-verified checkpoint in private R2. The source database is never reset. Restoration and actual candidate/fallback HTTP/auth checks run on the owned audit database. R2 media copies use the existing gateway and exact SOURCE/ARCHIVE/RESTORED binding checks. Activation accepts only approved versions, rechecks source and checkpoint freshness, and uses the production application's build header. After reopening it checks public login and protected API behavior; an opening failure reinstates maintenance before recovery. A migrated source can recover only to a version verified against its actual schema. Partial migration or failed recovery retains the barrier.

The caller must serialize a future operation with the existing `dream-team-production` concurrency group, retain private checkpoints and dispose of its own recovery resources deliberately. This adapter has been tested through injected transports, not activated against production. Current-session production authorization is absent.

## Actual cloud test and alert entry points

`isolated-release-drill.yml` executes success, post-migration timeout, post-activation timeout and post-readiness failure on one owned D1 database. It uses actual Cloudflare APIs and public HTTP, repository migrations through 31 and migration 32, validates final schema/version, trip count, foreign keys and reopened writes, then cleans only its own resources. It runs on relevant pushes to this PR branch or manual dispatch.

A separate job, without Cloudflare credentials, performs an actual GitHub Issue create → update → close → closed-issue readback. Its title is isolated by run/attempt, so it cannot resolve a production incident alert. It uploads `isolated-alert-verification/summary.json`; insufficient Issues permissions is a failed test with safe HTTP diagnostics. GitHub notification/email delivery remains dependent on subscriptions and is not inferred from API success.

The scheduled monitor evaluates backup freshness, login HTTP, runtime error aggregates and deployment state independently. Missing telemetry fails explicitly. Incident Issues are deduplicated per workflow and resolved after recovery; workflow-run events from foreign repositories or non-main branches cannot create production incident alerts.

## Evidence boundaries

Local tests include the full adapter/controller and actual repository SQLite migrations, partial and ambiguous failures, one-slot capacity/ownership guards, and the production factory with all network transports injected. A separate workerd/Miniflare test exercises D1 restore, migration 32 and resetting the same owned D1 back to its checkpoint. Local PASS does not substitute for the failed cloud run or prove Cloudflare/Issue delivery.

This cloud machine has no Cloudflare bindings and its proxy rejects CONNECT to `api.github.com` with HTTP 403. Git fetch/push works. Operations unavailable here: reading Actions jobs/logs/artifacts/checks, obtaining the original provider status/code if retained elsewhere, reading the alert Issue and changing PR metadata. New live outcomes must be read from Actions artifacts through an authorized GitHub connection. Cloud drill PASS is established only for the linked `5c65e73` run. Later-commit drill results and actual Issue delivery remain unconfirmed until their corresponding job outcomes are observed; no merge readiness is inferred.
