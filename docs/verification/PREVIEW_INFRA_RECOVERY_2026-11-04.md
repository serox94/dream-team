# Preview infrastructure recovery — 2026-11-04

## Completed

- Production remains at Worker `31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d`; no production deployment was made.
- Both production Cloudflare Builds triggers were removed. Subsequent branch pushes did not create further production versions; last uploaded version remained `bd2eaf39-2f05-424f-ad84-2c2d2992324b`. Manual production release still requires separate approval.
- Before changing Preview, the real schema-28 database was exported and restored to an isolated D1; migrations 29–32, original rows, integrity and foreign keys passed: [rehearsal](https://github.com/serox94/dream-team/actions/runs/41718988537).
- All 25 Preview media objects were copied to private recovery storage and verified with SHA-256. The recovery bucket is `dream-team-preview-recovery-41718988537`.
- On an isolated Worker, real activation, session continuity and rollback passed: [authenticated drill](https://github.com/serox94/dream-team/actions/runs/41723072332). A separate controlled D1 Time Travel recovery and a write-gate drill passed: [gate](https://github.com/serox94/dream-team/actions/runs/41723798427).
- The real Preview was gated, freshly backed up and migrated to schema 32: [promotion](https://github.com/serox94/dream-team/actions/runs/41836744091). The fresh schema-28 SQL backup SHA-256 is `a416ae7ef83edb6d5eda7e5fd14e2c42ef3cfe9a60267eb340d1ba4d01009455`; an independent restore was rehearsed on the earlier consistent export. The existing session survived the target version. Previous columns and rows were compared, excluding the expected migration and temporary maintenance fields.
- Active Preview Worker `5f788f03-34c9-47c3-9132-f2e9c87bdb50` binds D1 `5d32f54f-f953-463f-8519-745e51417986` and R2 `dream-team-preview-media`. Saved bindings match. 32 migrations, 2 accounts, 1,116 existing sessions, 5 trips, 82 checklist items and 25 R2 objects were observed; quick check and FK check passed.
- [Logged-in screen checks](https://github.com/serox94/dream-team/actions/runs/41837401562) passed 28 page/language/device combinations. [Language switch and reload](https://github.com/serox94/dream-team/actions/runs/41838502094) passed for both accounts and trip-section anchors. Tests block write requests, including automated content translation; they do not establish full functionality of every control or live model call. `TRANSLATION_ENABLED=false` is set in Preview, avoiding AI calls.
- The temporary canary Worker, D1 clone and R2 media clone created for this task were deleted after verification. Private recovery copies and all historical resources remain. Inventory: 9 D1 databases, 66 R2 buckets, 7 Workers.
- The one-shot Preview promotion workflow no longer runs on push; its guards also reject a schema-32 source and a different active Worker.
- Read-only monitoring of production login, active Worker and backup freshness was merged as [PR #27](https://github.com/serox94/dream-team/pull/27); [manual execution](https://github.com/serox94/dream-team/actions/runs/41722622577) passed. A Cloudflare Worker-issue notification policy was created; Cloudflare accepted a test notification, but delivery and real error detection have not been verified.

## Open limitations

- The existing production operator is still tied to PR #23 and historical IDs. The new `release-guards.mjs` contains tested guard primitives, not an integrated general-purpose release system. The old rollback diagnostics were reviewed on this branch but are not merged. A general release/rollback workflow must be completed and rehearsed before relying on it.
- The generic transition guard also performed a real activation and one rollback after an injected failure on a fresh disposable Worker: [guard drill](https://github.com/serox94/dream-team/actions/runs/41839237731); the temporary Worker was deleted. The isolated Worker rollback and D1 Time Travel recovery were demonstrated separately. They are not proof of production rollback after a migration.
- Alert delivery, automatic detection of failed production backup/deployment/migration/rollback, and Worker error detection are not fully verified.
- The old research-preview cron remains enabled pending confirmation that disabling it will not disrupt its current proxy workflow.
- Existing historical D1 databases, R2 buckets and Workers require separate per-resource authorization before deletion.
