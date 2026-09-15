'use strict';

const express = require('express');

const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');
const { asyncWrap } = require('../../middleware/error');
const { logOper } = require('../../lib/audit');
const { now } = require('../../lib/time');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });
const KINDS = ['duration', 'times', 'permanent'];

function parseType(body, hasId) {
  const { name, kind, days, times, price, scope_projects, status, sort } = body || {};
  if (!name || !String(name).trim()) throw { code: 400, msg: '套餐名称不能为空' };
  if (String(name).trim().length > 20) throw { code: 400, msg: '套餐名称最长 20 字' };
  const k = KINDS.includes(kind) ? kind : 'duration';
  const d = Math.max(0, parseInt(days, 10) || 0);
  const t = Math.max(0, parseInt(times, 10) || 0);
  const p = Math.max(0, parseFloat(price) || 0);
  if (k === 'duration' && d < 1) throw { code: 400, msg: '时长卡需填写有效的时长天数' };
  if (k === 'times' && t < 1) throw { code: 400, msg: '次数卡需填写有效的次数' };
  if (k === 'duration' && d > 36500) throw { code: 400, msg: '时长天数过大' };
  if (k === 'times' && t > 10000000) throw { code: 400, msg: '次数过大' };
  let scope = '[]';
  if (Array.isArray(scope_projects)) scope = JSON.stringify(scope_projects);
  const st = hasId ? (status === 0 ? 0 : 1) : 1;
  const s = Math.max(0, parseInt(sort, 10) || 0);
  return { name: String(name).trim(), kind: k, days: d, times: t, price: p, scope, status: st, sort: s };
}

// 列表(全量,供管理页与下拉框)
router.get('/list', authAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM card_types ORDER BY sort, id').all();
  return ok(res, {
    list: rows.map((r) => ({ ...r, scope_projects: safeJson(r.scope_projects) })),
  });
});

// 可用的套餐下拉(含"全部项目"范围)
router.get('/options', authAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, name, kind, days, times FROM card_types WHERE status = 1 ORDER BY sort, id').all();
  return ok(res, { list: rows });
});

router.post('/create', authAdmin, asyncWrap(async (req, res) => {
  const t = parseType(req.body);
  const db = getDb();
  const info = db
    .prepare('INSERT INTO card_types (name, kind, days, times, price, scope_projects, status, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(t.name, t.kind, t.days, t.times, t.price, t.scope, t.status, t.sort, now());
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'card_type:create', '套餐', t.name);
  return ok(res, { id: info.lastInsertRowid });
}));

router.put('/:id', authAdmin, asyncWrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const exists = db.prepare('SELECT id FROM card_types WHERE id = ?').get(id);
  if (!exists) return res.status(404).json({ code: 404, message: '套餐不存在' });
  const t = parseType(req.body, true);
  db.prepare('UPDATE card_types SET name=?, kind=?, days=?, times=?, price=?, scope_projects=?, status=?, sort=? WHERE id=?')
    .run(t.name, t.kind, t.days, t.times, t.price, t.scope, t.status, t.sort, id);
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'card_type:update', '套餐', `#${id} ${t.name}`);
  return ok(res, null);
}));

router.delete('/:id', authAdmin, asyncWrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const t = db.prepare('SELECT * FROM card_types WHERE id = ?').get(id);
  if (!t) return res.status(404).json({ code: 404, message: '套餐不存在' });
  const used = db.prepare('SELECT COUNT(*) c FROM cards WHERE type_id = ?').get(id).c;
  if (used > 0) {
    db.prepare('UPDATE card_types SET status = 0 WHERE id = ?').run(id);
    logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'card_type:disable', '套餐', `已被 ${used} 张卡引用,改为停用`);
    return ok(res, { soft: true, used });
  }
  db.prepare('DELETE FROM card_types WHERE id = ?').run(id);
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'card_type:delete', '套餐', t.name);
  return ok(res, null);
}));

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

module.exports = router;