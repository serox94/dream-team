# Dream Team — permanent architecture

Dream Team is one multi-year carp fishing trip manager for Patryk and Maciek. It must never require a new website for a new year or lake.

## Source of truth

`serox94/dream-team` is the only production source of truth. `serox94/ryby2026` is a visual/functional reference and migration source only. Once the legacy frontend has been copied completely, production builds must not depend on or overwrite files from `ryby2026`.

## Permanent modules

These are global and independent of a trip/lake:
- Wezly
- Rigi
- application shell/navigation/responsive UI
- anglers Patryk and Maciek
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
- Angler PB: largest catch by that angler across every trip/year.
- Dream Team record: largest catch by either angler across every trip/year.
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
