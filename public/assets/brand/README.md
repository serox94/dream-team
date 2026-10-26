# DreamTeam brand assets (provisional extraction)

Source: user-provided 2026-10-26 DreamTeam brand board, showing the fish/forest/tent motif, wordmark, compact mark and app icon.

These four vector assets were **traced from the supplied raster brand board** without redesigning the shape. They are provisional, not original designer-supplied vector sources:

- `dreamteam-logo.svg` — green fish and dark DreamTeam wordmark for light backgrounds.
- `dreamteam-logo-light.svg` — cream symbol and wordmark for dark header.
- `dreamteam-mark.svg` — green compact carp/tent/forest motif (no wordmark).
- `dreamteam-icon.svg` — cream compact mark on forest-green rounded-square background.

Brand colours sampled from the supplied board: forest green `#0F2E1F`, cream `#F4F2E9`; alternate dark wordmark `#1E1E1E`.

Both replacement crew photos have now been supplied and committed as optimized AVIF assets under `public/assets/img/`. The dashboard renderer switches between the duo and trio images according to the selected trip's participants. **Do not merge/deploy until** integrated UI checks pass and the broader planned header/navigation changes are reviewed. Existing `public/icons/ryby-*.png` and the site header remain untouched on production.

Before enabling as the PWA icon, generate tested PNG sizes for Android/iOS, update the manifest, favicon and apple-touch-icon consistently, and check installed-app refresh behaviour. Keep the design consistent with the source collage. If original transparent PNG/SVG from designer becomes available, prefer those for best fidelity.
