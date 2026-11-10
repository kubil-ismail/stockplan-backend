'use strict';

// Notification kinds from spec/types.ts. Defaults from HANDOFF §6.8:
// all in-app on; email only for thesis_eval, ticket_reply, data_delayed.
const KINDS = ['thesis_eval', 'ticket_reply', 'report_published', 'data_delayed', 'ipo', 'theme_update', 'feature'];
const EMAIL_DEFAULT = ['thesis_eval', 'ticket_reply', 'data_delayed'];

const DEFAULT_PREFS = {
  language: 'id',
  numberFormat: 'short',
  glossary: true,
  buyFeePct: 0.15,
  sellFeePct: 0.25,
  defaultEvalEvery: 6,
  notifications: Object.fromEntries(KINDS.map((k) => [k, { inApp: true, email: EMAIL_DEFAULT.includes(k) }])),
};

// Fills anything missing (older rows, new kinds) so clients always see a full object.
function withDefaults(prefs = {}) {
  const notifications = {};
  for (const k of KINDS) notifications[k] = { ...DEFAULT_PREFS.notifications[k], ...(prefs.notifications && prefs.notifications[k]) };
  return { ...DEFAULT_PREFS, ...prefs, notifications };
}

const MSG = {
  invalid: 'Pilihan tidak valid.', // COPY: perlu review
  fee: 'Biaya harus berupa angka 0–10.', // COPY: perlu review
};

const isBool = (v) => typeof v === 'boolean';
const isFee = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10;

// PATCH /me/prefs: partial update; returns only validated fields in `values`.
function validatePrefs(body = {}) {
  const values = {};
  const errors = {};
  const pick = (key, ok) => {
    if (!(key in body)) return;
    if (ok(body[key])) values[key] = body[key];
    else errors[key] = key === 'buyFeePct' || key === 'sellFeePct' ? MSG.fee : MSG.invalid;
  };
  pick('language', (v) => v === 'id'); // "English (segera)" is disabled in the design
  pick('numberFormat', (v) => v === 'short' || v === 'full');
  pick('glossary', isBool);
  pick('buyFeePct', isFee);
  pick('sellFeePct', isFee);
  pick('defaultEvalEvery', (v) => [3, 6, 12].includes(v));

  if ('notifications' in body) {
    const n = body.notifications;
    const bad = !n || typeof n !== 'object' || Object.entries(n).some(([k, v]) =>
      !KINDS.includes(k) || !v || typeof v !== 'object' || Object.entries(v).some(([f, x]) => !['inApp', 'email'].includes(f) || !isBool(x)));
    if (bad) errors.notifications = MSG.invalid;
    else values.notifications = n;
  }
  return { values, errors: Object.keys(errors).length ? errors : null };
}

// Merges a validated partial update into the stored prefs (notifications merged per kind/channel).
function mergePrefs(current, values) {
  const base = withDefaults(current);
  const out = { ...base, ...values };
  out.notifications = withDefaults({ notifications: base.notifications }).notifications;
  for (const [k, v] of Object.entries(values.notifications || {})) out.notifications[k] = { ...out.notifications[k], ...v };
  return out;
}

module.exports = { KINDS, DEFAULT_PREFS, MSG, withDefaults, validatePrefs, mergePrefs };
