'use strict';

// Standard error body: { error: { code, message, fields? } }
exports.fail = (res, status, code, message, fields) =>
  res.status(status).json({ error: { code, message, ...(fields && { fields }) } });
