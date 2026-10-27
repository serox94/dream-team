# PR23 code-only release on schema32

Do not run `schema32-release.yml`: its schema31 source conditions are obsolete after PR22. No migration, password/account initialization, session purge, research extraction or database rollback belongs to this release.

1. Finish PR23 consolidated trips preview, Validate and Responsive UI QA for the exact candidate. Review saved real Chromium evidence. Merge only with all required checks passing and preserve the candidate tree exactly.
2. Obtain the owner's **new explicit approval for the exact PR23 candidate/main tree**. Never inherit PR22's flag or authorization. Dispatch `Approved schema32 code-only release` with candidate, successful exact-SHA PR23 preview run and fresh `owner_approval=PR23:<candidate>`. The production environment variable must also be yes. GitHub re-authentication is never bypassed.
3. The operator checks current full schema32 version81f011a2, main/tree, unchanged src/migrations/auth/bindings, idle Builds/actions, private route and verified daily D1 headroom. Any failure blocks before activation.
4. Only after approval, create one fresh private D1/R2 recovery checkpoint. Roundtrip the SQL and actually restore to a disposable D1; compare original rows/FKs/integrity. Verify media bytes/metadata if present, including an empty inventory. Run private target and previous-full32 canaries against that restored database, cross-version sessions and scheduled handler. Checkpoint expires after15minutes.
5. Upload candidate as an inactive version, preserving production secrets/bindings. Recheck source deployment and data. Activate once. Do not migrate D1 or change maintenance. Check exact active UUID, build, HTTP and full-application discriminator with the existing bounded readiness gate. Run real production login and browser integration; verify original records/credentials/sessions and unchanged schedules.
6. On activation/readiness/verification failure, reactivate only the rehearsed previous **full schema32** Worker81f011a2 once, verify recovery and stop. Never downgrade D1 or restore a schema31 Worker. If recovery itself fails, report explicitly; do not loop.
7. On success set `DREAMTEAM_PRODUCTION_APPROVED=no`, reload Settings and verify the saved value. If GitHub requests personal re-authentication, report that single owner action clearly. A successful build alone is not successful production verification.

The independent backup cron and queue/application schedules stay untouched. Existing research evidence is reused; no new provider calls are required by this procedure.
