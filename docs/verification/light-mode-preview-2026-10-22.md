# DreamTeam Light Mode experiment — preview only

Base: PR #15, `ce669dafc138b9d92faa26acf1c64a254ca657d6`.
Branch: `experiment/light-mode-20261022`. No merge or production deployment authorized.

## Change

Shared cream / white / forest-green / olive palette in `theme.css`, including legacy cards, inputs, status messages, checklist templates, trip Photos CTA, knowledge/Deeper frames, navigation and Weather PRO SVG charts. Photographs and the educational sonar images keep their original colors. Established Dark CSS is unchanged; Dark remains the default regardless of the operating system setting.

The 44px native switch is in the header (beside PL/EN on Weather) and on login/password forms. It has localized switch semantics, native keyboard interaction, synchronous appearance application, local persistence, storage-event synchronization, and theme-color updates. Hover transitions are suspended briefly while switching so surfaces do not pass through unreadable grey. Only two public static resources are added to the login asset allowlist; API/account/session authorization rules do not change.

The PWA shell warms both theme assets with a new shell version. No business/translation/weather calculations, provider settings or production configuration change.

## Targeted verification

`node scripts/build.mjs`

`node scripts/qa-themes.mjs`

`node scripts/qa-themes.mjs --live`

The suite checks all 15 signed-in screens in PL/EN at 390 and 1440px, Dark presentation against the existing stylesheets, immediate keyboard switching without reload or content/model changes, overflow and header collisions, Light text contrast using axe `color-contrast`, Weather chart contrast, Photos URL, login, close/reopen persistence, and actual PL/EN selector changes. A separate local Chromium PWA scenario warms real read-only screen data, goes offline, reloads and navigates with both themes. Native installed iOS/Android testing is not implied by the Chromium PWA test.

Automated contrast results distinguish failures from axe cases that require visual review (photographs, browser-native controls, overlapping/sticky elements); the latter are retained in `results.json` rather than hidden or presented as a complete accessibility certification.

The manual `ui_only` workflow runs only targeted theme checks, checkpoints the retained preview D1, refreshes its Worker without creating a database or migrating anything, checks actual preview/screenshots, then compares all 14 business/translation table counts and hashes, AI-budget values, DB binding and production Worker version. Browser business writes and background translation inference are blocked; test login/logout affect only the suite's own preview sessions.

## Evidence

The Actions `pro2-ui-evidence` artifact contains fixture/live `results.json`, unmodified browser PNGs, `checkpoint.json`, `deploy.json`, `before.json` and `integrity.json`. The final run and tested SHA are linked in the experiment PR. Screenshots include paired Start, Weather, checklist, catches at 390px and Start at 1440px, plus login, Photos, categories and chart evidence.

Preview: https://dream-team-pro2-preview.sewerynski00.workers.dev

Visual acceptance: **AWAITING USER REVIEW**. This experiment is not approval for production.
