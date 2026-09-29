'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const { getSecret } = require('./secret');

function issueAdminCookie(req, res, admin) {
  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    getSecret(),
    { expiresIn: config.jwt.expiresIn }
  );
  const secured = !!req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('syk_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secured,
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

module.exports = { issueAdminCookie };
