# Complete an already-migrated schema31 release

This is the new recovery-completion procedure. Do **not** rerun workflow
39905061217, `production31.mjs apply`, the old `release` action, migration 0031,
or any schema28/30 operator. Production already uses schema31. No database
downgrade, maintenance toggle, account initialization, credential rotation or
session purge belongs to this operation.

## Exact application and versions

- Approved source: `db4190d2f8836786e25656807c1417b42118880e`.
- Merged application build: `2b38f99fda6c4c231d2abcaa0ac7c8ef69d77333`.
- Full pinned Worker: `de1408b8-08d8-4253-ba41-c0288d09cf65`.
- Tested schema31 fallback: `21a90928-ac5c-4ea6-9101-8fbf4b0498e0`.
- D1: `b64c7a2c-8694-41c6-b54a-857b88bf2c96`, schema/registry 31.
- Production must start on 100% fallback with maintenance OFF.

The operational PR changes scripts, tests, workflows and release evidence only.
`src/`, `public/` and `migrations/` must have no diff against the approved source.
Promotion activates the existing pinned version; it does not rebuild or upload
new production application code. The original application build label therefore
remains `2b38f99f…`, even if the separately reviewed operator has another SHA.

## Readiness, without an ambiguous single GET

`schema31-readiness.mjs` reads the active 100% deployment UUID and the immutable
version configuration. It checks exact build and full/fallback identity. A
cookie-free, redirect-disabled GET `/login` records actual status, build, Ray ID
and response version header when present. Another anonymous GET
`/api/lake-candidates` distinguishes the full authenticated API (401 JSON) from
the fallback's deliberate research pause (503 with its specific JSON marker).
Both probes must agree with the requested variant on two consecutive attempts.

The deadline is 30 seconds / at most 8 attempts, including control-plane waits;
individual HTTP work is bounded at 4 seconds. These are bounded transition
observations, not an arbitrary timeout increase. A known preceding version,
stale SHA, unidentified edge 404, or unidentified transport 502/503/504 is
recorded and retried. A wrong configured version/build, unexpected deployment,
traffic split, anonymous redirect, identified application 404/500, schema guard,
or JSON application failure is blocked. A known previous variant can never
produce PASS while it keeps serving. Persistent unknown transport also fails.

Evidence includes both responses' safe status/build/Ray fields, requested UUID,
control-plane UUID and source (`deployment` versus `immutable-version-route`).
It excludes cookies, Authorization, response bodies, private SQL and secrets.
An observed transient is not automatically called confirmed propagation.

## Verification before any new approval

The verification workflow has no production environment approval and never
invokes `prepare` or `promote`. It performs `schema31-promote.mjs check` with
approval `no`, tests the pinned target URL read-only, and uses the existing
isolated schema31 restore `a02bd313-f42d-4264-b8bf-195880ed7513` for the real
fallback/full/recovery rehearsal. It never replaces either research-preview D1
or production D1. Private gates protect the sandbox; AI and Tavily bindings are
absent. The exact retrieved application module bytes run without rebundling.

The rehearsal checks all three anglers, previously issued sessions across both
versions, wrong-password/protected-account guards, research cache, archived
Adventure 2025, album mapping, real idempotent offline write/replay and scheduled
handler dispatch. It also injects a failure after activation and actually
restores the schema31 fallback in that sandbox, then promotes the full version
again. Only its own disposable QA item/receipts/sessions are removed there.
Production originals are compared privately and must remain unchanged.

The sandbox's extra gate supports a host-only Secure/HttpOnly cookie so PWA
background requests stay isolated too. The sandbox-only transport helper may
retry an explicit unmetered `Unavailable` response produced before the app is
invoked. It never retries an application error or an ambiguous failed POST,
and refuses a production hostname. This helper is not used for production
promotion requests.

The accepted complete PL/EN, Light/Dark, responsive, weather, archive and PWA
evidence for the unchanged application remains applicable (Validate 39902213393,
Responsive 39902213286, integrated candidate 39902208041). The new browser smoke
checks the changed deployment context, not another visual audit or extraction.

## Steps only AFTER a new explicit approval

1. Approve the exact final operator SHA as well as the existing application
   source. Review this PR; do not merge PR #17 separately. The current task has
   **not** granted promotion, maintenance, migration or approval-variable changes.
2. When separately authorized, merge the operational PR while retaining the
   approved application subtrees. Enable the protected environment's one-time
   approval for this new operation through the normal GitHub confirmation flow.
3. Run **Schema31 fallback to full (new approval required)**, action `check`,
   with `operator` set to the reviewed SHA. It checks schema31, integrity,
   source fallback, preserved provider/resource configuration, target version
   URL, Builds/hooks and other production operations. It does not write D1.
4. Run action `prepare` for that operator SHA and the successful isolated
   verification run ID. Critical operator blobs must match that tested run.
   Preparation creates ONE fresh private schema31 SQL backup, actually restores
   it into a separate disposable recovery database, verifies the R2 roundtrip,
   and records a current recovery bookmark/configuration and original data/auth
   rows privately. There is no migration. Current empty media must be confirmed;
   if media has been added, preparation stops until a fresh nonempty-media
   backup/restore procedure is reviewed. No paid capacity is enabled to proceed.
5. Within 15 minutes, run action `promote` with the NEW private
   `dream-team-schema31-promotion-v1` receipt. Old schema30 receipts are rejected.
   It rechecks exact operator/application, source deployment, main, pinned
   versions, schema31, original credentials/sessions, queue and budgets.
6. Activate only pinned full version `de1408b8…` at 100%. Maintenance stays OFF.
   The shared transition core performs the new readiness gate and real angler
   login/bootstrap checks. It checks preservation again, deleting only the new
   smoke sessions it created. There are no production QA imports or password
   changes. Main/backup schedule configuration must be unchanged.
7. Complete the scoped production UI acceptance using the exact released build.
   Confirm research evidence, PL/EN, both themes, weather, checklist/catches,
   Photos, archive and offline. Reuse unchanged-code evidence where appropriate;
   do not repeat paid extraction or model benchmarks.
8. Close the one-time approval to `no` through GitHub Settings and verify it by
   fresh reload. This task leaves the existing `no` value untouched.

The read-only budget must have a 60k reserve below a 4.8M daily stop threshold.
Analytics may lag. The normal check has a bounded 6k SELECT/PRAGMA budget; live
rehearsal separately meters production and isolated operations. Fresh exports
belong only to a newly approved preparation, never to repeated diagnostic runs.

## Schema31 recovery

If readiness or post-activation verification fails, the transition core deploys
only pinned fallback `21a90928…` at 100%, verifies the fallback discriminator,
checks angler login, schema31 and maintenance OFF, and reports BLOCKED with its
actual recovery result. No schema30 Worker, D1 rollback or maintenance write is
used. Research and main scheduled work are paused in fallback; the independent
backup Worker schedule remains configured.

If the runner is killed or recovery itself cannot finish, stop further release
attempts. Read the actual deployment/schema/maintenance state and preserve the
private checkpoint. Escalate the exact schema31 fallback activation as a
separate controlled operator action if needed; never restart the old migration
workflow or restore an old SQL snapshot over later user writes.

## Historical root-cause limitation

The original operator discarded the failing HTTP status/build and did not log a
Ray ID. Artifact `production31-safe-status` contains only the coarse error.
The attempted historical Workers Logs query returned 403 / Cloudflare code
10000. No new permission was requested or granted. Obtaining that original
request's response/version requires an account operator with existing access
to stored Worker logs for 23 October 2026, 07:22:44–07:22:51 Amsterdam time;
logging cannot recreate a response that was never retained.

Current pinned routing, assets, source/configuration and schema checks cannot
prove the cause of that past request. Existing browser cookies were not part
of the old Node fetch, so the authenticated `/login` redirect is not supported
as its cause. Propagation remains an unconfirmed possibility, not a finding.

## Owner review before authorizing activation

The real stored-credential audit identified an existing technical-account
credential-separation issue. Details were reported privately to the owner;
no password, hash, account, role or production session was changed. Independent
credential storage and protected-record guards work, but storage independence
must not be reported as proof of a different password value. Resolve or
explicitly decide this existing configuration before production acceptance.
