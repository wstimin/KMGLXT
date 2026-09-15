'use strict';

const express = require('express');

const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');
const { asyncWrap } = require('../../middleware/error');
const { logOper } = require('../../lib/audit');
const { now } = require('../../lib/time');
const cardsSvc = require('../../services/cards');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });
const STATUSES = ['unused', 'used', 'expired', 'disabled', 'void'];

/** 卡列表查询条件构造 */
function buildFilter(query) {
  const where = ['1=1'];
  const params = [];
  const bind = (cond, v) => {
    if (v !== undefined && v !== null && v !== '') {
      where.push(cond);
      params.push(v);
    }
  };
  bind('c.type_id = ?', query.type_id);
  bind('c.status = ?', query.status);
  bind('c.bound_project_id = ?', query.project);
  if (query.keyword) {
    where.push('c.card LIKE ?');
    params.push(`%${String(query.keyword).trim().toUpperCase()}%`);
  }
  if (query.from) {
    where.push('c.created_at >= ?');
    params.push(parseInt(query.from, 10));
  }
  if (query.to) {
    where.push('c.created_at <= ?');
    params.push(parseInt(query.to, 10));
  }
  return { where: where.join(' AND '), params };
}

// 全局卡池列表
router.get('/list', authAdmin, (req, res) => {
  const db = getDb();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
  const { where, params } = buildFilter(req.query);

  const total = db.prepare(`SELECT COUNT(*) c FROM cards c WHERE ${where}`).get(...params).c;
  const rows = db
    .prepare(
      `SELECT c.*, t.name AS type_name, t.kind AS type_kind, t.amount AS type_amount, p.name AS project_name
       FROM cards c
       LEFT JOIN card_types t ON t.id = c.type_id
       LEFT JOIN projects p ON p.id = c.bound_project_id
       WHERE ${where}
       ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, pageSize, (page - 1) * pageSize);

  return ok(res, { list: rows, total, page, pageSize });
});

// 卡详情 + 核销流水
router.get('/:id/detail', authAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const db = getDb();
  const card = db
    .prepare(
      `SELECT c.*, t.name AS type_name, t.kind AS type_kind, t.amount AS type_amount, p.name AS project_name
       FROM cards c
       LEFT JOIN card_types t ON t.id = c.type_id
       LEFT JOIN projects p ON p.id = c.bound_project_id
       WHERE c.id = ?`
    )
    .get(id);
  if (!card) return res.status(404).json({ code: 404, message: '卡密不存在' });
  const logs = db
    .prepare(
      `SELECT l.*, p.name AS project_name FROM card_logs l
       LEFT JOIN projects p ON p.id = l.project_id
       WHERE l.card_id = ? ORDER BY l.id DESC LIMIT 100`
    )
    .all(id);
  return ok(res, { card, logs });
});

// 批量操作:disable / enable / void / reset / delete
router.post('/batch', authAdmin, asyncWrap(async (req, res) => {
  const { action, ids } = req.body || {};
  const list = Array.isArray(ids) ? ids.map((x) => parseInt(x, 10)).filter((x) => x > 0) : [];
  const ACTIONS = ['disable', 'enable', 'void', 'reset', 'delete'];
  if (!ACTIONS.includes(action)) return res.status(400).json({ code: 400, message: '不支持的操作' });
  if (!list.length) return res.status(400).json({ code: 400, message: '请先选择卡密' });

  const db = getDb();
  const t = now();
  let affected = 0;
  db.exec('BEGIN');
  try {
    for (const id of list) {
      const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(id);
      if (!card) continue;
      let changed = false;
      if (action === 'disable' && card.status !== 'disabled' && card.status !== 'void') {
        db.prepare("UPDATE cards SET status = 'disabled' WHERE id = ?").run(id);
        changed = true;
      } else if (action === 'enable' && card.status === 'disabled') {
        const st = card.activated_at ? 'used' : 'unused';
        db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(st, id);
        changed = true;
      } else if (action === 'void' && card.status !== 'void') {
        db.prepare("UPDATE cards SET status = 'void' WHERE id = ?").run(id);
        changed = true;
      } else if (action === 'reset' && card.status === 'used') {
        db.prepare("UPDATE cards SET status = 'unused', bound_project_id = NULL, activated_at = NULL, expire_at = NULL, times_used = 0, last_verify_at = NULL WHERE id = ?").run(id);
        changed = true;
      } else if (action === 'delete') {
        db.prepare('DELETE FROM cards WHERE id = ?').run(id);
        changed = true;
      }
      if (changed) affected++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, `cards:${action}`, `卡密×${list.length}`, `生效 ${affected} 张`);
  return ok(res, { affected, total: list.length });
}));

// 批量生成
router.post('/generate', authAdmin, asyncWrap(async (req, res) => {
  const b = req.body || {};
  const count = parseInt(b.count, 10);
  if (!count || count < 1) throw { code: 400, msg: '生成数量至少 1' };
  if (count > cardsSvc.MAX_PER_BATCH) throw { code: 400, msg: `单批最多 ${cardsSvc.MAX_PER_BATCH} 张` };
  const length = parseInt(b.length, 10);
  if (!length || length < 8 || length > 32) throw { code: 400, msg: '卡密长度需在 8~32 之间' };
  const prefix = String(b.prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (prefix.length > 20) throw { code: 400, msg: '前缀最长 20 位(仅字母数字)' };
  if (prefix.length + length > 40) throw { code: 400, msg: '前缀 + 长度 总长不能超过 40' };
  const typeId = parseInt(b.type_id, 10);
  const db = getDb();
  const type = db.prepare('SELECT id FROM card_types WHERE id = ?').get(typeId);
  if (!type) throw { code: 400, msg: '请选择有效的套餐' };
  const charset = cardsSvc.buildCharset(b.charset_mode, b.custom_charset);
  const checkDigit = !!b.check_digit;
  const ins = cardsSvc.generateCards(db, {
    count,
    prefix,
    length,
    charset,
    checkDigit,
    typeId,
    remark: String(b.remark || ''),
  });
  db.prepare('INSERT INTO generate_logs (admin_id, admin_name, type_id, count, rule, batch_no, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(
      req.admin.id,
      req.admin.username,
      typeId,
      ins.inserted,
      JSON.stringify({ count, prefix, length, checkDigit, charsetMode: b.charset_mode, remark: b.remark || '' }),
      ins.batchNo,
      now()
    );
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'cards:generate', '批量生成', `套餐#${typeId} ×${ins.inserted} (${ins.batchNo})`);
  return ok(res, ins);
}));

// 导出(txt=仅卡号 / csv=明细)
router.get('/export', authAdmin, (req, res) => {
  const db = getDb();
  const format = req.query.format === 'csv' ? 'csv' : 'txt';
  const { where, params } = buildFilter(req.query);
  const rows = db
    .prepare(
      `SELECT c.card, t.name AS type_name, c.status, p.name AS project_name, c.created_at, c.activated_at
       FROM cards c
       LEFT JOIN card_types t ON t.id = c.type_id
       LEFT JOIN projects p ON p.id = c.bound_project_id
       WHERE ${where} ORDER BY c.id`
    )
    .all(...params);

  let body;
  let ext = 'txt';
  if (format === 'csv') {
    ext = 'csv';
    const head = ['卡号', '套餐', '状态', '归属项目', '创建时间', '激活时间'];
    const lines = [head.join(',')];
    for (const r of rows) {
      lines.push([r.card, r.type_name || '', r.status, r.project_name || '', r.created_at || '', r.activated_at || ''].join(','));
    }
    body = lines.join('\n');
  } else {
    body = rows.map((r) => r.card).join('\n');
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const filename = `${encodeURIComponent('卡密')}-${stamp}.${ext}`;
  res.set({
    'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8',
    'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
  });
  // BOM 便于 Excel 识别 UTF-8
  res.send('﻿' + body);
  logOper(db, { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'cards:export', '导出', `${format} · ${rows.length} 张`);
});

module.exports = router;