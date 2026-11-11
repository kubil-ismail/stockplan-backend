'use strict';

const test = require('node:test');
const assert = require('node:assert');
const h = require('./adminHistory');

test('classify: known actions, unknown falls back to Keamanan', () => {
  assert.deepStrictEqual(h.classify('company_published'), { module: 'em', kind: 'pub' });
  assert.deepStrictEqual(h.classify('member_role_changed'), { module: 'acc', kind: 'sec' });
  assert.deepStrictEqual(h.classify('something_new'), { module: 'security', kind: 'sec' });
  assert.ok(h.HIDDEN_ACTIONS.includes('logout') && h.HIDDEN_ACTIONS.includes('login_password_ok'));
  assert.ok(h.SYSTEM_ACTIONS.includes('account_locked'));
});

test('diffSections: leaf rows, arrays of primitives joined, missing = dash', () => {
  const before = { keyNumbers: { pbv: 1.5, tips: { pbv: 'a' } }, points: { strengths: ['A', 'B'] }, name: 'X' };
  const after = { keyNumbers: { pbv: 1.6, tips: { pbv: 'a' } }, points: { strengths: ['A', 'B', 'C'] }, name: 'X' };
  const rows = h.diffSections(before, after, ['keyNumbers', 'points', 'name']);
  assert.deepStrictEqual(rows.map((r) => [r.field, r.before, r.after]), [['keyNumbers.pbv', 1.5, 1.6], ['points.strengths', 'A, B', 'A, B, C']]);
  assert.strictEqual(rows[0].label, 'Angka utama › pbv');
  const added = h.diffSections({}, { risks: [{ title: 'T', level: 'high' }] }, ['risks']);
  assert.deepStrictEqual(added.map((r) => [r.field, r.before, r.after]), [['risks[0].title', '—', 'T'], ['risks[0].level', '—', 'high']]);
});

test('diffSections truncates long text and caps rows', () => {
  const [r] = h.diffSections({ summary: { overview: '' } }, { summary: { overview: 'x'.repeat(500) } }, ['summary']);
  assert.strictEqual(r.after.length, 301);
  const big = { news: Array.from({ length: 10 }, (_, i) => ({ title: `t${i}`, source: 's', dateLabel: 'd' })) };
  assert.strictEqual(h.diffSections({}, big, ['news']).length, 30);
});

test('sectionChange only reports sections that really changed and keeps both halves for revert', () => {
  const before = { name: 'A', drivers: ['x'], stages: [] };
  const c = h.sectionChange(before, { name: 'A', drivers: ['x', 'y'] });
  assert.deepStrictEqual(c.keys, ['drivers']);
  assert.deepStrictEqual(c.beforePart, { drivers: ['x'] });
  assert.deepStrictEqual(c.afterPart, { drivers: ['x', 'y'] });
  assert.deepStrictEqual(h.sectionChange(before, { name: 'A' }).keys, []);
  assert.strictEqual(h.sectionVerb(['trend']), 'memperbarui tren keuangan');
  assert.strictEqual(h.sectionVerb(['trend', 'risks']), 'memperbarui tren keuangan, risiko utama');
  assert.strictEqual(h.sectionVerb(['a', 'b', 'c']), 'memperbarui 3 bagian');
  assert.strictEqual(h.sectionVerb([]), 'menyimpan draf tanpa perubahan');
});

test('maskIp', () => {
  assert.strictEqual(h.maskIp('182.253.12.34'), '182.253.x.x');
  assert.strictEqual(h.maskIp('::ffff:10.1.2.3'), '10.1.x.x');
  assert.strictEqual(h.maskIp('::1'), 'lokal');
  assert.strictEqual(h.maskIp('2001:db8:1:2::1'), '2001:db8:x');
  assert.strictEqual(h.maskIp(null), null);
});

const row = (o) => ({ id: 'i', createdAt: '2026-11-06T03:42:00Z', adminId: 'a1', email: 'rina@stockplan.id', action: 'company_draft_saved', target: 'BUMI', module: 'em', kind: 'data', ip: '182.253.9.9', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537', ...o });

test('theme_deleted is a tm/data event', () => {
  assert.deepStrictEqual([h.classify('theme_deleted').module, h.classify('theme_deleted').kind], ['tm', 'data']);
});

test('entryView: sentence from summary, legacy fallback, system actor, masked IP only on login events', () => {
  const v = h.entryView(row({ summary: { verb: 'memperbarui tren keuangan', target: 'BUMI', rest: '(draf)' } }), { actorName: 'Rina Putri' });
  assert.deepStrictEqual([v.actor.name, v.verb, v.target, v.rest, v.meta, v.module.name], ['Rina Putri', 'memperbarui tren keuangan', 'BUMI', '(draf)', 'Chrome · Windows', 'Data emiten']);
  const legacy = h.entryView(row({ action: 'theme_published', target: 'theme:batubara', module: 'tm', kind: 'pub' }));
  assert.deepStrictEqual([legacy.verb, legacy.target, legacy.actor.name], ['menerbitkan tema', 'batubara', 'rina@stockplan.id']);
  const fail = h.entryView(row({ action: 'login_failed', adminId: null, email: 'dimas@stockplan.id', target: null, module: 'security', kind: 'sec' }));
  assert.deepStrictEqual([fail.actor.kind, fail.actor.name, fail.target, fail.meta], ['system', 'Sistem', 'dimas@stockplan.id', 'IP 182.253.x.x · Chrome · Windows']);
  assert.strictEqual(h.entryView(row({ action: 'login_ok', target: null, module: 'security', kind: 'sec' })).target, '');
});

test('entryView: revertable/reverted/canRevert', () => {
  const rv = { type: 'member_role', ref: 'x', before: 'a', after: 'b' };
  assert.deepStrictEqual(
    (({ revertable, reverted, canRevert }) => [revertable, reverted, canRevert])(h.entryView(row({ revert: rv }), { canRevertFn: (t) => t === 'member_role' })),
    [true, false, true],
  );
  const done = h.entryView(row({ revert: rv, revertedAt: '2026-11-06T04:00:00Z' }), { canRevertFn: () => true });
  assert.deepStrictEqual([done.revertable, done.reverted, done.canRevert], [false, true, false]);
  assert.strictEqual(h.entryView(row()).revertable, false);
  assert.strictEqual('revert' in h.entryView(row({ revert: rv })), false); // payload never leaves the server
});

test('groupByDay uses the Jakarta calendar day; toCsv guards formulas', () => {
  const e = (at) => h.entryView(row({ createdAt: at, summary: { verb: '=SUM(1)', target: 'X', rest: '' }, changes: [{ label: 'L', before: 'a', after: 'b' }] }));
  const days = h.groupByDay([e('2026-11-06T18:00:00Z'), e('2026-11-06T16:59:00Z'), e('2026-11-05T01:00:00Z')]);
  assert.deepStrictEqual(days.map((d) => [d.date, d.items.length]), [['2026-11-07', 1], ['2026-11-06', 1], ['2026-11-05', 1]]);
  const csv = h.toCsv([e('2026-11-06T03:00:00Z')]);
  assert.match(csv, /,'=SUM\(1\) X,/);
  assert.match(csv, /L: a → b/);
});

test('rangeDays clamps to 1..730 and defaults to 7', () => {
  assert.deepStrictEqual([h.rangeDays(undefined), h.rangeDays('30'), h.rangeDays('0'), h.rangeDays('99999')], [7, 30, 7, 730]);
});

test('REVERT_PERMS cover every revert type the controllers write', () => {
  assert.deepStrictEqual(Object.keys(h.REVERT_PERMS).sort(), ['company_sections', 'member_role', 'member_status', 'role_perms', 'theme_sections', 'user_suspension']);
  assert.deepStrictEqual(h.REVERT_PERMS.user_suspension, ['usr', 'delete']);
});
