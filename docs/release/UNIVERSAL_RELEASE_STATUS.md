# Release and monitoring work in progress

The existing PR23 release operator remains pinned to historical identifiers and must not be used as a generic release.

`scripts/universal-release.mjs` is a prototype with no production provider adapter or executable workflow. It must not be used to deploy. Its tests cover approval scoping, checkpoint and isolated-test gates, source rechecks, ambiguous activation and conservative fallback selection. They use test doubles and do not constitute an isolated D1 migration or a real end-to-end release.

Before this can be marked ready, implement and verify a concrete adapter that preserves a write barrier and a verified recovery point through migration, validates actual candidate/fallback bindings and schema compatibility, and manages Cloudflare control-plane uncertainty. Exercise the whole adapter with an actual isolated Worker and D1, including failure and recovery, without production access. The earlier isolated Worker and Time Travel demonstrations are separate evidence, not this end-to-end test.

The monitoring workflow retains the scheduled backup freshness and HTTP availability check. It additionally surfaces failures of the listed existing release, migration, recovery and backup workflows as failed monitoring jobs with a run link. GitHub email delivery depends on user notification settings and was not verified for these jobs. The scheduled monitor actually ran [41851414151](https://github.com/serox94/dream-team/actions/runs/41851414151): PASS, backup age 11.5 h and login HTTP 200. A Cloudflare notification test arrived in the account owner's inbox on 2026-11-03, confirming delivery of the sample message; it does not prove that production Worker error telemetry is configured or that every failure category generates an email.

Production and Preview runtime code and data are not changed by this branch.

The proposed monitor also queries Cloudflare runtime request/error aggregates for `dream-team` over 24 hours without changing the Worker or collecting user logs. It reports a high error rate when at least five errors make up at least five percent of requests. A real read-only run [41858802553](https://github.com/serox94/dream-team/actions/runs/41858802553) passed. These additions remain in this draft PR and are not active on the main schedule until merged. Workflow failure alert delivery has not been demonstrated.

## Isolated Cloudflare adapter — 2026-11-04

The new `cloudflare-isolated-adapter.mjs` accepts only a disposable Worker whose name matches the current numeric run identifier. It rejects production, Preview, mismatched identifiers, split traffic and invalid version identifiers. It has no capability to target production.

Direct Cloudflare control-plane drill: created disposable Worker `dream-team-audit-20261104162501-recovery-probe`; source version `6ddb8790-e36a-4b8a-a17b-668d612e33ee`; uploaded and activated target `105f3b03-0e61-4c14-a739-d7a12fac0630`; injected a post-activation failure; reactivated and confirmed the source UUID; deleted only the disposable Worker. Result: PASS for control-plane activation and recovery. This did not exercise public HTTP readiness or D1 migration through the universal controller.

The schema-change prototype now requires a confirmed write barrier before taking a recovery checkpoint. Local isolated adapter/controller tests passed 15/15. The real HTTP adapter test was queued as [41865293100](https://github.com/serox94/dream-team/actions/runs/41865293100); GitHub Actions reported degraded performance. The one-shot workflow file was removed from the proposed PR, but the already queued run may still execute from its original immutable commit.

The generic controller remains a prototype with no production adapter. There is no evidence of a complete release including real D1 migration, backup restore, and fallback through the controller, or of live workflow-failure alert delivery. Do not merge or deploy this draft.
