'use strict';

// Riwayat perubahan (AdminRiwayat): admin_audit_logs gains what the page shows — module, kind, the sentence,
// before/after rows — and what "Kembalikan" needs. Rows are append-only; only reverted* may be set later.
// action -> [module, kind]; kind: data | pub | sec. Keep in sync with lib/adminHistory.js ACTIONS.
const BACKFILL = {
  company_draft_saved: ['em', 'data'], company_created: ['em', 'data'], company_bulk_review: ['em', 'data'], company_published: ['em', 'pub'],
  theme_created: ['tm', 'data'], theme_draft_saved: ['tm', 'data'], theme_company_mapped: ['tm', 'data'], theme_published: ['tm', 'pub'],
  user_suspended: ['usr', 'sec'], user_restored: ['usr', 'sec'], user_confirmation_resent: ['usr', 'sec'], user_password_reset_sent: ['usr', 'sec'], user_invited: ['usr', 'sec'],
  member_invited: ['acc', 'sec'], member_role_changed: ['acc', 'sec'], member_deactivated: ['acc', 'sec'], member_reactivated: ['acc', 'sec'],
  member_invite_resent: ['acc', 'sec'], role_created: ['acc', 'sec'], role_updated: ['acc', 'sec'], invite_accepted: ['acc', 'sec'],
  login_ok: ['security', 'sec'], login_password_ok: ['security', 'sec'], login_failed: ['security', 'sec'], twofa_failed: ['security', 'sec'],
  account_locked: ['security', 'sec'], logout: ['security', 'sec'],
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = 'admin_audit_logs';
    await queryInterface.addColumn(t, 'module', { type: Sequelize.STRING(20), allowNull: true });
    await queryInterface.addColumn(t, 'kind', { type: Sequelize.STRING(10), allowNull: true });
    await queryInterface.addColumn(t, 'summary', { type: Sequelize.JSONB, allowNull: true }); // { verb, target, rest }
    await queryInterface.addColumn(t, 'changes', { type: Sequelize.JSONB, allowNull: true }); // [{ field, label, before, after }]
    await queryInterface.addColumn(t, 'revert', { type: Sequelize.JSONB, allowNull: true }); // { type, ref, before, after }; NULL = not revertable
    await queryInterface.addColumn(t, 'revertedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn(t, 'revertedById', { type: Sequelize.UUID, allowNull: true });
    for (const [action, [module, kind]] of Object.entries(BACKFILL)) {
      await queryInterface.sequelize.query('UPDATE admin_audit_logs SET module = :module, kind = :kind WHERE action = :action AND module IS NULL', { replacements: { module, kind, action } });
    }
    await queryInterface.addIndex(t, ['createdAt']);
    await queryInterface.addIndex(t, ['module', 'createdAt']);
  },

  async down(queryInterface) {
    const t = 'admin_audit_logs';
    for (const c of ['revertedById', 'revertedAt', 'revert', 'changes', 'summary', 'kind', 'module']) await queryInterface.removeColumn(t, c);
  },
};
