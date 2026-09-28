# Dream Team — permanent architecture

Dream Team is one multi-year carp fishing trip manager for its participating anglers. It must never require a new website for a new year or lake.

## Source of truth

`serox94/dream-team` is the only production source of truth. `serox94/ryby2026` is a visual/functional reference and migration source only. Once the legacy frontend has been copied completely, production builds must not depend on or overwrite files from `ryby2026`.

## Permanent modules

These are global and independent of a trip/lake:
- Wezly
- Rigi
- application shell/navigation/responsive UI
- anglers and historical personal bests
- all-time statistics and personal bests

## Trip-scoped modules

These always use the selected trip:
- Dashboard
- Pogoda (trip lake GPS)
- Dojazd, parking, shops, food and local logistics
- Regulamin and required equipment
- Polowy
- Mapa and saved spots
- Checklisty (per-trip state, reusable template)
- Porady, technique, lake characteristics, seasonal tactics and curiosities

## Data model rules

A trip references a lake profile and has its own dates, peg, catches, spots and checklist state.
Lake knowledge is data, not hard-coded HTML. It includes coordinates, map/images, size, depths, bottom, fish stock, known lake record, stands, rules, boats/bait boats, rods, facilities, electricity, sanitary facilities, access, shops, contacts, sources and research notes.
Advice combines lake knowledge with the trip date/season and can be extended with weather and selected peg/spot.

## Statistics

- Trip record: largest catch in the selected trip.
- Angler PB: maximum of the recorded pre-application PB and non-deleted catches across every trip/year.
- Dream Team record: largest catch by any angler across every trip/year.
- Historical catches are never deleted when a trip is archived.

## UI rule

Changing the selected trip changes all trip-scoped content but never changes the layout or permanent modules. No page may silently show content belonging to a different lake. If trip-specific data is unavailable, show an explicit missing-data state instead of legacy/default lake content.

## Adding 2028, 2029, 2030...

Adding a future trip must require only:
1. create/update the lake profile from researched sources,
2. create the trip with date/peg,
3. optionally copy a checklist template,
4. activate/select the trip.

No new HTML pages and no lake-specific JavaScript branches should be required.

## Runtime and recovery (2026-09)

`dream-core.js` owns API access, lake timezone conversion and header state. The loader initializes existing screen modules once, after bootstrap. The compatibility facade preserves the legacy frontend API while routing all persistence to D1. There is no runtime Supabase dependency.

When the `RYBY_API_WRITE_TOKEN` Worker secret is provisioned, every mutating API route and the complete JSON export require its bearer token. Reads remain public. The frontend requests the token on the first protected action and stores it for that browser tab. Without a configured secret, existing public behavior remains in place to avoid locking users out during rollout. A separate Cloudflare Workflow Worker under `backup/` can export D1 daily to private R2 after Cloudflare provisioning. It does not change any production rows or the main Worker's bindings.

`trip_participants` joins trips and anglers. Catch, spot and checklist writes require the selected trip. Archiving does not remove data. Deletions set `deleted_at`; recovery and full JSON export retain the original IDs and links.

Lake profiles are editable in the management page, including coordinates, timezone, maps, rules, logistics and advice. Existing trip-specific researched documents remain in D1. Preserved rich Plaine material is a static content pack under `public/data/lakes/`, selected by profile data. New lake profiles use generic renderers and do not need a new HTML page.

Cloudflare builds use Node 24 (`.node-version`). Production deployment runs the regression suite and publishes the Worker. If D1 is at schema 16, the Worker applies the additive migration on its first API request and records the Wrangler migration marker. Rollback should restore code only; never drop the additive columns or clear data to roll back a release.
