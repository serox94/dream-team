# Release and monitoring work in progress

The existing PR23 release operator remains pinned to historical identifiers and must not be used as a generic release.

`scripts/universal-release.mjs` is a prototype with no production provider adapter or executable workflow. It must not be used to deploy. Its tests cover approval scoping, checkpoint and isolated-test gates, source rechecks, ambiguous activation and conservative fallback selection. They use test doubles and do not constitute an isolated D1 migration or a real end-to-end release.

Before this can be marked ready, implement and verify a concrete adapter that preserves a write barrier and a verified recovery point through migration, validates actual candidate/fallback bindings and schema compatibility, and manages Cloudflare control-plane uncertainty. Exercise the whole adapter with an actual isolated Worker and D1, including failure and recovery, without production access. The earlier isolated Worker and Time Travel demonstrations are separate evidence, not this end-to-end test.

The monitoring workflow retains the scheduled backup freshness and HTTP availability check. It additionally surfaces failures of the listed existing release, migration, recovery and backup workflows as failed monitoring jobs with a run link. GitHub email delivery depends on user notification settings and was not verified for these jobs. A Cloudflare notification test arrived in the account owner's inbox, confirming delivery of the sample message; it does not prove that production Worker error telemetry is configured or that every failure category generates an email.

Production and Preview runtime code and data are not changed by this branch.
