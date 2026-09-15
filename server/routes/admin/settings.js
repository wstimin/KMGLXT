'use strict';

const express = require('express');

const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');
const { asyncWrap } = require('../../middleware/error');
const { logOper } = require('../../lib/audit');
const { now } = require('../../lib/time');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });
const ALLOWED = new Set(['site_name', 'announcement']);

router.get('/all', authAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return ok(res, { settings: map });
});

router.put('/update', authAdmin, asyncWrap(async (req, res) => {
  const body = req.body || {};
  const db = getDb();
  const upd = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED.has(k)) continue;
    if (k === 'site_name' && String(v).trim().length > 30) {
      return res.status(400).json({ code: 400, message: '站点名称最长 30 字' });
    }
    upd.run(k, typeof v === 'string' ? v : String(v));
  }
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'settings:update', '系统设置', JSON.stringify(body));
  return ok(res, null);
}));

module.exports = router;