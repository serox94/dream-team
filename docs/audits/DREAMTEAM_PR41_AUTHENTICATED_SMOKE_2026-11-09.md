# DreamTeam — authenticated production acceptance (2026-11-09)

Source: GitHub Actions [run 42647684246](https://github.com/serox94/dream-team/actions/runs/42647684246), test commit `043ddc369fd4e8ee8b92fd332b372d5e788ae48e`.

## Result: READY FOR DAILY USE — YES WITH LIMITATIONS

- The **real production** accepted one normal authenticated Patryk login; a test session was created and then removed via `/api/logout` (HTTP 200). D1 session count 6 → 7 → 6.
- Authenticated `/api/bootstrap`: HTTP 200, 5 trips, 3 anglers, 4 lakes.
- Authenticated `/api/accounts`: HTTP 200, 4 accounts.
- Authenticated checklist categories: HTTP 200, 10 categories.
- Authenticated Weather PRO API: HTTP 200 (884 ms), current/hourly/daily/dreamteam data available, no JSON NaN.
- **33 of 33 browser page/viewport combinations**: HTTP 200, global bootstrap ready, no horizontal overflow, no unhandled JS errors; 15 different pages at 390 px and six critical pages each at 768/1280/1440 px.
- Encyklopedia and Deeper knowledge modules: ready.
- The active trip checklist correctly rendered 64 items. Time to numeric counter: 9.12 s (390 px), 8.87 s (768 px), 8.76 s (1280 px), 8.82 s (1440 px). Better than prior 19–24 s, but still slow.
- Fresh PWA/offline read of Sonar: PASS.
- D1 after logout: trips 5, catches 3, checklist items 103, accounts 4, sessions 6, translations 402; schema 32, maintenance off. Production Worker remains `ea63f54e-5f85-4f0b-88f3-b75c4a431690` (100% traffic).

## Why GitHub marks the test run red

One test harness assertion `bootstrap_structure` mistakenly expected a top-level `catches` array. The actual and approved `src/worker.js` intentionally returns trips and aggregate catch statistics instead of a top-level catches array. It was a **test assertion error**, not an application failure. The real bootstrap request returned HTTP 200 and complete expected primary collections. The incorrect assertion is retained in the original evidence rather than relabeling the original run as green.

## Unresolved / limitations

1. **HIGH operational:** the latest 2026-11-09 environment audit still reported `DREAMTEAM_PRODUCTION_APPROVED=yes`. Restore `no` through GitHub Settings → Environments → production. The GitHub connector available to this audit cannot update environment variables.
2. **NOT TESTED:** upgrade of a previously installed PWA on the user's actual device.
3. **NOT TESTED in this live production run:** offline writes, conflict resolution and data editing — historic PR41 isolated regression evidence exists.
4. **PARTIAL:** deep field-by-field validation of Weather PRO, PL/EN interactions and Google Photos buttons.
5. **P2:** checklist load about 9 s.

No code deployment, production business data edits, migrations or Cloudflare configuration changes were performed during this acceptance test. A separate audit-only workflow was committed on an isolated operations branch; its result artifact contains only technical status and counts, no passwords, sessions or private record values.
