# PR41 production operator — BLOCKED

Operational branch: `ops/pr41-safe-release-20261106`. Application candidate:
`5c38a2cc69657fb5ad8c2df3c716a90439688e34`. Previous production version:
`31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d`. Schema remains 32; migration plan is empty.
No application code, production data, GitHub protection settings or active production
version was changed by this work. Neither PR28 nor the PR23 release operator is used.
The generic API/snapshot utilities and the existing PR41 private capture are reused.

## Entry points and guarantees

- `pr41-isolated-release.yml` creates at most one new audit D1 after checking the
  account has fewer than ten databases. All scenarios share it and one owned R2.
  It restores the **existing** production checkpoint, never exports/restores production
  as part of a test. Its `always()` cleanup deletes only this run's recorded resources.
- Exact runtime code is downloaded using
  `GET /workers/workers/dream-team/versions/31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d?include=modules`.
  Decoded module bytes are uploaded directly by multipart API and read back from the
  new immutable version. Wrangler can rewrite a `no_bundle` entry, so its output alone
  is not accepted as evidence of byte identity.
- All binding types/names and plaintext values are compared privately. Only the
  newly owned D1/R2 identifiers and ephemeral audit secret values may differ. Runtime
  date, flags, usage model and asset configuration are checked. No production secrets
  are exported. No cron schedules are installed on the audit Worker.
- Account, credential, existing session and application rows are verified against the
  retained snapshot. A new synthetic session on an unchanged restored account is
  signed using the audit secrets and used across both code versions. This is not a
  login against production or a claim to possess an existing user's browser cookie.
- `pr41-asset-proof.mjs` temporarily reads the audit version's own asset namespace
  without D1/R2/AI bindings. Every reference/candidate file is compared by digest over
  HTTP. This proves the isolated namespace's contents; it does not establish that a
  Git reconstruction contains exactly the assets deployed on production.
- `pr41-production-release.yml` runs operator checks on push. Production execution is
  **manual only**, on this branch, attempt one, under environment `production` and
  the existing production concurrency lock. It checks the actual environment rules
  and GitHub approval history for an owner review, `DREAMTEAM_PRODUCTION_APPROVED=yes`,
  and an exact sealed plan digest. The plan binds the candidate, source UUID, module
  and asset digests, configuration, schema, empty migration plan and rehearsal run.
- The successful rehearsal and bundle must belong to the exact operator commit.
  Missing/partial provenance fails closed even if somebody changes the approval flag.
  After all evidence and owner gates pass, the existing PR41 capture creates a fresh
  private recovery point, checks schema/integrity/configuration, then uploads a sealed
  candidate without changing traffic. Secrets are retained, not replaced. Only pinned
  versions can receive traffic. Failure recovery activates the original UUID only.
  There is no production migration, SQL restore, maintenance toggle, account reset,
  session purge or offline queue clearing path.
- Recovery verification failures remain `BLOCKED`; an unknown concurrent deployment
  is never overwritten. The actual entry point with approval `no` is tested to perform
  zero network calls. Local reports never replace the cloud rehearsal.

## Retained evidence

| Evidence | Result |
| --- | --- |
| [Original backup, 42255416804](https://github.com/serox94/dream-team/actions/runs/42255416804) | PASS, retained; not recaptured during these tests |
| [Version-addressed read, 42264565441](https://github.com/serox94/dream-team/actions/runs/42264565441) | Exact production module is available; generic current-content endpoint returns different code |
| [Initial clone, 42265431886](https://github.com/serox94/dream-team/actions/runs/42265431886) | BLOCKED on module mismatch after Wrangler transport; all owned resources cleaned |
| [Corrected exact-module rehearsal, 42266756179](https://github.com/serox94/dream-team/actions/runs/42266756179) | Module/configuration/restore/session/code rollback PASS; overall PARTIAL because source static provenance is unproven |
| [Retained approval read, 42267471367](https://github.com/serox94/dream-team/actions/runs/42267471367) | `no`; `production` has no protection rules |
| [Asset export investigation, 42267723554](https://github.com/serox94/dream-team/actions/runs/42267723554) | `/scripts/dream-team/assets` returns current Worker JS/map, not static assets |

The exact production runtime module SHA-256 is
`f6861d649fb31f0d0e23063a02e48665df256401a1c079720f52b47c1727cb48`.
The generic current-content module instead hashes to
`7635a5a5d9ec42a7e1e88b7ffa72d745e14dcf870432b73ba144b15507c35322`;
substituting that code would fail the requested production identity check.

The retained D1 SQL hashes to
`70bbc2c37121af051ba9d005e25e9f56bb8aa1ed947855f40dfcdd3f4df2900b`.
Its actual audit restore contains 37 tables, 2912 rows, six triggers, four accounts
and six original session rows, with FK/integrity/sequence verification. At capture
time production media was empty and its inventory was checked before and after.
Capture completed at 2026-11-06 16:46:57 UTC. This is retained recovery evidence,
**not a fresh recovery point authorizing a later switch**.

Fault injection in the real audit rehearsal covered failed activation and failed
post-activation readiness; both recovered to the exact source-code clone. Injected
recovery-verification failure remained BLOCKED, then the source service/session was
independently verified again. These were injected failures, not claimed Cloudflare
outages. All three owned resources were deleted successfully; no historical resource
was removed. The later namespace-proof run adds full HTTP asset-byte comparisons;
its authoritative results are the `pr41-isolated-status` and `pr41-release-bundle`
artifacts on this operational branch.

## Remaining release blockers

1. The API read for the immutable source version exposes its modules and asset
   configuration, but no static asset contents/manifest. The recorded production
   commit is `d39ddf632b2279573216ac81d536a7e6f0fcc240`; rebuilding its 141 public files
   is a useful reference, **not evidence of the complete deployed asset namespace**.
   A read of `/workers/workers/.../versions/<uuid>/assets` returns ordinary version
   metadata, and the legacy `/scripts/.../assets` returns the generic current module.
   Neither is treated as an asset dump. `sourceAssets` remains `UNPROVEN` in the sealed
   plan. Production execution is therefore blocked before upload or backup refresh.
2. Owner authorization is `no`; the environment also lacks required reviewers.
   No settings were changed and no production release was dispatched. Owner action
   should be requested only after the missing static provenance has been established
   and a complete matching operator/candidate rehearsal has passed.

Do not mark this operator production-ready or activate approval based on an Actions
success badge alone: the JSON receipt explicitly distinguishes `PARTIAL` from PASS.
