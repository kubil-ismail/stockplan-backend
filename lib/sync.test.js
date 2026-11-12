'use strict';

const test = require('node:test');
const assert = require('node:assert');
const s = require('./sync');

const NOW = new Date('2026-11-06T05:00:00Z'); // 12.00 WIB

test('durationLabel + runSummary match the design copy', () => {
  assert.strictEqual(s.durationLabel(38000), '38 dtk');
  assert.strictEqual(s.durationLabel(72000), '1 mnt 12 dtk');
  assert.strictEqual(s.durationLabel(120000), '2 mnt');
  const job = { lastStartedAt: '2026-11-06T00:00:00Z', lastFinishedAt: '2026-11-06T00:01:12Z', lastOk: 958, lastTotal: 958 };
  assert.strictEqual(s.runSummary(job), '958 emiten · 1 mnt 12 dtk');
  assert.strictEqual(s.runSummary({ ...job, lastOk: 955, lastFinishedAt: '2026-11-06T00:00:41Z' }), '955 dari 958 · 41 dtk');
  assert.strictEqual(s.runSummary({ ...job, lastDetail: '14 dokumen baru' }), '14 dokumen baru');
  assert.strictEqual(s.runSummary({}), '');
});

test('jobView: status precedence and conflict note', () => {
  const base = { key: 'mgmt', name: 'Manajemen', lastFinishedAt: NOW, note: 'x' };
  assert.strictEqual(s.jobView({ ...base, runningSince: new Date(NOW - 60000), requestedAt: NOW }, { now: NOW }).status, 'running');
  assert.strictEqual(s.jobView({ ...base, runningSince: new Date(NOW - s.RUN_TIMEOUT_MS - 1), requestedAt: NOW }, { now: NOW }).status, 'queued'); // dead run
  assert.strictEqual(s.jobView(base, { openFails: 3, now: NOW }).status, 'failed');
  assert.strictEqual(s.jobView(base, { now: NOW }).status, 'ok');
  assert.strictEqual(s.jobView({ key: 'px' }, { now: NOW }).status, 'never');
  assert.strictEqual(s.jobView(base, { openConflicts: 2, now: NOW }).note, '2 perubahan perlu ditinjau');
  assert.strictEqual(s.jobView(base, { now: NOW }).note, 'x');
});

test('mergeRequest: full run wins, retries accumulate', () => {
  assert.strictEqual(s.mergeRequest({}, null), null);
  assert.deepStrictEqual(s.mergeRequest({}, ['BUMI']), ['BUMI']);
  assert.deepStrictEqual(s.mergeRequest({ requestedAt: NOW, requestedTickers: ['DEWA'] }, ['BUMI', 'DEWA']), ['DEWA', 'BUMI']);
  assert.strictEqual(s.mergeRequest({ requestedAt: NOW, requestedTickers: null }, ['BUMI']), null);
  assert.deepStrictEqual(s.mergeRequest({ requestedAt: null, requestedTickers: ['OLD'] }, ['BUMI']), ['BUMI']); // stale list ignored
});

test('failureView.retrying follows the pending request scope', () => {
  const f = { id: '1', jobKey: 'mgmt', ticker: 'BUMI', message: 'm', log: 'l' };
  assert.strictEqual(s.failureView(f, { name: 'Manajemen' }, NOW).retrying, false);
  assert.strictEqual(s.failureView(f, { requestedAt: NOW, requestedTickers: ['DEWA'] }, NOW).retrying, false);
  assert.strictEqual(s.failureView(f, { requestedAt: NOW, requestedTickers: ['BUMI'] }, NOW).retrying, true);
  assert.strictEqual(s.failureView(f, { requestedAt: NOW, requestedTickers: null }, NOW).retrying, true);
});

test('historyDays: 14 Jakarta days ending today, zeros filled', () => {
  const h = s.historyDays([{ day: '2026-11-06', n: '3' }, { day: '2026-10-30', n: 2 }, { day: '2026-10-01', n: 9 }], NOW);
  assert.strictEqual(h.length, 14);
  assert.deepStrictEqual(h[0], { date: '2026-10-24', failed: 0 });
  assert.deepStrictEqual(h[13], { date: '2026-11-06', failed: 3 });
  assert.strictEqual(h[6].failed, 2);
  // 23.30 UTC on 5 Nov is already 6 Nov in Jakarta
  assert.strictEqual(s.historyDays([], new Date('2026-11-05T23:30:00Z'))[13].date, '2026-11-06');
});

test('withBei / conflictView: BEI keys over team section, diff rows', () => {
  const current = { group: { name: 'Grup Bakrie', subsidiaries: [{ name: 'A', business: '', ownershipPct: 50, ticker: '', show: true }] } };
  const value = { subsidiaries: [{ name: 'A', business: '', ownershipPct: 65, ticker: '', show: true }] };
  assert.deepStrictEqual(s.withBei(current, 'group', value), { name: 'Grup Bakrie', subsidiaries: value.subsidiaries });
  const v = s.conflictView({ id: 'c1', ticker: 'ADMR', section: 'group', field: 'Anak usaha', value }, current);
  assert.deepStrictEqual(v.changes.map((r) => [r.field, r.before, r.after]), [['group.subsidiaries[0].ownershipPct', 50, 65]]);
});

test('alreadyKept: only a team decision on the same value suppresses', () => {
  const value = { people: [{ name: 'A', role: 'Dirut' }] };
  assert.strictEqual(s.alreadyKept({ resolution: 'team', value }, { people: [{ name: 'A', role: 'Dirut' }] }), true);
  assert.strictEqual(s.alreadyKept({ resolution: 'team', value }, { people: [{ name: 'B', role: 'Dirut' }] }), false);
  assert.strictEqual(s.alreadyKept({ resolution: 'bei', value }, value), false);
  assert.strictEqual(s.alreadyKept(null, value), false);
});

test('validateReport: happy path normalizes and keeps only sent keys', () => {
  const { report, errors } = s.validateReport({
    startedAt: '2026-11-06T06:00:00+07:00', finishedAt: '2026-11-06T06:04:31+07:00', ok: 955, total: 958, tickers: null,
    failures: [{ ticker: 'bumi', message: 'Halaman profil BEI tidak bisa dibaca', log: 'GET … → 503 (3x)' }, { message: 'BEI down' }],
    conflicts: [{ ticker: 'ADMR', section: 'group', field: 'Anak usaha baru', reason: 'r', value: { subsidiaries: [{ name: 'PT KAI', ownershipPct: 65 }] } }],
  });
  assert.strictEqual(errors, null);
  assert.deepStrictEqual(report.failures.map((f) => f.ticker), ['BUMI', null]);
  assert.deepStrictEqual(Object.keys(report.conflicts[0].value), ['subsidiaries']); // no blank group name
  assert.strictEqual(report.conflicts[0].value.subsidiaries[0].ownershipPct, 65);
  assert.strictEqual(report.tickers, null);
});

test('validateReport: rejects bad input with field paths', () => {
  const { errors } = s.validateReport({
    startedAt: 'nope', ok: 5, total: 3, tickers: ['BUMI', '!!'],
    failures: [{ ticker: 'BUMI' }],
    conflicts: [{ ticker: 'BUMI', section: 'summary', field: 'x', value: {} }, { ticker: 'BUMI', section: 'management', field: 'Dirut', value: { people: [{ name: 'A', role: 5 }] } }],
  });
  assert.ok(errors.startedAt && errors.finishedAt && errors.ok && errors.tickers);
  assert.ok(errors['failures[0].message']);
  assert.ok(errors['conflicts[0].section']);
  assert.ok(errors['conflicts[1].value.people[0].role']);
  assert.ok(s.validateReport({ startedAt: '2026-11-06T06:00:00Z', finishedAt: '2026-11-06T05:00:00Z' }).errors.finishedAt);
  assert.strictEqual(s.validateReport(null).errors.startedAt, 'Wajib diisi.');
});

test('fromCrawler: maps AADI-shaped data, drops public float, keeps team subsidiary flags', () => {
  const d = {
    ticker: 'AADI', board: { name: 'Utama' }, ipo_date: '2024-12-05',
    commissioners: [{ name: 'Budi Bowoleksono', position: { id: 'Komisaris Utama' } }],
    directors: [{ name: 'Julius Aslan', position: { id: 'Direktur Utama' } }],
    shareholders: [
      { name: 'Masyarakat Non Warkat', type: { id: 'Masyarakat Non Warkat' }, percentage: 37.6648 },
      { name: 'PT Adaro Strategic Investments', type: { id: 'Lebih dari 5%' }, percentage: 41.0965 },
      { name: 'PT Alamtri', type: { id: 'Lebih dari 5%' }, percentage: 15.3723 },
      { name: 'Direktur X', type: { id: 'Direksi' }, percentage: 0 },
    ],
    subsidiaries: [
      ...Array.from({ length: 40 }, (_, i) => ({ name: `Kecil ${i}`, type: { id: ['Jasa'] }, total_assets: i, ownership_percentage: 100 })),
      { name: 'PT Adaro Indonesia', type: { id: ['Pertambangan'] }, total_assets: 1815781, ownership_percentage: 88 },
    ],
  };
  const current = { group: { name: 'Adaro', subsidiaries: [{ name: 'pt adaro indonesia', ticker: 'XADR', show: false }] } };
  const { sections, columns, errors } = s.fromCrawler(d, current);
  assert.strictEqual(errors, null);
  assert.deepStrictEqual(sections.management.people, [{ name: 'Budi Bowoleksono', role: 'Komisaris Utama' }, { name: 'Julius Aslan', role: 'Direktur Utama' }]);
  assert.deepStrictEqual(sections.shareholders.items.map((x) => [x.name, x.pct]), [['PT Adaro Strategic Investments', 41.0965], ['PT Alamtri', 15.3723]]);
  assert.strictEqual(sections.group.subsidiaries.length, 30);
  assert.deepStrictEqual(sections.group.subsidiaries[0], { name: 'PT Adaro Indonesia', business: 'Pertambangan', ownershipPct: 88, ticker: 'XADR', show: false });
  assert.ok(!('name' in sections.group)); // group.name is the team's, not BEI's
  assert.deepStrictEqual(columns, { listingBoard: 'Utama', listedYear: 2024 });
});

test('fromCrawler: empty lists mean "no data", not "wipe"', () => {
  const { sections, columns } = s.fromCrawler({ ticker: 'X', directors: [], commissioners: [], shareholders: [], subsidiaries: [] });
  assert.deepStrictEqual(sections, {});
  assert.deepStrictEqual(columns, {});
});

test('pendingSections: unchanged dropped, everything else waits, reason by ownership', () => {
  const current = { management: { people: [{ name: 'A', role: 'Dirut' }] }, shareholders: { items: [], note: 'n' }, group: { name: 'G', subsidiaries: [] }, listing: { listingBoard: null, listedYear: null } };
  const sections = {
    management: { people: [{ name: 'A', role: 'Dirut' }] },
    shareholders: { items: [{ name: 'B', pct: 50 }] },
    group: { subsidiaries: [{ name: 'S', business: '', ownershipPct: 1, ticker: '', show: true }] },
    listing: { listingBoard: 'Utama', listedYear: 2024 },
  };
  assert.deepStrictEqual(s.pendingSections(current, ['group'], sections), [
    { section: 'shareholders', reason: s.NEW_REASON }, { section: 'group', reason: s.TEAM_REASON }, { section: 'listing', reason: s.NEW_REASON },
  ]);
  assert.deepStrictEqual(s.withBei(current, 'shareholders', sections.shareholders), { items: [{ name: 'B', pct: 50 }], note: 'n' }); // team note kept
});

test('withSections / withoutSection', () => {
  assert.deepStrictEqual(s.withSections(null, ['a']), ['a']);
  assert.deepStrictEqual(s.withSections(['a'], ['a', 'b']), ['a', 'b']);
  assert.deepStrictEqual(s.withoutSection(['a', 'b'], 'a'), ['b']);
});
