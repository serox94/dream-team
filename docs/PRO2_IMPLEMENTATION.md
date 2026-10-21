# DreamTeam PRO 2.0 — review candidate

Production is out of scope. The branch starts at main `10342425baf44f4d2ff7300b9548a64e5b998079`; live read-only inspection on 2026-10-21 confirmed production `a21b8af58c7c29510b2889042f36800df7e46da1`, Worker `27ea7f61-1feb-4404-bb26-9478c51c88bd`, schema 29, maintenance OFF.

## Weather and measurements

`public/carp-index.js` is the deterministic `carp-conditions-2.0.0` model. Base 50, light ±12, cloud ±8, a single interacting weather-change feature ±6, wind ±4. Pressure past/future 3/6/12 h is disclosed. No absolute-pressure bonus; no separate rainfall/front bonuses. Moon, unvalidated habitat and local catch-history inputs have zero weight. Dissolved oxygen is absent. All coefficients are explicit heuristic assumptions, not empirically calibrated probabilities. Weather-only scores cannot exceed 80.

Water readings are scoped to both the trip and the stored lake. Source, absolute instant, depth and notes persist in D1. One reading never creates a trend. No water forecast is inferred from air. Thermal context only applies a conservative penalty below 10°C or above 26°C, not an unvalidated positive optimum. Maximum influence is 5 points for surface and 7.5 for a specified depth, linearly reduced to zero over 24 hours relative to each forecast hour. It never changes the observed reading. These thresholds are deliberately conservative engineering assumptions requiring future field validation. A known depth is not automatically the depth of the rigs. Missing water data do not increase any other weight.

Null critical inputs yield null scores, never zero. DANGER takes precedence over UNKNOWN. Storms, extreme wind/rain/air temperatures and unknown/stale data are excluded from recommended windows. Windows require three adjacent absolute hours, including at DST transitions. IANA labels include timezone abbreviations. Cached forecasts disclose original retrieval time and cannot confirm safety. Live Open-Meteo requests retain cache, retries and explicit units, with 12 past hours.

The approved dark A layout is used for the overview; analytic charts and parameter tables are below. SunCalc 1.9.0 is locally bundled. Local-day moonrise/set and approximate upper/lower lunar transits are displayed with clearly hypothetical major/minor windows and zero score weight. Astronomical values are approximate; solunar significance is unvalidated. Local browser fixtures are explicitly QA data, never injected into remote preview.

Water history works offline. Water writes require a connection: the existing offline mutation queue only supports catches, spots, notes and packed status; extending its replay contract is intentionally deferred. A failed save preserves the form. Revision checks prevent silent overwrite; mutation IDs prevent duplicate successful submissions.

## Translations — actual Cloudflare inference

The original general-provider blocker was resolved in the PR14 follow-up. Deployment is still preview-only. No DeepL, paid subscription or production change was introduced. The read-only account subscription API returned only R2 Paid and no Workers Paid subscription. R2 Paid does not enable AI overage; Workers Free has a platform hard stop at the shared 10,000-neuron daily allocation. The additional D1-backed application budget is atomic across tabs, reserves before inference, includes failures/timeouts, and settles successful Llama usage from provider token counts (or conservative byte bounds). Other AI features retain `AI_FREE_ONLY=false`.

**Raw M2M100 alone failed domain quality.** Thirty-two real calls through the actual AI binding are retained in `docs/verification/m2m100-raw-2026-10-21.json`, from workflow 39585173297. Examples: “Kulki proteinowe” → “Protein Bullets”, “Landing net” → “lądowanie netto”, “Sleeping bag” → “Śpiąca torba”. An 8B review trial was also rejected. The selected working alternative, still on Cloudflare, is `@cf/meta/llama-3.3-70b-instruct-fp8-fast` as a contextual correction stage after the M2M100 draft. Its 32 live calls from workflow 39587959031 passed the published terminology checks; exact outputs and provenance are retained in `docs/verification/llama70b-live-2026-10-21.json`. This is a terminology check, not a claim of perfect linguistic quality. Subsequent transport-only reruns reuse that recorded live benchmark instead of spending the allowance again.

The runtime uses an exact bilingual domain glossary first, then M2M100 plus the 70B review for general text. Short chunks avoid encoder truncation. Both original and corrected chunks are cached persistently; per-chunk leases deduplicate concurrent records. Long documents bulk-read their cached chunks in bounded groups so resuming does not exceed D1/Workers subrequest limits. Every request advances at most two uncached chunks, with original-source and manual-correction guards. Jobs can resume after cancellation or provider/transport failure. Old automatic drafts are reprocessed; approved manual translations and originals are retained.

`content_sources`, `translation_jobs`, `translation_cache` and the existing translations table retain source language/hash, queue status, provider and revision. Source-language detection now scores ASCII English/Polish words, domain phrases and Polish characters independently of the UI hint; genuinely ambiguous text uses the UI/stored hint. Explicit source-language corrections are persisted and respected. Source edits make old translations stale. Original records, checklist IDs, order and packed state are not changed by translation. Existing cached translations remain available offline.

Source fields: checklist labels/notes, global categories, catch notes, descriptive spot fields, trip notes/documents, research values, and an explicit allowlist of descriptive lake/trip facts. Trip/lake/person identifying names, URLs, coordinates, timestamps, IDs, quantities and authentication fields are excluded. Bait fields are always excluded, including legacy saved bait translations. Species use a controlled dictionary. Proper names inside descriptive spot-name fields cannot be reliably classified automatically; keep these fields descriptive.

The original isolated copy had 400 unique field jobs (2 glossary-complete, 398 pending). Current completion counts, superseded language directions, any failed fields and token-budget state are recorded by `pro2-ai-status/activation.json` in the latest workflow artifact; prior intermediate counts are not completion evidence. The actual two-account Chromium workflow separately checks PL/EN UI creation, persisted D1 translations, source edit, packed status, reload, a fresh browser context, offline, historical records, six protected commercial bait values and three translated species. Its disposable test records are soft-deleted afterward. No production data are mutated.

Cloudflare primary sources reviewed 2026-10-21:
- https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/
- https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- https://developers.cloudflare.com/workers-ai/platform/pricing/

## Google Photos

Optional D1 trip field, present in both creation flows and edit form. Catches link to the entire selected trip album. Archive links use each card's ID without changing selected or global active trip. No Google OAuth/API, photo imports, R2 objects, fake counts or covers. HTTPS, exact hosts, allowed album paths, no credentials/ports, no arbitrary redirects; safe external links.

France assignment is not a migration by name. Preview provisioning enumerated two 2026 France candidates. The user explicitly selected the November 14–21 trip, ID `next-trip`; the script checks that exact ID, name and date before assignment. It records ID/name/lake/dates and only assigns the supplied album on the isolated D1. Production assignment remains unauthorized.

## Migration and preview

0030 is additive. Existing account/password/session records are unchanged by migration. HTTP and cron require exact schema 30 and the full migration registry, so code must never be deployed against production29. Preview workflow checks its exact branch, reads production, reconstructs privately, verifies old columns/rows, migrates locally, restores to a new D1 and deploys only `dream-team-pro2-preview` with an isolated media bucket and no cron. Copied preview sessions and login-rate records are cleared only on the isolated copy. Existing passwords remain unchanged. Source SQL/configuration/credentials are never artifacts. Production DB bindings never enter preview configuration. Re-running preview provisioning creates a fresh isolated environment; test measurements there are not production data.

## Verification evidence (2026-10-21)

At `b8b0fa8a3c1afb16e49c03b16d48a7bf4207c7a6`, isolated preview workflow [39576994645](https://github.com/serox94/dream-team/actions/runs/39576994645) completed successfully: 171 tests, migration 29→30 preserving source rows, real Open-Meteo HTTP 200 and 12 live Chromium viewport/language scenarios. Archive queue: **2 completed exact glossary translations, 398 pending general text fields** (400 unique jobs; per-trip snapshots are cumulative, not additive). No real general-provider inference was performed. Production writes/deployments: zero; production version/schema remained unchanged.

The separate responsive CI run exposed a keyboard-focus race in the offline conflict banner: background cache refresh replaced the focused Resolve button between focus and Enter. The follow-up fix preserves focus when redrawing the banner. Its existing Chromium keyboard test now deliberately refreshes bootstrap while the button is focused, then opens and resolves the real 409 conflict with Enter in PL and EN.

Preview: https://dream-team-pro2-preview.sewerynski00.workers.dev
Draft PR: https://github.com/serox94/dream-team/pull/14

READY TO MERGE: NO — final workflow evidence and approved-A visual acceptance remain the review gate; do not infer readiness from an intermediate backfill count.
READY TO DEPLOY PRODUCTION: NO — no production consent, required schema30, and final review.
