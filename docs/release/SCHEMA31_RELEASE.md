# One official DreamTeam schema31 release

This runbook is preparation only. No merge, production migration, password reset,
production deployment or maintenance change has been performed by preparing it.

## Candidate and existing evidence

The release branch integrates research `56e59bf` and the password hotfix `066e47b`
with conflict resolution: both sets of runtime English messages are retained;
research routes and the removal of the forced-password gate coexist in worker.js.
The resulting build has its own Validate, Responsive and integrated-preview runs.
Do not substitute the isolated branch results for the final candidate results.

Reuse the real Fishing Adventure extraction (8 pages, 2 credits), its approved
map/GPS semantics and the completed visual matrix. There is no reason to extract
these pages, benchmark models or repeat accepted screenshots during a release.

The active production schema is 30. Migration `0031_research_evidence.sql` is
unchanged, additive, and does not update accounts, credentials, sessions, trips,
catches, checklist rows or existing translations. A separate optional index
script only adds `translation_jobs_status_time`; it does not bump the schema.
The production clone rehearsal preserves every original table/column and auth
row, verifies foreign keys and quick_check, and proves private SQL/R2 recovery.

## Authentication policy

Set `ANGLER_PASSWORD_POLICY=shared` and `SCHEMA_REGISTRY_CACHE=true` in the target
configuration. Non-protected anglers always authenticate against the single
shared credential even if an old personal credential row exists. Their existing
session version checks still use the original per-account/shared version and
remain revocable. Existing hashes, salts, versions and sessions are not rewritten.
New third anglers inherit the shared policy. The protected technical account
retains its own credential, protection triggers and existing permissions.

The encrypted audit compares the exact user-supplied password privately against
production credentials. Its output is booleans only. Do not print a password,
credential hash, private SQL, private manifest, signing secret or session cookie.
Anglers cannot change the centrally managed team password through the UI/API.
There is no forced initial password change and no eight-character minimum.

## Approval, merge and one manual workflow

1. Obtain a new explicit approval identifying the exact final release-candidate
   SHA. This document and passing tests are not that approval.
2. Recheck PR head and production main. Merge only the release-candidate PR,
   which includes the research code. Do not separately merge PR #17 afterwards.
   Require the resulting main tree to equal the approved candidate tree exactly.
3. Set the protected environment's one-time `DREAMTEAM_PRODUCTION_APPROVED` to
   `yes` for this operation. Required environment approval is not bypassed.
4. Run **Approved schema31 production operation**, action **release**, from main,
   with `candidate` set to the separately approved source SHA. No password or hash
   goes into workflow inputs. The workflow checks the exact source/main tree and
   the three successful final candidate runs.
5. The workflow prepares a fresh private recovery point, restores a fresh isolated
   copy, applies only 0031 there, validates original rows, and copies only approved
   cached research into that clone. All canary checks occur with production
   maintenance OFF. No legacy initialization, session purge or password rotation
   is called.
6. It checks real candidate and schema31-fallback canaries with separate angler
   logins and the same session cookie across both versions. Then it uploads
   pinned **inactive** production versions; uploading does not send live traffic.
7. A private `dream-team-schema31-v1` receipt records the exact candidate/main,
   successful run IDs, previous Worker, D1/R2 recovery point, tested schema31
   fallback and the two inactive version IDs. The receipt and snapshot expire
   after 15 minutes. The receipt remains in private R2, outside GitHub artifacts.
8. Immediately before changing production, the operator checks Builds, hooks,
   other production operations, active Worker, schema 30 and the registry. It
   preserves every source binding/secret/provider control, adding only the shared
   policy, registry cache and free-only research flag. No subscription changes.
9. Only now enable maintenance. Apply **only** 0031 with an explicit config that
   pins production D1 UUID and an isolated migration folder containing that file.
   Wrangler rolls back a failed migration file. Add the optional index. Verify
   schema/registry 31, foreign keys, quick_check, counts, credentials and all
   preexisting session rows. No production table export or repeated full-row
   integrity scans are used for these counters.
10. Import only approved research pages/observations/completed jobs/proposed GPS
    for the matching Fishing Adventure lake ID/name/country/source host. No lake
    GPS, historical content, QA accounts, sessions or test translations are copied.
    Existing 402 saved translations remain production's own records.
11. Activate the pinned candidate version at 100%. Turn maintenance OFF and test
    actual production logins/identity for all anglers. Preserve original sessions;
    clean up only the newly issued test sessions. Check the same production URL,
    app build/schema, Weather PRO, existing checklist/catches, Photos for next-trip,
    archive and PL/EN/Light/Dark/PWA. Do not launch another full visual audit or
    model benchmark. Read-only health and scoped records are sufficient where
    the identical candidate was already checked on the isolated preview.
12. Set `DREAMTEAM_PRODUCTION_APPROVED` back to `no` and verify it after reload.
    If GitHub requires reauthentication, use its required confirmation flow;
    report the precise manual operation if it cannot be completed.

## Failure and resumption

- Before maintenance/migration: production remains unchanged. A failed preparation
  does not deploy any version. Preserve the private checkpoint and diagnostics.
- Before schema31: the previous schema30 Worker is compatible; restore maintenance
  OFF after its availability check.
- After schema31: **never deploy d880/the old schema30 reader**. Use only the
  explicitly pinned, tested schema31 fallback. It retains the approved shared
  authentication policy, reads existing business data and temporarily disables
  research/provider calls. It never resets D1, credentials or sessions.
- If a post-release check fails, the operator re-enables maintenance and attempts
  the tested schema31 fallback. If recovery fails, it leaves an explicit BLOCKED
  report with actual maintenance state and required operator intervention.
- A fresh already-prepared receipt can be resumed with workflow action **apply**
  and its private receipt key, without redoing backups. Expired evidence is not
  refreshed by changing timestamps. Action **recover** requires the same approval
  and a compatible receipt. There is no blind D1 Time Travel rollback over later
  writes; data recovery needs a separate assessed decision.

The previous schema28/30 workflow is retired and fails closed. Default npm deploy
also fails closed without an explicit action, exact confirmation and private
schema31 receipt. Use neither historical release-operator.mjs nor old scripts.
