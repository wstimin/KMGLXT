'use strict';

const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { getSecret } = require('../lib/secret');
const { readLocalVersion } = require('../lib/release');

const router = express.Router();

// 首屏只请求一次：安装状态、站点信息和当前会话一起返回。
router.get('/', (req, res) => {
  const db = getDb();
  const settings = Object.fromEntries(
    db.prepare('SELECT key, value FROM settings').all().map((row) => [row.key, row.value])
  );
  const installed = Boolean(db.prepare('SELECT id FROM admins LIMIT 1').get());
  let admin = null;
  const token = req.cookies?.syk_token;

  if (token) {
    try {
      const payload = jwt.verify(token, getSecret());
      const current = db.prepare(
        'SELECT id, username, role FROM admins WHERE id = ? AND status = 1'
      ).get(payload.id);
      if (current) admin = current;
    } catch {
      // 过期或无效 Cookie 按未登录处理，前端无需再发一次 401 请求。
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.json({
    code: 0,
    message: 'ok',
    data: {
      installed,
      defaultSiteName: settings.site_name || '十夜卡密',
      site: {
        name: settings.site_name || '',
        announcement: settings.announcement || '',
        version: readLocalVersion(path.join(__dirname, '..', '..')),
      },
      admin,
    },
  });
});

module.exports = router;
