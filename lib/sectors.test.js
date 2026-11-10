'use strict';

const test = require('node:test');
const assert = require('node:assert');
const s = require('./sectors');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-10T12:00:00Z');
const ago = (d) => new Date(now - d * DAY);

test('industryStatus: soon / new within 7 days / ok', () => {
  assert.strictEqual(s.industryStatus({ dataStatus: 'soon', dataUpdatedAt: ago(1) }, now), 'soon');
  assert.strictEqual(s.industryStatus({ dataStatus: 'ready', dataUpdatedAt: ago(7) }, now), 'new');
  assert.strictEqual(s.industryStatus({ dataStatus: 'ready', dataUpdatedAt: ago(8) }, now), 'ok');
  assert.strictEqual(s.industryStatus({ dataStatus: 'ready', dataUpdatedAt: null }, now), 'ok');
});

test('sectorStatus', () => {
  assert.strictEqual(s.sectorStatus([]), 'soon');
  assert.strictEqual(s.sectorStatus(['soon', 'soon']), 'soon');
  assert.strictEqual(s.sectorStatus(['soon', 'ok']), 'ok');
  assert.strictEqual(s.sectorStatus(['ok', 'new', 'soon']), 'new');
});

const sector = {
  slug: 'energi', name: 'Energi', icon: 'bolt',
  subsectors: [
    { name: 'A', industries: [
      { slug: 'bb', name: 'Batu Bara', dataStatus: 'ready', dataUpdatedAt: ago(1), updateNote: 'diperbarui Q3' },
      { slug: 'mg', name: 'Minyak & Gas', dataStatus: 'soon', dataUpdatedAt: ago(1), updateNote: 'ignored' },
    ] },
    { name: 'B', industries: [{ slug: 'jp', name: 'Jasa', dataStatus: 'ready', dataUpdatedAt: ago(30) }] },
  ],
};

test('sectorView counts, status, updatedAt ignores "soon" industries', () => {
  const v = s.sectorView(sector, now);
  assert.strictEqual(v.status, 'new');
  assert.strictEqual(v.subsectorCount, 2);
  assert.strictEqual(v.industryCount, 3);
  assert.deepStrictEqual(v.updatedAt, ago(1));
  assert.deepStrictEqual(v.subsectors[0].industries.map((i) => i.status), ['new', 'soon']);
  assert.strictEqual(v.subsectors[0].industries[1].updatedAt, null);
});

test('sectorNotice picks newest "Baru" industry with a note', () => {
  assert.deepStrictEqual(s.sectorNotice(sector, now), { industrySlug: 'bb', industryName: 'Batu Bara', note: 'diperbarui Q3', updatedAt: ago(1) });
  assert.strictEqual(s.sectorNotice(sector, now + 30 * DAY), null);
});
