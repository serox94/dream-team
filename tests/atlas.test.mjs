import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

test('every supplied Fish Deeper screen is present and annotated without certain species claims', async () => {
  const atlas = JSON.parse(await readFile('public/assets/deeper/chirp2/index.json', 'utf8'));
  assert.equal(atlas.screenshots.length, 17);
  assert.equal(new Set(atlas.screenshots.map(s => s.src)).size, 17);
  for (const shot of atlas.screenshots) {
    assert.match(shot.src, /^fish-deeper-[\w-]+\.png$/);
    assert.ok((await stat(`public/assets/deeper/chirp2/${shot.src}`)).size > 1000);
    assert.ok(shot.observed.length > 20 && shot.explanation.length > 20);
    assert.ok(['niska', 'średnia', 'wysoka'].includes(shot.confidence));
    assert.ok(shot.region.x + shot.region.width <= 100);
    assert.ok(shot.region.y + shot.region.height <= 100);
    assert.doesNotMatch(shot.explanation, /na pewno (karp|leszcz|żwir|muł)/i);
  }
});
