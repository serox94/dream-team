# Cloudflare metadata diagnostics without browser sign-in

The GitHub connection can read CI logs and artifacts. The existing Actions secrets
provide Cloudflare access inside the trusted runner; their values never belong in
chat, screenshots, source files, artifacts or logs. No new token or permission is
needed just to attempt this diagnostic.

## Current incident / PR24

The owner confirmed the Workers Free plan. Their D1 screenshot lists ten databases,
including eight audit-named databases. The ten-database Free cap has no creation
headroom. The old run 40531123753 discarded the failing Cloudflare endpoint/status/
code; the exact historical error cannot be reconstructed from its two safe JSON
artifacts. Do not replay a release just to obtain that error.

The diagnostic runs automatically on PR24 updates from the named same-repository
branch, without merging. It uses only GET requests to an explicit endpoint list,
at most seventy requests, no SQL and no downloads of database or object bodies.
It records D1 names and sizes, active Worker D1/R2 references, matching backup bucket
names, and object metadata only under the failed release's private snapshot prefix.
It attempts to inspect the current token's own policy; a denied metadata read is
reported as PARTIAL, never treated as absence of D1 Write. Even a named Write grant
does not certify account resource scope or a successful write.

Read the `cloudflare-readonly-metadata` artifact and the job's `CLOUDFLARE_READONLY`
summary. HTTP status and numeric Cloudflare code are retained without raw responses,
token values, account identifiers, database UUIDs, settings values or customer data.
No production environment approval, maintenance switch or deployment is involved.

## Future operator access

After separately reviewing and merging this workflow, the owner or authorized
operator can open Actions -> Cloudflare metadata diagnostic (READ ONLY) -> Run
workflow -> main. Until it exists on the default branch, use the PR24-triggered run;
do not merge merely to make the dispatch button appear. Keep the GitHub connection
authorized for this repository. If GitHub refuses workflow-file writes, the owner
must apply that reviewed file using their own GitHub access; never bypass the
connection's permission boundary or paste a personal access token into chat.

## Interpretation and next operations

`activeWorkers: []` is a cleanup candidate, not a deletion authorization. Retained
historical Worker versions, recovery receipts, backup dependencies and data still
need review. A resource is not empty because a dashboard list says Tables: 0.
Protect production, preview, the active research DB and independent backup worker.
Create a recoverable copy before proposing deletion of one specifically identified
stale database. Cleanup and production deployment require their own concrete scope;
this diagnostic cannot perform either. Keep the production approval variable `no`.

This run neither verifies archived object bytes nor recovers the missing historical
HTTP response. It does not rerun Fishing Adventure, model calls, migrations or the
previously accepted functional/visual suites. GitHub's existing branch CI may run
automatically after a commit; no deployment workflow is dispatched.
