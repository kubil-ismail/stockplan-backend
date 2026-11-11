'use strict';

const { Op } = require('sequelize');
const { sequelize, ThemeStage, Sector, Subsector, Industry, Company, AdminAuditLog, AdminUser } = require('../models');
const { withSector } = require('../lib/themes');
const th = require('../lib/adminThemes');
const co = require('../lib/adminCompanies');
const { can } = require('../lib/adminRoles');
const { audit } = require('../lib/audit');
const hist = require('../lib/adminHistory');
const { fail } = require('../lib/http');

// A theme is an industry (theme_industries); its sector comes through the subsector (see withSector).
const withRefs = { include: [
  { model: Subsector, as: 'subsector', attributes: ['id', 'sectorId'], include: [{ model: Sector, as: 'sector', attributes: ['id', 'slug', 'name'] }] },
  { model: ThemeStage, as: 'stages' },
] };
const loadTheme = async (slug) => withSector(await Industry.findOne({ where: { slug: String(slug || '') }, ...withRefs }));
const lastPosition = async (subsectorId) => ((await Industry.max('position', { where: { subsectorId } })) ?? -1) + 1;
const formOf = th.formOf;
const target = (slug) => `theme:${slug}`;
const notFound = (res) => fail(res, 404, 'NOT_FOUND', th.MSG.notFound);
const invalid = (res, field, msg) => fail(res, 422, 'VALIDATION', msg, { [field]: msg });

// Sector + subsector choices for the form ("Sektor", "Peta sektor › Sub-sektor").
const sectorOptions = async () => (await Sector.findAll({
  attributes: ['slug', 'name'], include: [{ model: Subsector, as: 'subsectors', attributes: ['id', 'name'] }],
  order: [['position', 'ASC'], [{ model: Subsector, as: 'subsectors' }, 'position', 'ASC']],
})).map((s) => ({ slug: s.slug, name: s.name, subsectors: s.subsectors.map((x) => ({ id: x.id, name: x.name })) }));

// ticker -> true when "Siap terbit" in Data emiten (same rule as the companies list).
async function readyMapFor(tickers) {
  if (tickers && !tickers.length) return {};
  const rows = await Company.findAll({ where: tickers ? { ticker: tickers } : {}, attributes: ['ticker', 'publishStatus'], raw: true });
  return Object.fromEntries(rows.map((r) => [r.ticker, r.publishStatus === 'published']));
}

// Shared checks for create/PATCH: sector exists, every ticker exists, name not used by another theme.
async function checkRefs(res, form, selfId = null) {
  let sectorId = null;
  if (form.sectorSlug) {
    const s = await Sector.findOne({ where: { slug: form.sectorSlug }, attributes: ['id'] });
    if (!s) return invalid(res, 'sectorSlug', th.MSG.unknownSector) && null;
    sectorId = s.id;
  }
  const subId = form.sectorMap && form.sectorMap.subsectorId;
  if (subId && !(sectorId && (await Subsector.findOne({ where: { id: subId, sectorId }, attributes: ['id'] })))) {
    return invalid(res, 'sectorMap.subsectorId', th.MSG.unknownSubsector) && null;
  }
  const tickers = th.formTickers(form);
  if (tickers.length) {
    const found = new Set((await Company.findAll({ where: { ticker: tickers }, attributes: ['ticker'], raw: true })).map((r) => r.ticker));
    const missing = tickers.filter((t) => !found.has(t));
    if (missing.length) return invalid(res, 'stages', th.MSG.unknownTickers(missing)) && null;
  }
  const dup = await Industry.findOne({ where: { name: { [Op.iLike]: form.name.replace(/[\\%_]/g, '\\$&') }, ...(selfId && { id: { [Op.ne]: selfId } }) }, attributes: ['id'] });
  if (dup) return fail(res, 409, 'THEME_TAKEN', th.MSG.nameTaken, { name: th.MSG.nameTaken }) && null;
  return { sectorId };
}

// GET /admin/api/themes?q=&tab=all|open|map|draft|review&sector=&queue=3 — AdminTema
exports.index = async (req, res, next) => {
  const q = String(req.query.q || '').slice(0, 50);
  const sector = typeof req.query.sector === 'string' ? req.query.sector : '';
  const tab = ['all', 'open', 'map', 'draft', 'review'].includes(req.query.tab) ? req.query.tab : 'all';
  const queue = Math.min(20, Math.max(0, parseInt(req.query.queue, 10) || 3));
  try {
    const [themes, companies, sectors] = await Promise.all([
      Industry.findAll(withRefs).then((list) => list.map(withSector)),
      // shortcut: loads every company's light fields for readiness + the unmapped queue; fine for ~1k listings.
      Company.findAll({ attributes: ['ticker', 'name', 'logoUrl', 'status', 'marketCap', 'sectorId', 'industryId', 'publishStatus'], raw: true }),
      sectorOptions(),
    ]);
    const readyMap = Object.fromEntries(companies.map((c) => [c.ticker, c.publishStatus === 'published']));
    const forms = new Map(themes.map((t) => [t.id, formOf(t)]));
    const ORDER = { open: 0, map: 1, review: 2, draft: 3 };
    const all = themes.map((t) => th.listRow(t, forms.get(t.id), readyMap))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || new Date(b.updatedAt) - new Date(a.updatedAt));
    const { tabs, rows } = th.filterList(all, { q, sector, tab });

    // Mapped = in any stage of any theme, published or draft ("Petakan" takes a company out of the queue).
    const mapped = new Set([...forms.values()].flatMap(th.formTickers));
    const allRows = [...forms.values()].flatMap((f) => f.stages.flatMap((s) => s.rows));
    const openRows = themes.filter((t) => t.publishedAt).flatMap((t) => th.columnsToForm(t, t.stages).stages.flatMap((s) => s.rows));
    // Only themes with stages: "Petakan" needs a stage to put the company in.
    const mappable = themes.filter((t) => forms.get(t.id).stages.length);
    const themeByIndustry = new Map(mappable.map((t) => [t.id, t])); // company.industryId -> that industry's chain
    const suggest = (c) => {
      const viaInd = themeByIndustry.get(c.industryId);
      if (viaInd) return { slug: viaInd.slug, name: viaInd.name, via: 'industri' };
      const viaSec = mappable.filter((t) => t.sectorId && t.sectorId === c.sectorId).sort((a, b) => a.name.localeCompare(b.name))[0];
      return viaSec ? { slug: viaSec.slug, name: viaSec.name, via: 'sektor' } : null;
    };

    res.json({
      summary: {
        open: all.filter((r) => r.status === 'open').length,
        draft: all.filter((r) => r.status === 'draft').length,
        mappedCompanies: { count: mapped.size, of: companies.length },
        missingShares: { count: allRows.filter((r) => r.pct === null).length, inOpenThemes: openRows.filter((r) => r.pct === null).length },
      },
      tabs, total: rows.length, items: rows,
      sectors,
      unmapped: th.unmappedQueue(companies, mapped, suggest, queue),
    });
  } catch (err) {
    next(err);
  }
};

async function editView(theme) {
  const form = formOf(theme);
  const tickers = th.formTickers(form);
  const [rows, logs, sectors] = await Promise.all([
    tickers.length ? Company.findAll({ where: { ticker: tickers }, include: [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: Industry, as: 'industry', attributes: ['name'] }] }) : [],
    AdminAuditLog.findAll({ where: { target: target(theme.slug) }, order: [['createdAt', 'DESC']], limit: 5 }),
    sectorOptions(),
  ]);
  const readyMap = Object.fromEntries(rows.map((r) => [r.ticker, r.publishStatus === 'published']));
  const admins = logs.length ? await AdminUser.findAll({ where: { id: [...new Set(logs.map((l) => l.adminId).filter(Boolean))] }, attributes: ['id', 'name'] }) : [];
  const nameOf = Object.fromEntries(admins.map((a) => [a.id, a.name]));
  const mapOnly = th.isMapOnly(theme, form);
  const checks = th.checks(form, readyMap, { mapOnly });
  // Company info for each row ("Profil": Siap terbit / Draf / Perlu ditinjau + why).
  const companies = rows.map((r) => {
    const item = co.listItem(r, { name: form.name, stageCount: 1 });
    const reason = item.status === 'ok' ? '' : item.completeness.missing[0] ? `${item.completeness.missing[0]} belum lengkap` : 'Ada perubahan yang belum terbit'; // COPY: perlu review
    return { ticker: r.ticker, name: r.name, logoUrl: r.logoUrl || null, ready: item.status === 'ok', statusLabel: item.statusLabel, reason };
  });
  return {
    theme: { slug: theme.slug, status: theme.status, statusLabel: theme.status === 'published' && !theme.publishedAt ? 'Terbit di peta sektor' : th.EDIT_STATUS[theme.status], published: !!theme.publishedAt, hasDraft: !!theme.draft, kind: mapOnly ? 'map' : 'chain', onSectorMap: !!theme.listedAt }, // COPY: perlu review ('Terbit di peta sektor')
    form,
    sectors,
    stats: { stageCount: form.stages.length, companyCount: tickers.length, theses: null },
    companies,
    notReady: companies.filter((c) => !c.ready),
    multiStage: th.multiStage(form),
    readiness: mapOnly ? null : th.readiness(form, readyMap),
    checks, canPublish: checks.every((c) => c.ok),
    history: logs.map((l) => ({ action: l.action, by: nameOf[l.adminId] || l.email, at: l.createdAt })),
    updatedAt: theme.updatedAt, updatedBy: theme.updatedByName || 'Sistem',
  };
}

// GET /admin/api/themes/:slug — AdminTemaEdit
exports.show = async (req, res, next) => {
  try {
    const theme = await loadTheme(req.params.slug);
    if (!theme) return notFound(res);
    res.json(await editView(theme));
  } catch (err) {
    next(err);
  }
};

// Editors without `publish` hand their draft over for review ("Perubahan harus diterbitkan Admin data").
const draftStatus = (req) => (can(req.adminPerms, 'tm', 'publish') ? 'draft' : 'review');

// POST /admin/api/themes — "Tambah tema" (AdminTema quick add or AdminTemaBaru). Saved as draft, hidden from customers.
exports.create = async (req, res, next) => {
  const { form, errors } = th.validateCreate(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);
  try {
    const refs = await checkRefs(res, form);
    if (!refs) return undefined;
    const base = th.slugify(form.name);
    let slug = base;
    for (let i = 2; await Industry.findOne({ where: { slug }, attributes: ['id'] }); i += 1) slug = `${base}-${i}`;
    // The subsector column is required from the start; listedAt/publishedAt stay NULL so the row is hidden until published.
    const subsectorId = form.sectorMap.subsectorId;
    await Industry.create({
      slug, name: form.name, subsectorId, position: await lastPosition(subsectorId), description: form.description || null,
      status: draftStatus(req), publishedAt: null, listedAt: null, draft: form, updatedByName: req.admin.name,
    });
    await audit(req, 'theme_created', target(slug), { summary: { verb: 'membuat tema', target: form.name, rest: '(draf)' } });
    res.status(201).json(await editView(await loadTheme(slug)));
  } catch (err) {
    next(err);
  }
};

// PATCH /admin/api/themes/:slug — "Simpan draf". Replaces only the sections sent; customers keep the published version.
exports.saveDraft = async (req, res, next) => {
  const { values, errors } = th.validateForm(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review
  try {
    const theme = await loadTheme(req.params.slug);
    if (!theme) return notFound(res);
    const before = formOf(theme);
    const form = { ...before, ...values };
    if (form.name.length < 3) return invalid(res, 'name', th.MSG.nameShort);
    if (!(await checkRefs(res, form, theme.id))) return undefined;
    await theme.update({ draft: form, status: draftStatus(req), updatedByName: req.admin.name });
    const ch = hist.sectionChange(before, Object.fromEntries(Object.keys(values).map((k) => [k, form[k]])));
    await audit(req, 'theme_draft_saved', target(theme.slug), {
      summary: { verb: hist.sectionVerb(ch.keys), target: before.name, rest: '(draf)' }, changes: ch.changes,
      revert: ch.keys.length ? { type: 'theme_sections', ref: theme.slug, before: ch.beforePart, after: ch.afterPart } : null,
    });
    res.json(await editView(theme));
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/themes/:slug/companies { ticker, stage? } — "Petakan" from the unmapped queue: adds the
// company to stage `stage` (1-based, default 1) of the draft, share empty ("Porsi pendapatannya diisi dari halaman tema").
exports.mapCompany = async (req, res, next) => {
  const ticker = String((req.body && req.body.ticker) || '').trim().toUpperCase();
  const stage = parseInt((req.body && req.body.stage) || 1, 10);
  if (!th.TICKER_RE.test(ticker)) return invalid(res, 'ticker', th.MSG.unknownTickers([ticker || '-']));
  try {
    const [theme, company] = await Promise.all([loadTheme(req.params.slug), Company.findByPk(ticker, { attributes: ['ticker'] })]);
    if (!theme) return notFound(res);
    if (!company) return invalid(res, 'ticker', th.MSG.unknownTickers([ticker]));
    // Copy: mutating theme.draft in place would make Sequelize see no change and skip the UPDATE.
    const before = structuredClone(formOf(theme));
    const form = structuredClone(before);
    if (!form.stages.length) return invalid(res, 'stage', th.MSG.noStage);
    const st = form.stages[stage - 1];
    if (!st) return invalid(res, 'stage', 'Tahap tidak ditemukan.'); // COPY: perlu review
    const already = st.rows.some((r) => r.ticker === ticker);
    if (!already) st.rows.push({ ticker, pct: null, source: '' });
    await theme.update({ draft: form, status: draftStatus(req), updatedByName: req.admin.name });
    const ch = hist.sectionChange(before, { stages: form.stages });
    await audit(req, 'theme_company_mapped', target(theme.slug), {
      summary: { verb: `menambahkan ${ticker} ke tahap`, target: st.name, rest: `· ${form.name} (draf)` }, changes: ch.changes,
      revert: ch.keys.length ? { type: 'theme_sections', ref: theme.slug, before: ch.beforePart, after: ch.afterPart } : null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/themes/:slug/publish — "Terbitkan". Needs tm:publish and every condition in th.checks.
exports.publish = async (req, res, next) => {
  try {
    const theme = await loadTheme(req.params.slug);
    if (!theme) return notFound(res);
    const live = th.columnsToForm(theme, theme.stages);
    const form = formOf(theme);
    const mapOnly = th.isMapOnly(theme, form);
    const checks = th.checks(form, await readyMapFor(th.formTickers(form)), { mapOnly });
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) {
      return fail(res, 422, 'INCOMPLETE', th.MSG.incomplete(failed[0].label, failed[0].note), Object.fromEntries(failed.map((c) => [c.key, c.note || c.label])));
    }
    // Draft may predate a sector/subsector change elsewhere: re-check before writing the sector page columns.
    if (!(await checkRefs(res, form, theme.id))) return undefined;
    const cols = th.formToColumns(form);
    const subId = cols.theme.subsectorId;
    // shortcut: new rows go last in their subsector; no ordering field in the form yet, add one when admins ask.
    const position = subId !== theme.subsectorId ? await lastPosition(subId) : theme.position;
    await sequelize.transaction(async (transaction) => {
      await theme.update({
        ...cols.theme, position, dataUpdatedAt: th.dataUpdatedAt(live, form, theme.dataUpdatedAt),
        // Every publish lists the row on the sector page; map-only rows stay unpublished as a value chain (/themes/:slug 404).
        listedAt: theme.listedAt || new Date(),
        status: 'published', publishedAt: mapOnly ? null : theme.publishedAt || new Date(), draft: null, updatedByName: req.admin.name,
      }, { transaction });
      // Stages are replaced whole: order, membership and shares all come from the form.
      await ThemeStage.destroy({ where: { industryId: theme.id }, transaction });
      await ThemeStage.bulkCreate(cols.stages.map((s) => ({ ...s, industryId: theme.id })), { transaction });
    });
    await audit(req, 'theme_published', target(theme.slug), {
      summary: { verb: mapOnly ? 'menerbitkan ke peta sektor' : 'menerbitkan tema', target: form.name, rest: '' }, // COPY: perlu review
      changes: hist.diffSections(live, form, Object.keys(form).filter((k) => hist.SECTION_LABELS[k])),
    });
    res.json(await editView(await loadTheme(theme.slug)));
  } catch (err) {
    next(err);
  }
};

// DELETE /admin/api/themes/:slug — "Hapus tema". Needs tm:delete. Stages go with it (FK cascade); mapped companies
// return to the "belum masuk tema" queue (companies.industryId is SET NULL). Not revertable from Riwayat.
exports.destroy = async (req, res, next) => {
  try {
    const theme = await loadTheme(req.params.slug);
    if (!theme) return notFound(res);
    const name = formOf(theme).name;
    const wasLive = !!(theme.listedAt || theme.publishedAt);
    await sequelize.transaction(async (transaction) => {
      await theme.destroy({ transaction });
      await audit(req, 'theme_deleted', target(theme.slug), { summary: { verb: 'menghapus tema', target: name, rest: wasLive ? '(sudah terbit)' : '(draf)' } });
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
