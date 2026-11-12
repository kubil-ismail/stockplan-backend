'use strict';

// Pure logic for the admin Dashboard (AdminDashboard): KPI percent, work queue, theme coverage, recent activity.
const { jakartaDate } = require('./companies');

const LEVELS = { high: 'Tinggi', medium: 'Sedang', low: 'Rendah' };
const LEVEL_ORDER = { high: 0, medium: 1, low: 2 };
const STATUS_ORDER = { open: 0, review: 1, draft: 2 };
const COVERAGE_MAX = 6;
const ACTIVITY_MAX = 5;

const percent = (n, of) => (of ? Math.round((n / of) * 100) : 0);

// [from, to) of the current month in Asia/Jakarta, as YYYY-MM-DD (company.ipo.listingDate is a date string).
function monthRange(now = new Date()) {
  const [y, m] = jakartaDate(now).split('-').map(Number);
  const iso = (yy, mm) => new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
  return { from: iso(y, m), to: iso(y, m + 1) };
}

// "CDIA dan 1 emiten lain bulan ini" (design). tickers = the first few, count = all of them.
function ipoSub(tickers, count) {
  const rest = count - tickers.length;
  const names = tickers.length ? tickers.join(', ') : '';
  return rest > 0 ? `${names} dan ${rest} emiten lain` : names;
}

// c: counts per item. allowed: which modules the viewer may see; an item needs the module its data comes from.
// Only items backed by real data: "Data salah" user reports and unprocessed financial reports have no source yet.
function queue(c, allowed) {
  const item = (key, module, level, title, sub, count, href) => ({ key, module, level, levelLabel: LEVELS[level], title, sub, count, href });
  const all = [
    item('bei_changes', 'sync', 'medium', 'Perubahan data BEI menunggu keputusan', 'Belum tampil di aplikasi sampai Anda setujui', c.beiChanges, '/admin/sinkron'), // COPY: perlu review
    item('company_review', 'em', 'medium', 'Profil emiten perlu ditinjau', 'Sudah disimpan, belum diterbitkan', c.companyReview, '/admin/emiten?tab=review'), // COPY: perlu review
    item('theme_review', 'tm', 'medium', 'Tema menunggu diterbitkan', 'Diajukan oleh editor tema', c.themeReview, '/admin/tema?tab=review'), // COPY: perlu review
    item('no_source', 'em', 'medium', 'Sumber pendapatan tanpa dokumen sumber', 'Pengguna tidak bisa menelusuri asal angkanya', c.noSource, '/admin/emiten?tab=incomplete'),
    item('ipo_new', 'em', 'low', 'IPO baru belum diprofilkan', ipoSub(c.ipoTickers || [], c.ipoNew), c.ipoNew, '/admin/emiten'),
    item('no_summary', 'em', 'low', 'Belum ada ringkasan bisnis', 'Emiten masih tampil dengan deskripsi resmi BEI saja', c.noSummary, '/admin/emiten?tab=incomplete'),
  ];
  return all
    .filter((i) => allowed[i.module] && i.count > 0)
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.count - a.count)
    .map(({ module, ...rest }) => rest);
}

// rows: th.listRow output. Only value chains with companies; open themes first, then the biggest.
function coverage(rows, readyMin) {
  return rows
    .filter((r) => r.kind === 'chain' && r.readiness && r.readiness.total > 0)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.readiness.total - a.readiness.total || a.name.localeCompare(b.name))
    .slice(0, COVERAGE_MAX)
    .map((r) => ({
      slug: r.slug, name: r.name, stageCount: r.stageCount, status: r.status, statusLabel: r.statusLabel,
      ready: r.readiness.ready, total: r.readiness.total, percent: r.readiness.percent, openable: r.readiness.percent >= readyMin,
    }));
}

// entry: hist.entryView output. Same sentence as Riwayat: "Rina" + "memperbarui tren keuangan" + "BUMI".
const activity = (entry) => ({ id: entry.id, at: entry.at, actor: entry.actor.name, verb: entry.verb, target: entry.target, rest: entry.rest });

module.exports = { LEVELS, COVERAGE_MAX, ACTIVITY_MAX, percent, monthRange, ipoSub, queue, coverage, activity };
