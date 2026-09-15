'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { secretPath } = require('../config');

let cached = null;

/** 读取或首次生成持久化的应用密钥(JWT 签名等),保证重启后会话仍有效 */
function getSecret() {
  if (cached) return cached;
  if (fs.existsSync(secretPath)) {
    cached = fs.readFileSync(secretPath, 'utf8').trim();
  } else {
    cached = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, cached, { mode: 0o600 });
  }
  return cached;
}

module.exports = { getSecret };