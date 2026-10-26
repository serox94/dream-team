# Integrated Fishery Manager: schema31 → 32

This is a new additive release of PR #22, including PR #20 and #21. It does not
invoke the schema28/30/31 release operators or migration 0031. It never resets
credentials, initializes accounts, deletes sessions, rewrites catch/checklist
history or imports preview QA data into production.

Production starts on full schema31 Worker `de1408b8-08d8-4253-ba41-c0288d09cf65`.
The exact candidate tree must equal merged `main`. The protected production
environment's one-time approval must be enabled through the normal approval
mechanism. A successful Integrated Lake Manager run and successful Validate /
Responsive UI checks must belong to that exact candidate SHA. Preparation and
activation are unavailable without approval. This document alone is not a
claim that production has been released.

## Before maintenance

1. Complete deterministic browser scenarios A–D and the real, existing isolated
   preview checks. Retain archived Fishing Adventure evidence and translations;
   do not repeat its provider extraction. All screenshots and test outputs are
   retained as Actions artifacts.
2. Read production version, schema31/registry31, maintenance OFF, service/binding
   configuration, Cloudflare Builds, deploy hooks and D1 usage. Require 80k reads
   of headroom below a 4.8M account-wide daily stop. Analytics may lag; exports
   belong only to approved fresh preparation, never repeated diagnosis.
3. Merge the integrated PR retaining its exact tree. Do not separately merge
   PR #20 or #21, whose ancestry is already included.
4. Dispatch **Approved integrated schema32 release** with the reviewed candidate
   SHA and its successful Integrated Lake Manager run ID.
5. Preparation performs ONE fresh production export, saves and verifies its
   private R2 roundtrip, actually restores the SQL into a dedicated D1 recovery
   database and applies only migration 0032 there. Compare every original
   table's original columns, authentication records, translations and sessions;
   check foreign keys and integrity. The existing research preview is not reset.
6. Back up R2 through the existing gated, read-source-only recovery gateway.
   Restore to a separate private bucket, checking bytes, HTTP/custom metadata,
   inventory and hashes. No production media are overwritten or deleted. The
   transient gateway is removed in cleanup; private recovery copies remain.
7. Test both target and schema32-compatible fallback against that current
   recovery copy. The fallback is the previously released full application tree
   with only its read-only schema guard upgraded; provider calls and its
   scheduled handler are paused. Check all three angler identities, reuse each
   canary session across both variants and exercise the full scheduled handler.
8. Upload inactive production candidate/fallback versions preserving existing
   resource and secret bindings and provider controls. Save pinned UUIDs,
   previous immutable configuration, schedules, bookmark, tested restore and
   snapshot hashes in a private receipt. No production traffic has changed yet.

## One production transition

The fresh checkpoint must remain under 15 minutes old. Recheck source UUID,
main, receipt, immutable candidate identity and deployment queues. Enable
maintenance, then compare the checkpoint against the now-quiescent database;
stop if users added data since the snapshot. Apply only migration 0032 and
verify schema32/registry32, original columns and foreign keys. Activate the
pinned full candidate exactly once, then turn maintenance OFF.

The readiness gate requires two observations of exact active version UUID,
configuration, APP_BUILD, HTTP 200 and the full authenticated API discriminator.
A schema32 fallback can never pass as full, even with the same build label.
Attempts retain safe HTTP/build/Ray/version diagnostics and have a bounded
30-second deadline. A transient observation is not proof of propagation.

Before success, run real production PL/EN, both themes, Dashboard, fisheries,
checklists, catches, live Weather PRO/hourly index, Google Photos, archive /
Adventure cached research, Settings and PWA/offline checks. Verify original
rows and sessions again. Register daily `0 6 * * *` plus profile-queue
`*/5 * * * *`; confirm the independent backup schedule remains unchanged.
Normal scheduled operation is also exercised on the isolated target first.

## Recovery

No database downgrade or automatic restoration over new user data is allowed.
If a failure happens before migration, inspect actual schema and retain the
previous schema31 full Worker, maintenance OFF. An ambiguous migration response
must be reconciled with the actual database schema.

After schema32 exists, recovery activates ONLY the rehearsed schema32 fallback,
turns maintenance OFF and verifies its UUID/build/variant and logins. It never
activates a Worker requiring schema31. No second full-production attempt occurs
in that run. Recovery failure is explicit; do not hide maintenance ON/UNKNOWN.
Private SQL and R2 copies support supervised recovery without replacing current
production data blindly.

After successful verification, close `DREAMTEAM_PRODUCTION_APPROVED` to `no`
through GitHub Settings and confirm by a fresh read. Publish exact commit,
Worker UUID, schema, counts, preserved sessions, schedules, maintenance and the
real production URL. Do not label a preparation-only run DEPLOYMENT SUCCESS.
