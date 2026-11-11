'use strict';

const { Op } = require('sequelize');
const { sequelize, Theme, ThemeStage, Sector, Industry, Company, AdminAuditLog, AdminUser } = require('../models');
const th = require('../lib/adminThemes');
const co = require('../lib/adminCompanies');
const { can } = require('../lib/adminRoles');
const { audit } = require('../lib/audit');
const { fail } = require('../lib/http');

const withRefs = { include: [{ model: Sector, as: 'sector', attributes: ['id', 'slug', 'name'] }, { model: ThemeStage, as: 'stages' }] };
const loadTheme = (slug) => Theme.findOne({ where: { slug: String(slug || '') }, ...withRefs });
const formOf = (t) => t.draft || th.columnsToForm(t, t.stages);
const target = (slug) => `theme:${slug}`;
const notFound = (res) => fail(res, 404, 'NOT_FOUND', th.MSG.notFound);
const invalid = (res, field, msg) => fail(res, 422, 'VALIDATION', msg, { [field]: msg });

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
  const tickers = th.formTickers(form);
  if (tickers.length) {
    const found = new Set((await Company.findAll({ where: { ticker: tickers }, attributes: ['ticker'], raw: true })).map((r) => r.ticker));
    const missing = tickers.filter((t) => !found.has(t));
    if (missing.length) return invalid(res, 'stages', th.MSG.unknownTickers(missing)) && null;
  }
  const dup = await Theme.findOne({ where: { name: { [Op.iLike]: form.name.replace(/[\\%_]/g, '\\$&') }, ...(selfId && { id: { [Op.ne]: selfId } }) }, attributes: ['id'] });
  if (dup) return fail(res, 409, 'THEME_TAKEN', th.MSG.nameTaken, { name: th.MSG.nameTaken }) && null;
  return { sectorId };
}

// GET /admin/api/themes?q=&tab=all|open|draft|review&sector=&queue=3 — AdminTema
exports.index = async (req, res, next) => {
  const q = String(req.query.q || '').slice(0, 50);
  const sector = typeof req.query.sector === 'string' ? req.query.sector : '';
  const tab = ['all', 'open', 'draft', 'review'].includes(req.query.tab) ? req.query.tab : 'all';
  const queue = Math.min(20, Math.max(0, parseInt(req.query.queue, 10) || 3));
  try {
    const [themes, companies, industries, sectors] = await Promise.all([
      Theme.findAll(withRefs),
      // shortcut: loads every company's light fields for readiness + the unmapped queue; fine for ~1k listings.
      Company.findAll({ attributes: ['ticker', 'name', 'logoUrl', 'status', 'marketCap', 'sectorId', 'industryId', 'publishStatus'], raw: true }),
      Industry.findAll({ where: { themeSlug: { [Op.ne]: null } }, attributes: ['id', 'themeSlug'], raw: true }),
      Sector.findAll({ attributes: ['slug', 'name'], order: [['position', 'ASC']] }),
    ]);
    const readyMap = Object.fromEntries(companies.map((c) => [c.ticker, c.publishStatus === 'published']));
    const forms = new Map(themes.map((t) => [t.id, formOf(t)]));
    const ORDER = { open: 0, review: 1, draft: 2 };
    const all = themes.map((t) => th.listRow(t, forms.get(t.id), readyMap))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || new Date(b.updatedAt) - new Date(a.updatedAt));
    const { tabs, rows } = th.filterList(all, { q, sector, tab });

    // Mapped = in any stage of any theme, published or draft ("Petakan" takes a company out of the queue).
    const mapped = new Set([...forms.values()].flatMap(th.formTickers));
    const allRows = [...forms.values()].flatMap((f) => f.stages.flatMap((s) => s.rows));
    const openRows = themes.filter((t) => t.publishedAt).flatMap((t) => th.columnsToForm(t, t.stages).stages.flatMap((s) => s.rows));
    const bySlug = new Map(themes.map((t) => [t.slug, t]));
    const themeByIndustry = new Map(industries.map((i) => [i.id, bySlug.get(i.themeSlug)]).filter(([, t]) => t));
    const suggest = (c) => {
      const viaInd = themeByIndustry.get(c.industryId);
      if (viaInd) return { slug: viaInd.slug, name: viaInd.name, via: 'industri' };
      const viaSec = themes.filter((t) => t.sectorId && t.sectorId === c.sectorId).sort((a, b) => a.name.localeCompare(b.name))[0];
      return viaSec ? { slug: viaSec.slug, name: viaSec.name, via: 'sektor' } : null;
    };

    res.json({
      summary: {
        open: all.filter((r) => r.published).length, // "bisa dibuka pengguna", even while a newer draft is pending
        draft: all.filter((r) => r.status === 'draft').length,
        mappedCompanies: { count: mapped.size, of: companies.length },
        missingShares: { count: allRows.filter((r) => r.pct === null).length, inOpenThemes: openRows.filter((r) => r.pct === null).length },
      },
      tabs, total: rows.length, items: rows,
      sectors: sectors.map((s) => ({ slug: s.slug, name: s.name })),
      unmapped: th.unmappedQueue(companies, mapped, suggest, queue),
    });
  } catch (err) {
    next(err);
  }
};

async function editView(theme) {
  const form = formOf(theme);
  const tickers = th.formTickers(form);
  const [rows, logs] = await Promise.all([
    tickers.length ? Company.findAll({ where: { ticker: tickers }, include: [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: Industry, as: 'industry', attributes: ['name'] }] }) : [],
    AdminAuditLog.findAll({ where: { target: target(theme.slug) }, order: [['createdAt', 'DESC']], limit: 5 }),
  ]);
  const readyMap = Object.fromEntries(rows.map((r) => [r.ticker, r.publishStatus === 'published']));
  const admins = logs.length ? await AdminUser.findAll({ where: { id: [...new Set(logs.map((l) => l.adminId).filter(Boolean))] }, attributes: ['id', 'name'] }) : [];
  const nameOf = Object.fromEntries(admins.map((a) => [a.id, a.name]));
  const checks = th.checks(form, readyMap);
  // Company info for each row ("Profil": Siap terbit / Draf / Perlu ditinjau + why).
  const companies = rows.map((r) => {
    const item = co.listItem(r, { name: form.name, stageCount: 1 });
    const reason = item.status === 'ok' ? '' : item.completeness.missing[0] ? `${item.completeness.missing[0]} belum lengkap` : 'Ada perubahan yang belum terbit'; // COPY: perlu review
    return { ticker: r.ticker, name: r.name, logoUrl: r.logoUrl || null, ready: item.status === 'ok', statusLabel: item.statusLabel, reason };
  });
  return {
    theme: { slug: theme.slug, status: theme.status, statusLabel: th.EDIT_STATUS[theme.status], published: !!theme.publishedAt, hasDraft: !!theme.draft },
    form,
    stats: { stageCount: form.stages.length, companyCount: tickers.length, theses: null },
    companies,
    notReady: companies.filter((c) => !c.ready),
    multiStage: th.multiStage(form),
    readiness: th.readiness(form, readyMap),
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
    for (let i = 2; await Theme.findOne({ where: { slug }, attributes: ['id'] }); i += 1) slug = `${base}-${i}`;
    await Theme.create({
      slug, name: form.name, sectorId: refs.sectorId, description: form.description || null,
      status: draftStatus(req), publishedAt: null, draft: form, updatedByName: req.admin.name,
    });
    await audit(req, 'theme_created', target(slug));
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
    const form = { ...formOf(theme), ...values };
    if (form.name.length < 3) return invalid(res, 'name', th.MSG.nameShort);
    if (!(await checkRefs(res, form, theme.id))) return undefined;
    await theme.update({ draft: form, status: draftStatus(req), updatedByName: req.admin.name });
    await audit(req, 'theme_draft_saved', target(theme.slug));
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
    const form = structuredClone(formOf(theme));
    if (!form.stages.length) return invalid(res, 'stage', th.MSG.noStage);
    const st = form.stages[stage - 1];
    if (!st) return invalid(res, 'stage', 'Tahap tidak ditemukan.'); // COPY: perlu review
    if (!st.rows.some((r) => r.ticker === ticker)) st.rows.push({ ticker, pct: null, source: '' });
    await theme.update({ draft: form, status: draftStatus(req), updatedByName: req.admin.name });
    await audit(req, 'theme_company_mapped', target(theme.slug));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/themes/:slug/publish — "Terbitkan". Needs tm:publish and all 5 conditions.
exports.publish = async (req, res, next) => {
  try {
    const theme = await loadTheme(req.params.slug);
    if (!theme) return notFound(res);
    const form = formOf(theme);
    const checks = th.checks(form, await readyMapFor(th.formTickers(form)));
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) {
      return fail(res, 422, 'INCOMPLETE', th.MSG.incomplete(failed[0].label, failed[0].note), Object.fromEntries(failed.map((c) => [c.key, c.note || c.label])));
    }
    const sector = form.sectorSlug ? await Sector.findOne({ where: { slug: form.sectorSlug }, attributes: ['id'] }) : null;
    const cols = th.formToColumns(form);
    await sequelize.transaction(async (transaction) => {
      await theme.update({
        ...cols.theme, sectorId: sector ? sector.id : null,
        status: 'published', publishedAt: theme.publishedAt || new Date(), draft: null, updatedByName: req.admin.name,
      }, { transaction });
      // Stages are replaced whole: order, membership and shares all come from the form.
      await ThemeStage.destroy({ where: { themeId: theme.id }, transaction });
      await ThemeStage.bulkCreate(cols.stages.map((s) => ({ ...s, themeId: theme.id })), { transaction });
    });
    await audit(req, 'theme_published', target(theme.slug));
    res.json(await editView(await loadTheme(theme.slug)));
  } catch (err) {
    next(err);
  }
};
