'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

/** 后台操作审计(oper_logs) 分页 */
router.get('/list', authAdmin, (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const where = ['1=1'];
  const params = [];
  const bind = (cond, v) => { if (v !== undefined && v !== '' && v !== null) { where.push(cond); params.push(v); } };
  bind('admin_name LIKE ?', req.query.admin ? `%${req.query.admin}%` : undefined);
  bind('action LIKE ?', req.query.action ? `%${req.query.action}%` : undefined);

  const total = db.prepare(`SELECT COUNT(*) c FROM oper_logs WHERE ${where.join(' AND ')}`).get(...params).c;
  const list = db.prepare(
    `SELECT * FROM oper_logs WHERE ${where.join(' AND ')}
     ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);

  return ok(res, { list, total, page, pageSize });
});

module.exports = router;