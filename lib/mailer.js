'use strict';

// shortcut: no real email provider yet, links are only logged. Replace with SMTP/Resend before release.
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

exports.sendEmailChange = async (to, token) => {
  const link = `${APP_URL}/konfirmasi-email?token=${token}`;
  if (process.env.NODE_ENV !== 'test') console.log(`[mailer] to=${to} link=${link}`);
};
