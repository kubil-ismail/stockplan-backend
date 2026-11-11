'use strict';

// Admin modules and the role permission matrix (HANDOFF design §8.2, fixtures/admin-modules.json).
// Roles live in admin_roles; `super` always has every permission and cannot be edited.

const ACTIONS = ['view', 'edit', 'publish', 'delete']; // Lihat · Ubah · Terbitkan · Hapus/tangguhkan
// sensitive = "Sensitif" badge (fixture: superOnly)
const MODULES = [
  { key: 'dash', name: 'Dashboard', desc: 'Ringkasan dan antrian kerja', actions: ['view'], sensitive: false },
  { key: 'em', name: 'Data emiten', desc: 'Profil, sumber pendapatan, laporan keuangan, IPO', actions: ['view', 'edit', 'publish', 'delete'], sensitive: false },
  { key: 'tm', name: 'Tema & rantai nilai', desc: 'Tahap, emiten per tahap, porsi pendapatan', actions: ['view', 'edit', 'publish', 'delete'], sensitive: false },
  { key: 'usr', name: 'Pengguna', desc: 'Akun beta, undangan, tangguhkan akun', actions: ['view', 'edit', 'delete'], sensitive: true },
  { key: 'fb', name: 'Masukan & laporan', desc: 'Tiket dari form Bantuan', actions: ['view', 'edit', 'delete'], sensitive: false },
  { key: 'log', name: 'Riwayat perubahan', desc: 'Lihat dan kembalikan perubahan', actions: ['view', 'edit'], sensitive: false },
  { key: 'sync', name: 'Sinkron data BEI', desc: 'Jalankan sinkron, tinjau perubahan BEI', actions: ['view', 'edit'], sensitive: false },
  { key: 'set', name: 'Pengaturan aplikasi', desc: 'Merek, landing page, mode aplikasi', actions: ['view', 'edit', 'publish'], sensitive: true },
  { key: 'acc', name: 'Akses & peran', desc: 'Undang anggota, ubah peran dan izin', actions: ['view', 'edit', 'delete'], sensitive: true },
];
const SUPER = 'super';

const allPerms = () => Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]]));

// perms: { module: [actions] } of the signed-in admin's role. Unknown module/action → false.
const can = (perms, module, action) => !!(perms && (perms[module] || []).includes(action));

// Effective perms for a role row: super is always everything, whatever is stored.
const permsOf = (role) => (!role ? {} : role.id === SUPER ? allPerms() : role.perms || {});

const MSG = {
  nameRequired: 'Beri nama peran dulu',
  nameTaken: 'Nama peran sudah dipakai.', // COPY: perlu review
  superLocked: 'Izin super admin tidak bisa diubah',
  ownRole: 'Tidak bisa mengubah izin peran Anda sendiri.', // COPY: perlu review
  badPerms: 'Izin tidak valid.', // COPY: perlu review
  tooLong: 'Isian terlalu panjang.', // COPY: perlu review
};

// Keeps only actions the module offers; any action implies "Lihat" (design: centang izin apa pun = Lihat ikut).
// Returns { perms, error }.
function normalizePerms(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { perms: null, error: MSG.badPerms };
  const known = new Set(MODULES.map((m) => m.key));
  if (Object.keys(input).some((k) => !known.has(k))) return { perms: null, error: MSG.badPerms };
  const perms = {};
  for (const m of MODULES) {
    const want = input[m.key] === undefined ? [] : input[m.key];
    if (!Array.isArray(want) || want.some((a) => !m.actions.includes(a))) return { perms: null, error: MSG.badPerms };
    const set = new Set(want);
    if (set.size && !set.has('view')) set.add('view');
    perms[m.key] = m.actions.filter((a) => set.has(a)); // canonical order
  }
  return { perms, error: null };
}

// POST (creating=true) needs name + perms; PUT accepts any subset of name/summary/description/perms.
function validateRole(body = {}, { creating = false } = {}) {
  const errors = {};
  const values = {};
  const text = (k, max) => {
    if (body[k] === undefined) return;
    if (typeof body[k] !== 'string') { errors[k] = MSG.tooLong; return; }
    const v = body[k].trim();
    if (v.length > max) errors[k] = MSG.tooLong;
    else values[k] = v;
  };
  text('name', 60);
  text('summary', 120);
  text('description', 300);
  if ((creating || values.name !== undefined) && !errors.name && !values.name) errors.name = MSG.nameRequired;
  if (body.perms !== undefined || creating) {
    const { perms, error } = normalizePerms(body.perms === undefined ? {} : body.perms);
    if (error) errors.perms = error;
    else values.perms = perms;
  }
  return { values, errors: Object.keys(errors).length ? errors : null };
}

// "Admin data" -> "admin-data"
const roleId = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34) || 'peran';

// Modules with at least one non-view permission among the sensitive ones ("Peran ini punya izin sensitif: …").
const sensitiveGrants = (perms) => MODULES.filter((m) => m.sensitive && (perms[m.key] || []).some((a) => a !== 'view')).map((m) => m.name);

module.exports = { ACTIONS, MODULES, SUPER, MSG, allPerms, can, permsOf, normalizePerms, validateRole, roleId, sensitiveGrants };
