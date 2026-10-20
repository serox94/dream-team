# DreamTeam — Astra audit fixes / release checkpoint

Updated: 2026-10-20. This is an implementation and acceptance record, not a repeat audit.

**Deployment: BLOCKED pending browser acceptance, fresh private restore proof and the manual release gate.**
Production last verified at `600d1f55ad0481a77cfc725a7a1810ea15347ee0`, Worker version `d43aa522-4781-4259-a298-72b6e9793288`, schema 28, maintenance OFF. Manual read-only Cloudflare inspection run `39258416287`: PASS; zero other releases/builds, expected D1/R2 bindings and required secrets present. No production mutation has been performed by this fix batch at this checkpoint.

## Commits and scope

Branch: `fix/astra-audit-20261019`. Base `600d1f5`; includes PR #12 at `138e26d85f1a37c892303e0eec12f28755cca18d` without reimplementing its recovery logic. PR #12 remains open until final integration. Implementation checkpoints: `d7c7acd`, `f21627a`, `d67ab70`, `7a5a324`; offline-test diagnosis `1a00be5`, `3bae9cd`; corrected offline gate `6003086347e28d11788185506771b3f7d56a20ed`.
Separate existing operational branch `ops/astra-release-20261019` carries only the explicit manual inspection/backup/release operator. There is no push-triggered production deployment.

## All 15 findings

FIXED means an implemented fix with the evidence listed below; production acceptance is a separate gate. VERIFIED identifies a completed targeted check. A pending test is never a PASS.

| Finding | Status | Implementation / evidence | Remaining acceptance |
|---|---|---|---|
| H01 Last active account | FIXED | Migration 0029 atomic BEFORE UPDATE/DELETE guards; protected-account guard; transactional session revocation only after a successful change. `tests/astra-audit.test.mjs`, account tests: PASS, including concurrent deactivation and protected reset/CAS. Own deactivation requires confirmation. | Live protected-account acceptance / release. |
| H02 Missing weather data treated as calm | FIXED | Shared safety engine validates WMO codes, required wind/gust/rain, current observations and 24 continuous hourly records; incomplete coverage is UNKNOWN and has no reassuring window. Missing/current/short forecast unit cases PASS. | Targeted Chromium acceptance. |
| H03 Hidden dashboard thunderstorm | FIXED | Dashboard and Weather PRO use the same safety aggregation; current and later storms precede ordinary weather/packing. Shared-engine tests PASS. | Actual rendered storm cases in Chromium. |
| M01 Weather failure/recovery | FIXED | PR #12 retained: GPS/query cache key, five-minute cache, bounded 30-minute stale fallback, first-error loading termination, explicit last-forecast notice. Recovery/error tests PASS. | Browser refresh outage and actual production source. |
| M02 Weather hazard ordering | FIXED | Storm messages precede wind; all hazard intervals retained with times, not just the first windy hour. Unit scenarios PASS. | Rendered wind-before-storm scenario. |
| M03 First Weather visit offline | FIXED | Required weather analysis module is in the versioned SW warm manifest. Run `39260423981` exposed a test synchronization bug: async Playwright predicates returned truthy promises while only 25 resources had loaded. `qa-offline-ready.mjs` now awaits CacheStorage in Node, checks the current cache, complete marker, controller and every warm resource; incomplete/false-promise gate regression PASS. | First-visit Weather offline PASS with all 91 resources and complete marker in run `39368039611`; finish the remaining browser interactions. |
| M04 Language initialization race | VERIFIED | Selector insertion uses its actual parent; one Settings selector. Both PL/EN and early/late locale execution, four JSDOM cases PASS. Full five-width PL/EN rendering PASS in run `39259695055`. | Final candidate browser acceptance. |
| M05 Missing interface translations | FIXED | Missing weather/auth labels and error messages translated. Responsive scanner now fails on untranslated UI (with explicit user/source-text exclusions). Five widths × 15 screens in PL and EN PASS in run `39259695055`. | New password/translation editor interaction and final commit. |
| M06 Occupied category deletion in EN | VERIFIED | Stable `CATEGORY_NOT_EMPTY` code replaces matching Polish error text. PL/EN UI tests move entries while preserving ID/packed state: PASS. | No production deletion test will be made. |
| M07 Invalid time zones | VERIFIED | Backend validates real IANA zones; invalid input 400 preserves preference. Frontend tolerates historical invalid data. Targeted cases PASS. | Read-only production Settings smoke. |
| M08 R2 backup pagination | VERIFIED | Worker/REST status readers exhaust pages, detect invalid/repeated cursors and choose newest timestamp globally. 1000+ objects and deliberately short pages: PASS. | Fresh private R2 inventory/copy/restore release proof. |
| M09 Keyboard offline conflicts | FIXED | Native focusable button/dialog, explicit server/mine/cancel actions, focus restoration and announced errors. Focused DOM conflict tests PASS. | Actual Chromium keyboard resolution. |
| M10 Private page framing | FIXED | Private HTML has `frame-ancestors 'none'` and X-Frame-Options DENY; targeted response tests PASS. | Confirm authenticated production headers after release. |
| L01 Weather page length | FIXED | Safety/decisions/source first; 24 compact expandable hour cards; secondary measurements retained in native details. No forecast data removed. | Chromium collapsed/expanded cards and 390/1280 layout. |
| L02 Startup cost | VERIFIED | Independent EN dictionaries load in parallel; weather modules only load on dashboard/weather. Controlled actual-i18n fixture with 80 ms per fetch: sequential 264 ms, parallel 90 ms; all three current reads start at 1 ms (`locale-waterfall.json` in private local evidence). CI dashboard 148–189 ms / 28 requests. This does not claim a measured whole-production speedup or a memory leak fix. | Final runtime acceptance only; no framework rewrite. |

## Additional requested behavior

- Protected system account: stable separate profile/account IDs, own salted PBKDF2 credential with Worker-secret pepper, max three active angler accounts plus the protected system account. Initialization is explicit operator work; no HTTP/cron migration or initialization. Initial password never appears in source, logs or artifacts. Existing shared credentials and sessions are preserved.
- First login is restricted to its password-change screen; no private application data before rotation. To prevent takeover using the publicly specified weak initial credential, first rotation also requires the existing team shared password. Protected identity cannot be disabled, deleted or renamed via API/SQL races. Its zero-PB system profile is excluded from fishing participants/statistics.
- User-content PL/EN: versioned separate translations with source SHA-256, revision CAS, stale detection, numeric/URL preservation, Settings corrections and account-scoped offline read cache. Original fields remain unchanged. Unit tests PASS. Actual editor/save/offline/stale-source acceptance is part of targeted Chromium QA.
- **Automatic user-content translation: NOT IMPLEMENTED / provider decision pending.** No trusted free provider is configured. No private text was sent to Tavily, AI or an external translation service. One later decision is needed: choose/authorize a provider, or retain the working manual workflow. This is not represented as automatic translation PASS.

## Test evidence / release gates

- Existing Validate run `39260282892`: PASS on `3bae9cd`; earlier full implementation Validate `39257476608` and `39258361283`: PASS. No earlier audit or completed modernization stage was repeated.
- Responsive run `39259695055`: all five PL and EN widths, 15 screens, independent locale persistence, existing offline field operations PASS; the new first-offline-Weather acceptance failed due to the async-predicate issue above. Overall run remains FAIL, never relabeled PASS.
- Targeted run `39260423981`: FAIL; CSS/loader absent because the test disconnected before the complete marker. This is the outstanding failure being repaired, not evidence that a partial cache is sufficient.
- Corrected offline-wait regression: PASS. Run `39368039611` confirmed complete marker, all 91 assets, first offline Weather readiness, keyboard conflict and PL weather scenarios. It then found a test interaction trying to fill the intentionally collapsed Add participant section; the test now opens its summary as a user would. Final acceptance remains pending.
- Migration 0029 changes only auth guards/credential/translation structure and schema version. Existing IDs and rows remain untouched. A separate operational model test verifies 28→29, SQL initialization with no plaintext password, preservation of original account rows/shared credential/sessions, and immutable system account: PASS. Cloudflare restore/migration proof still pending.

## Private release / rollback

Only workflow_dispatch on `ops/astra-release-20261019`, with production concurrency lock and environment gate. First capture active version/config/bindings and queues. Fresh private D1 export + Time Travel bookmark + SHA-256, complete private R2 inventory/copy/hash, new isolated D1/R2 restore, explicit 28→29 rehearsal and second restore must pass before production changes.
An RSA-OAEP envelope supplies the initial account credential privately; its private key stays in the dedicated private R2 archive. No new shared password or production secret is set. The release makes a further frozen checkpoint under HTTP/write/cron maintenance, verifies an isolated candidate, applies only migration 0029 and the three new system rows, preserves old sessions, then deploys the exact accepted commit. No paid AI/Tavily queries are part of this operation.
On failure keep maintenance ON and retain private recovery manifest. Never automatically roll an old schema-28 Worker onto schema 29. Restore into new isolated resources first, reconcile later writes/revoked sessions, and use a compatible roll-forward or an explicitly reviewed restoration. Never rewind production blindly.

**READY TO DEPLOY PRODUCTION: NO — final browser gate and fresh private restore proof are pending.**
