'use strict';

// Sections of the company form the team has edited by hand. BEI sync overwrites the other sections automatically;
// these raise a conflict in AdminSinkron instead ("Bagian ini sudah pernah diatur tim, jadi tidak ditimpa otomatis").
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('market_companies', 'teamSections', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
    // Backfill from every draft save so far (revert.after holds exactly the sections that changed).
    await queryInterface.sequelize.query(`
      UPDATE market_companies c SET "teamSections" = s.keys
      FROM (
        SELECT l.target AS ticker, jsonb_agg(DISTINCT k) AS keys
        FROM admin_audit_logs l CROSS JOIN LATERAL jsonb_object_keys(l.revert->'after') AS k
        WHERE l.action = 'company_draft_saved' AND jsonb_typeof(l.revert->'after') = 'object'
        GROUP BY l.target
      ) s
      WHERE c.ticker = s.ticker`);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('market_companies', 'teamSections');
  },
};
