'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb, initSettings, DEFAULT_SETTINGS } = require('../db');
const { issueAdminCookie } = require('../lib/session');
const { now } = require('../lib/time');
const { asyncWrap } = require('../middleware/error');

const router = express.Router();
const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

function isInstalled(db) {
  return Boolean(db.prepare('SELECT id FROM admins LIMIT 1').get());
}

router.get('/status', (req, res) => {
  const db = getDb();
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'site_name'").get();
  return ok(res, {
    installed: isInstalled(db),
    defaultSiteName: setting?.value || DEFAULT_SETTINGS.site_name,
  });
});

router.post('/complete', asyncWrap(async (req, res) => {
  const db = getDb();
  if (isInstalled(db)) {
    return res.status(409).json({ code: 409, message: '系统已经完成安装' });
  }

  const siteName = String(req.body?.siteName || '').trim();
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');

  if (siteName.length < 2 || siteName.length > 30) {
    return res.status(400).json({ code: 400, message: '站点名称长度需在 2-30 位之间' });
  }
  if (username.length < 2 || username.length > 32) {
    return res.status(400).json({ code: 400, message: '管理员账号长度需在 2-32 位之间' });
  }
  if (!/^[\w一-龥-]+$/.test(username)) {
    return res.status(400).json({ code: 400, message: '管理员账号只能包含字母、数字、下划线、中文和连字符' });
  }
  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({ code: 400, message: '管理员密码长度需在 8-128 位之间' });
  }

  const hash = await bcrypt.hash(password, 10);
  const timestamp = now();
  let admin;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (isInstalled(db)) throw Object.assign(new Error('系统已经完成安装'), { status: 409, code: 409 });
    initSettings(db);
    db.prepare(
      'INSERT INTO admins (username, password, role, status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
    ).run(username, hash, 'super', timestamp, timestamp);
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('site_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(siteName);
    admin = db.prepare('SELECT id, username, role FROM admins WHERE username = ?').get(username);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* transaction already closed */ }
    if (error.status === 409) {
      return res.status(409).json({ code: 409, message: error.message });
    }
    throw error;
  }

  issueAdminCookie(req, res, admin);
  return ok(res, { admin, site: { name: siteName } });
}));

module.exports = router;
