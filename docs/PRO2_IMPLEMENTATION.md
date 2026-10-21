# DreamTeam PRO 2.0 — review candidate

Production is out of scope. The branch starts at main `10342425baf44f4d2ff7300b9548a64e5b998079`; live read-only inspection on 2026-10-21 confirmed production `a21b8af58c7c29510b2889042f36800df7e46da1`, Worker `27ea7f61-1feb-4404-bb26-9478c51c88bd`, schema 29, maintenance OFF.

## Weather and measurements

`public/carp-index.js` is the deterministic `carp-conditions-2.0.0` model. Base 50, light ±12, cloud ±8, a single interacting weather-change feature ±6, wind ±4. Pressure past/future 3/6/12 h is disclosed. No absolute-pressure bonus; no separate rainfall/front bonuses. Moon, unvalidated habitat and local catch-history inputs have zero weight. Dissolved oxygen is absent. All coefficients are explicit heuristic assumptions, not empirically calibrated probabilities. Weather-only scores cannot exceed 80.

Water readings are scoped to both the trip and the stored lake. Source, absolute instant, depth and notes persist in D1. One reading never creates a trend. No water forecast is inferred from air. Thermal context only applies a conservative penalty below 10°C or above 26°C, not an unvalidated positive optimum. Maximum influence is 5 points for surface and 7.5 for a specified depth, linearly reduced to zero over 24 hours relative to each forecast hour. It never changes the observed reading. These thresholds are deliberately conservative engineering assumptions requiring future field validation. A known depth is not automatically the depth of the rigs. Missing water data do not increase any other weight.

Null critical inputs yield null scores, never zero. DANGER takes precedence over UNKNOWN. Storms, extreme wind/rain/air temperatures and unknown/stale data are excluded from recommended windows. Windows require three adjacent absolute hours, including at DST transitions. IANA labels include timezone abbreviations. Cached forecasts disclose original retrieval time and cannot confirm safety. Live Open-Meteo requests retain cache, retries and explicit units, with 12 past hours.

The approved dark A layout is used for the overview; analytic charts and parameter tables are below. SunCalc 1.9.0 is locally bundled. Astronomical values are approximate; solunar significance is unvalidated. Local browser fixtures are explicitly QA data, never injected into remote preview.

Water history works offline. Water writes require a connection: the existing offline mutation queue only supports catches, spots, notes and packed status; extending its replay contract is intentionally deferred. A failed save preserves the form. Revision checks prevent silent overwrite; mutation IDs prevent duplicate successful submissions.

## Translations — PARTIAL, not a general-provider PASS

Original business records are never overwritten or duplicated. `content_sources`, `translation_jobs`, `translation_cache` and the existing translations table track original language/hash, queue status, provider and revision. Exact domain glossary works both ways for the requested checklist examples and categories. Unknown historical text defaults to PL unless a stored source language or exact glossary/Polish diacritics determines otherwise. Settings permits correcting source language. A known limitation is that ambiguous historical English without a dictionary match must be classified correctly before general-provider backfill.

M2M100 adapter is implemented but **DISABLED**. No real inference was executed. Activation requires explicit `TRANSLATION_ENABLED=true` and `TRANSLATION_FREE_CONFIRMED=true` plus AI binding. Existing `AI_FREE_ONLY=false` is retained in preview and no AI binding is deployed. An application flag alone does not guarantee account-wide free allowance. User cost/activation decision remains outstanding. General PL/EN, whole-archive completion and real-provider quality are BLOCKED on that decision; mock contract tests are not real-provider evidence.

Provider errors preserve originals, use sanitized error codes, bounded attempts and small batches. Cache and source hashes deduplicate, and atomic conditional updates prevent stale results or automatic replacement of manual corrections. Source edits make old translations stale. Corrected manual translations remain until reviewed. Source fields: checklist labels/notes, global categories, catch notes, descriptive spot fields, trip notes/documents, research values, and an explicit allowlist of descriptive lake/trip facts. Trip/lake/person names, URLs, coordinates, timestamps, IDs, quantities and authentication fields are excluded. Bait fields are always excluded, including legacy saved bait translations. Species use a controlled bilingual dictionary, not AI. Proper names entered in a descriptive spot-name field cannot be reliably identified automatically; that field should remain descriptive.

Cloudflare primary sources reviewed 2026-10-21:
- https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/ — $0.342/M input and output tokens.
- https://developers.cloudflare.com/workers-ai/platform/pricing/ — 10,000 free neurons/day shared across account; paid usage above allowance is $0.011/1,000 neurons.
- https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans — API Free: 500,000 characters/month, a separate account/key and data processor. No new DeepL account or transfer activated.

## Google Photos

Optional D1 trip field, present in both creation flows and edit form. Catches link to the entire selected trip album. Archive links use each card's ID without changing selected or global active trip. No Google OAuth/API, photo imports, R2 objects, fake counts or covers. HTTPS, exact hosts, allowed album paths, no credentials/ports, no arbitrary redirects; safe external links.

France assignment is not a migration by name. Preview provisioning first enumerates production 2026 France candidates and requires exactly one. It records ID/name/lake/dates and only assigns the supplied album on the isolated D1. Production assignment remains unauthorized.

## Migration and preview

0030 is additive. Existing account/password/session records are unchanged by migration. HTTP and cron require exact schema 30 and the full migration registry, so code must never be deployed against production29. Preview workflow checks its exact branch, reads production, reconstructs privately, verifies old columns/rows, migrates locally, restores to a new D1 and deploys only `dream-team-pro2-preview` with an isolated media bucket and no cron. Copied preview sessions and login-rate records are cleared only on the isolated copy. Existing passwords remain unchanged. Source SQL/configuration/credentials are never artifacts. Production DB bindings never enter preview configuration. Re-running preview provisioning creates a fresh isolated environment; test measurements there are not production data.

READY TO MERGE: NO — general translator activation/real quality/backfill and final review remain.
READY TO DEPLOY PRODUCTION: NO — no production consent, required schema30, and outstanding translator.
