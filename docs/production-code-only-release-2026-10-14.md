# Production code-only release — 2026-10-14

Approved application: `600d1f55ad0481a77cfc725a7a1810ea15347ee0`.
Operator: `140fb399fa1686a6af820bab837a191251ade202` on `ops/code-only-600d1f5-20261014`.
Manual workflow run: https://github.com/serox94/dream-team/actions/runs/38518524332 — SUCCESS.
Active Worker: `d43aa522-4781-4259-a298-72b6e9793288` (100% traffic). Maintenance OFF.

The version-specific Cloudflare bindings and live build header were used as the source of truth: mutable script settings still contained the repository placeholder. Two earlier attempts stopped before maintenance or any production mutation while this operational guard was corrected.

Fresh frozen schema28 D1 export, Time Travel bookmark, SHA-256 and private manifest were retained in private R2. SQL SHA-256: `7440193a254b97620f5c4a250c0b8475faeaa2df8c4de927e089b263782cf700`. The complete schema, all 26 tables / 256 rows, sequences and foreign keys were restored and compared on a new isolated D1. R2 full inventory / copied-object restoration / source preservation passed (0 source objects).

Production data, original session rows and credentials were compared with the frozen snapshot. Only the temporary maintenance flag and release-owned login/logout sessions were changed; the maintenance setting was restored exactly. A cookie issued before deployment remained valid afterwards. Migrations: 0; account initialization: 0; global session purges: 0. Production business writes / media writes: 0. No Tavily or Workers AI calls.

Targeted API and Chromium smoke passed on the restored candidate and actual production: both existing individual logins, logout/revoked test cookie, authorization and cross-origin rejection, all trips including archived trips, checklists/catches, dashboard, current catch author, Settings, PL→EN→PL persistence, real Weather PRO forecast and analysis, 390/1280 px, no horizontal overflow or JavaScript errors. Unused-lake deletion passed through the Settings UI on an isolated synthetic fixture; no production lake was deleted.

The previous compatible schema28 Worker `4170c749-a114-4075-ba7b-be0e7e8dee25` and its active configuration are retained privately. No automatic rollback was performed. Any future rollback requires maintenance, a fresh data checkpoint, verification of the selected version's schema28/account/session compatibility and bindings, and a separate successful smoke before reopening. Do not invoke the old schema20 migration operator or restore D1 merely to roll back code.

Private SQL, bookmark, original settings and media manifest remain private; the public proof contains safe status only. Disposable D1/canary/IO resources were cleaned up. Cloudflare Builds, workflow enablement, secrets and passwords were not changed. No merge or push-triggered deployment occurred.

Evidence: [safe status](verification/code-only-release-38518524332.json), [successful manual run](verification/code-only-release-38518524332.jpg).
