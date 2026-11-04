# Release and monitoring work in progress

The existing PR23 release operator remains pinned to historical identifiers and must not be used as a generic release.

`scripts/universal-release.mjs` is a prototype with no production provider adapter or executable workflow. It must not be used to deploy. Its tests cover approval scoping, checkpoint and isolated-test gates, source rechecks, ambiguous activation and conservative fallback selection. They use test doubles and do not constitute an isolated D1 migration or a real end-to-end release.

Before this can be marked ready, implement and verify a concrete adapter that preserves a write barrier and a verified recovery point through migration, validates actual candidate/fallback bindings and schema compatibility, and manages Cloudflare control-plane uncertainty. Exercise the whole adapter with an actual isolated Worker and D1, including failure and recovery, without production access. The earlier isolated Worker and Time Travel demonstrations are separate evidence, not this end-to-end test.

The monitoring workflow retains the scheduled backup freshness and HTTP availability check. It additionally surfaces failures of the listed existing release, migration, recovery and backup workflows as failed monitoring jobs with a run link. GitHub email delivery depends on user notification settings and was not verified for these jobs. The scheduled monitor actually ran [41851414151](https://github.com/serox94/dream-team/actions/runs/41851414151): PASS, backup age 11.5 h and login HTTP 200. A Cloudflare notification test arrived in the account owner's inbox on 2026-11-03, confirming delivery of the sample message; it does not prove that production Worker error telemetry is configured or that every failure category generates an email.

Production and Preview runtime code and data are not changed by this branch.

The proposed monitor also queries Cloudflare runtime request/error aggregates for `dream-team` over 24 hours without changing the Worker or collecting user logs. It reports a high error rate when at least five errors make up at least five percent of requests. A real read-only run [41858802553](https://github.com/serox94/dream-team/actions/runs/41858802553) passed. These additions remain in this draft PR and are not active on the main schedule until merged. Workflow failure alert delivery has not been demonstrated.
