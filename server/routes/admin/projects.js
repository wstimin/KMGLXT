'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');
const { asyncWrap } = require('../../middleware/error');
const { logOper } = require('../../lib/audit');
const { genAppKey, genAppSecret } = require('../../lib/crypto');
const { now } = require('../../lib/time');
const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

/* ── 下拉(保持原有) ── */
router.get('/options', authAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT id, name, status FROM projects ORDER BY id')
    .all()
    .map((r) => ({ id: r.id, name: r.name, disabled: r.status !== 1 }));
  return ok(res, { list: rows });
});

/* ── 列表(全量,不含 secret) ── */
router.get('/list', authAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    "SELECT id, name, app_key, status, callback_url, ip_whitelist, rate_limit, remark, created_at FROM projects ORDER BY id"
  ).all();
  return ok(res, { list: rows });
});

/* ── 创建项目(返回 secret 一次) ── */
router.post('/create', authAdmin, asyncWrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) throw { code: 400, msg: '项目名称不能为空' };
  if (name.length > 30) throw { code: 400, msg: '项目名称最长 30 字' };
  const callbackUrl = String(b.callback_url || '').trim();
  const ipWhitelist = String(b.ip_whitelist || '').trim();
  const rateLimit = Math.max(0, parseInt(b.rate_limit, 10) || 60);
  const remark = String(b.remark || '').trim();

  const appKey = genAppKey();
  const appSecret = genAppSecret();
  const t = now();

  const db = getDb();
  const info = db.prepare(
    'INSERT INTO projects (name, app_key, app_secret, status, callback_url, ip_whitelist, rate_limit, remark, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(name, appKey, appSecret, 1, callbackUrl, ipWhitelist, rateLimit, remark, t);

  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'project:create', '项目', name);

  return ok(res, { id: info.lastInsertRowid, app_key: appKey, app_secret: appSecret });
}));

/* ── 更新(不含密钥) ── */
router.put('/:id', authAdmin, asyncWrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const row = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ code: 404, message: '项目不存在' });
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) throw { code: 400, msg: '项目名称不能为空' };
  db.prepare(
    'UPDATE projects SET name=?, status=?, callback_url=?, ip_whitelist=?, rate_limit=?, remark=? WHERE id=?'
  ).run(
    name,
    b.status === 0 ? 0 : 1,
    String(b.callback_url || '').trim(),
    String(b.ip_whitelist || '').trim(),
    Math.max(0, parseInt(b.rate_limit, 10) || 60),
    String(b.remark || '').trim(),
    id
  );
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'project:update', '项目', `#${id} ${name}`);
  return ok(res, null);
}));

/* ── 删除(有卡绑定则软停用) ── */
router.delete('/:id', authAdmin, asyncWrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ code: 404, message: '项目不存在' });
  const used = db.prepare('SELECT COUNT(*) c FROM cards WHERE bound_project_id = ?').get(id).c;
  if (used > 0) {
    db.prepare('UPDATE projects SET status = 0 WHERE id = ?').run(id);
    logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'project:disable', '项目', `已被 ${used} 张卡绑定,改为停用`);
    return ok(res, { soft: true, used });
  }
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'project:delete', '项目', row.name);
  return ok(res, null);
}));

/* ── 重置 app_secret ── */
router.post('/:id/reset-secret', authAdmin, asyncWrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const row = db.prepare('SELECT id, name FROM projects WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ code: 404, message: '项目不存在' });
  const newSecret = genAppSecret();
  db.prepare('UPDATE projects SET app_secret = ? WHERE id = ?').run(newSecret, id);
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'project:reset-secret', '项目', row.name);
  return ok(res, { app_secret: newSecret });
}));

module.exports = router;
