'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });
const ACTION_TEXT = { activate: '激活', verify: '验卡', consume: '扣次', freeze: '冻结', unfreeze: '解冻', query: '查询' };

/** 核销流水分页(可筛选卡号 / 项目 / 动作) */
router.get('/list', authAdmin, (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const where = ['1=1'];
  const params = [];
  const bind = (cond, v) => { if (v !== undefined && v !== '' && v !== null) { where.push(cond); params.push(v); } };

  bind('l.project_id = ?', req.query.project_id ? parseInt(req.query.project_id, 10) : undefined);
  bind('l.action = ?', req.query.action || undefined);
  if (req.query.keyword) {
    where.push('c.card LIKE ?');
    params.push(`%${String(req.query.keyword).trim().toUpperCase()}%`);
  }

  const total = db.prepare(
    `SELECT COUNT(*) c FROM card_logs l LEFT JOIN cards c ON c.id = l.card_id WHERE ${where.join(' AND ')}`
  ).get(...params).c;
  const list = db.prepare(
    `SELECT l.id, l.card_id, l.project_id, l.action, l.detail, l.ip, l.created_at,
            c.card, p.name AS project_name
     FROM card_logs l
     LEFT JOIN cards c ON c.id = l.card_id
     LEFT JOIN projects p ON p.id = l.project_id
     WHERE ${where.join(' AND ')}
     ORDER BY l.id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, (page - 1) * pageSize);

  return ok(res, {
    list: list.map((r) => ({ ...r, action_text: ACTION_TEXT[r.action] || r.action })),
    total, page, pageSize,
  });
});

module.exports = router;