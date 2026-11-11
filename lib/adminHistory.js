'use strict';

// Pure logic for "Riwayat perubahan" (AdminRiwayat): action catalogue, before/after diffs, entry view, CSV.
const { isDeepStrictEqual } = require('util');
const { cell } = require('./adminCompanies');
const { deviceLabel } = require('./adminUsers');
const { jakartaDate } = require('./companies');

// Filter options (design: "Semua modul"). `fb` and `sync` have no writers yet; they show up once those modules log.
const MODULES = [
  { key: 'em', name: 'Data emiten' }, { key: 'tm', name: 'Tema & rantai nilai' }, { key: 'usr', name: 'Pengguna' },
  { key: 'fb', name: 'Masukan & laporan' }, { key: 'sync', name: 'Sinkron BEI' }, { key: 'set', name: 'Pengaturan aplikasi' },
  { key: 'acc', name: 'Akses & peran' }, { key: 'security', name: 'Keamanan' },
];
const moduleName = (k) => (MODULES.find((m) => m.key === k) || {}).name || k;

const KINDS = ['data', 'pub', 'sec']; // tabs: Perubahan data · Terbit · Akses & keamanan
const SYSTEM = 'system';

// action -> module, kind, default sentence. `system`: performed by "Sistem", not the admin whose email is stored.
// `hidden`: bookkeeping rows that don't belong in the feed. Keep module/kind in sync with the migration backfill.
const ACTIONS = {
  company_draft_saved: { module: 'em', kind: 'data', verb: 'memperbarui draf' },
  company_created: { module: 'em', kind: 'data', verb: 'menambahkan emiten IPO' },
  company_bulk_review: { module: 'em', kind: 'data', verb: 'menandai perlu ditinjau' },
  company_published: { module: 'em', kind: 'pub', verb: 'menerbitkan profil' },
  theme_created: { module: 'tm', kind: 'data', verb: 'membuat tema' },
  theme_draft_saved: { module: 'tm', kind: 'data', verb: 'memperbarui tema' },
  theme_company_mapped: { module: 'tm', kind: 'data', verb: 'memetakan emiten ke tema' },
  theme_published: { module: 'tm', kind: 'pub', verb: 'menerbitkan tema' },
  user_suspended: { module: 'usr', kind: 'sec', verb: 'menangguhkan akun' },
  user_restored: { module: 'usr', kind: 'sec', verb: 'memulihkan akun' },
  user_confirmation_resent: { module: 'usr', kind: 'sec', verb: 'mengirim ulang email konfirmasi ke' },
  user_password_reset_sent: { module: 'usr', kind: 'sec', verb: 'mengirim tautan atur ulang password ke' },
  user_invited: { module: 'usr', kind: 'sec', verb: 'mengundang pengguna beta' },
  member_invited: { module: 'acc', kind: 'sec', verb: 'mengundang anggota' },
  member_role_changed: { module: 'acc', kind: 'sec', verb: 'mengubah peran' },
  member_deactivated: { module: 'acc', kind: 'sec', verb: 'menonaktifkan anggota' },
  member_reactivated: { module: 'acc', kind: 'sec', verb: 'mengaktifkan kembali anggota' },
  member_invite_resent: { module: 'acc', kind: 'sec', verb: 'mengirim ulang undangan ke' },
  role_created: { module: 'acc', kind: 'sec', verb: 'membuat peran' },
  role_updated: { module: 'acc', kind: 'sec', verb: 'mengubah izin peran' },
  invite_accepted: { module: 'acc', kind: 'sec', verb: 'menerima undangan', emailTarget: false },
  login_ok: { module: 'security', kind: 'sec', verb: 'masuk ke panel admin', ip: true },
  login_failed: { module: 'security', kind: 'sec', verb: 'mencatat gagal masuk untuk', system: true, emailTarget: true, ip: true },
  twofa_failed: { module: 'security', kind: 'sec', verb: 'mencatat kode verifikasi salah untuk', system: true, emailTarget: true, ip: true },
  account_locked: { module: 'security', kind: 'sec', verb: 'mengunci akun', system: true, emailTarget: true, rest: '· 5 kali gagal masuk, dikunci 15 menit', ip: true },
  revert: { module: null, kind: 'data', verb: 'mengembalikan' }, // module/kind come from the reverted entry
  login_password_ok: { hidden: true, module: 'security', kind: 'sec' }, // step 1 of 2: the login_ok row follows
  logout: { hidden: true, module: 'security', kind: 'sec' },
};
const HIDDEN_ACTIONS = Object.keys(ACTIONS).filter((a) => ACTIONS[a].hidden);
const SYSTEM_ACTIONS = Object.keys(ACTIONS).filter((a) => ACTIONS[a].system);

// module + kind for a new row. Unknown actions are kept but land in "Keamanan" so they stay visible.
const classify = (action) => {
  const a = ACTIONS[action];
  return a ? { module: a.module, kind: a.kind } : { module: 'security', kind: 'sec' };
};

// ---- before/after ----
// Form section keys (companies + themes) -> label shown in the diff and in "memperbarui tren keuangan".
const SECTION_LABELS = {
  name: 'Nama', sectorSlug: 'Sektor', subsector: 'Sub-sektor', trading: 'Status perdagangan', keyNumbers: 'Angka utama', summary: 'Ringkasan bisnis',
  points: 'Poin kekuatan dkk.', trend: 'Tren keuangan', revenueSources: 'Sumber pendapatan', group: 'Struktur grup', shareholders: 'Pemegang saham',
  management: 'Manajemen', risks: 'Risiko utama', news: 'Berita', ipo: 'Detail IPO',
  perms: 'Izin peran', description: 'Deskripsi', drivers: 'Penggerak utama', groups: 'Tahap utama', stages: 'Tahap rantai nilai',
};
const MAX_ROWS = 40;
const MAX_TEXT = 300;

function leaves(v, path, out) {
  if (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')) out[path] = v.join(', ');
  else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => leaves(x, path ? `${path}.${k}` : k, out));
  else out[path] = v;
}
const show = (v) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'string' ? (v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v) : v);

// Leaf-level before/after rows for the given section keys. Missing on one side = "—".
function diffSections(before, after, keys) {
  const rows = [];
  for (const k of keys) {
    const a = {}; const b = {};
    leaves(before ? before[k] : undefined, k, a);
    leaves(after ? after[k] : undefined, k, b);
    for (const path of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (isDeepStrictEqual(a[path], b[path])) continue;
      const rest = path.slice(k.length).replace(/^\./, '');
      rows.push({ field: path, label: rest ? `${SECTION_LABELS[k] || k} › ${rest}` : SECTION_LABELS[k] || k, before: show(a[path]), after: show(b[path]) });
    }
  }
  return rows.slice(0, MAX_ROWS);
}

// patch = the sections being saved. Returns what to log: changed keys, display rows, and the revert halves.
function sectionChange(before, patch) {
  const keys = Object.keys(patch).filter((k) => !isDeepStrictEqual(before[k], patch[k]));
  const pick = (src) => Object.fromEntries(keys.map((k) => [k, src[k] === undefined ? null : src[k]]));
  return { keys, changes: diffSections(before, patch, keys), beforePart: pick(before), afterPart: pick(patch) };
}

// "memperbarui tren keuangan" / "memperbarui tren keuangan, risiko utama" / "memperbarui 4 bagian"
function sectionVerb(keys) {
  if (!keys.length) return 'menyimpan draf tanpa perubahan';
  if (keys.length > 2) return `memperbarui ${keys.length} bagian`;
  return `memperbarui ${keys.map((k) => (SECTION_LABELS[k] || k).toLowerCase()).join(', ')}`;
}

// ---- entry view ----
// 182.253.12.34 -> 182.253.x.x ; IPv6 keeps two groups ; loopback -> "lokal".
function maskIp(ip) {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (v4 === '::1' || v4 === '127.0.0.1') return 'lokal';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return `${v4.split('.').slice(0, 2).join('.')}.x.x`;
  return `${ip.split(':').slice(0, 2).join(':')}:x`;
}

const stripPrefix = (t) => (t || '').replace(/^(theme|admin|role):/, '');

// row: log row (plain). actor: { id, name } | null. perms: viewer's perms (for canRevert).
// canRevertFn(type) -> bool tells whether the viewer may revert this kind of entry.
function entryView(row, { actorName = null, canRevertFn = () => false } = {}) {
  const def = ACTIONS[row.action] || {};
  const sys = !!def.system;
  const sum = row.summary || {};
  const target = sum.target !== undefined ? sum.target : def.emailTarget === false ? '' : def.emailTarget ? row.email : stripPrefix(row.target);
  const rest = sum.rest !== undefined ? sum.rest : def.rest || '';
  const device = deviceLabel(row.userAgent || '');
  const ip = def.ip ? maskIp(row.ip) : null;
  const revertable = !!row.revert && !row.revertedAt;
  return {
    id: row.id, at: row.createdAt,
    actor: sys ? { kind: SYSTEM, id: null, name: 'Sistem', email: null } : { kind: 'admin', id: row.adminId || null, name: actorName || row.email, email: row.email },
    kind: row.kind, module: { key: row.module, name: moduleName(row.module) },
    verb: sum.verb || def.verb || row.action, target: target || '', rest: rest || '',
    meta: [ip && `IP ${ip}`, device].filter(Boolean).join(' · '),
    changes: row.changes || [],
    revertable, reverted: !!row.revertedAt, revertedAt: row.revertedAt || null,
    canRevert: revertable && canRevertFn(row.revert.type),
  };
}

// Groups entries (newest first) by Asia/Jakarta calendar day, in order.
function groupByDay(entries) {
  const days = [];
  for (const e of entries) {
    const date = jakartaDate(new Date(e.at));
    const last = days[days.length - 1];
    if (last && last.date === date) last.items.push(e);
    else days.push({ date, items: [e] });
  }
  return days;
}

function toCsv(entries) {
  const head = ['Waktu', 'Pelaku', 'Modul', 'Jenis', 'Aksi', 'Perangkat', 'Perubahan', 'Dikembalikan'];
  const kind = { data: 'Perubahan data', pub: 'Terbit', sec: 'Akses & keamanan' };
  const lines = entries.map((e) => [
    new Date(e.at).toISOString(), e.actor.name, e.module.name, kind[e.kind] || e.kind,
    [e.verb, e.target, e.rest].filter(Boolean).join(' '), e.meta,
    e.changes.map((c) => `${c.label}: ${c.before} → ${c.after}`).join('; '),
    e.reverted ? 'ya' : '',
  ].map(cell).join(','));
  return `${[head.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}

// What the signed-in admin needs on top of log:edit to revert each kind of entry (so Riwayat can't be used to
// change data the role could not change directly).
const REVERT_PERMS = {
  company_sections: ['em', 'edit'], theme_sections: ['tm', 'edit'], member_role: ['acc', 'edit'],
  user_suspension: ['usr', 'delete'], member_status: ['acc', 'delete'], role_perms: ['acc', 'edit'],
};

const RANGE_MAX = 730; // retention: 2 years
const rangeDays = (v) => Math.min(RANGE_MAX, Math.max(1, parseInt(v, 10) || 7));

module.exports = {
  MODULES, KINDS, SYSTEM, REVERT_PERMS, ACTIONS, HIDDEN_ACTIONS, SYSTEM_ACTIONS, SECTION_LABELS, RANGE_MAX,
  classify, diffSections, sectionChange, sectionVerb, maskIp, entryView, groupByDay, toCsv, rangeDays,
};
