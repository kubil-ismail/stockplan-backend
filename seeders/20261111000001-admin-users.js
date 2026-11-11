'use strict';

const crypto = require('crypto');
const { hashPassword } = require('../lib/auth');
const { hashCode } = require('../lib/adminAuth');
const { otpauthUri } = require('../lib/totp');

// DEV ONLY: fixed credentials so Swagger/curl can log in. Alur aktivasi 2FA belum didesain (handoff design §12).
const DEV_PASSWORD = 'StockPlanDev2026';
const DEV_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const DEV_BACKUP = ['dev0-0001', 'dev0-0002', 'dev0-0003'];
const ADMINS = [
  { name: '[Nama Admin]', email: 'admin@stockplan.id', role: 'super' },
];

module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') throw new Error('Seeder admin hanya untuk dev.');
    const now = new Date();
    const passwordHash = await hashPassword(DEV_PASSWORD);
    await queryInterface.bulkInsert('admin_users', ADMINS.map((a) => ({
      id: crypto.randomUUID(), ...a, passwordHash, status: 'active', totpSecret: DEV_SECRET, twoFactorEnabledAt: now,
      backupCodes: JSON.stringify(DEV_BACKUP.map(hashCode)), createdAt: now, updatedAt: now,
    })));
    console.log(`Admin dev: ${ADMINS[0].email} / ${DEV_PASSWORD}\nTOTP: ${otpauthUri(DEV_SECRET, ADMINS[0].email)}\nKode cadangan: ${DEV_BACKUP.join(', ')}`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('admin_users', { email: ADMINS.map((a) => a.email) });
  },
};
