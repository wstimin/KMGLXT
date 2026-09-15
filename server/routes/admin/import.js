'use strict';

const express = require('express');
const multer = require('multer');

const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');
const { asyncWrap } = require('../../middleware/error');
const { logOper } = require('../../lib/audit');
const { now } = require('../../lib/time');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const STATUS_MAP = {
  unused: 'unused',
  未使用: 'unused',
  used: 'used',
  已使用: 'used',
  expired: 'expired',
  已过期: 'expired',
  disabled: 'disabled',
  已禁用: 'disabled',
  void: 'void',
  已作废: 'void',
};

/**
 * 解析导入文本:每行一条,格式:
 *   卡号 | 卡号,状态 | 卡号,状态,备注
 * 分隔符支持逗号 / Tab / 分号;跳过空行与表头。
 */
function parseLines(text) {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // 表头探测
    if (i === 0 && /^(卡号|card)([,\t;,]|$)/i.test(raw)) continue;
    const parts = raw.split(/[,\t;]/).map((p) => p.trim());
    const card = String(parts[0] || '').toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9]{4,40}$/.test(card)) {
      out.push({ valid: false, line: i + 1, raw, reason: '卡号格式不正确' });
      continue;
    }
    const status = STATUS_MAP[parts[1]] || 'unused';
    const remark = (parts[2] || '').slice(0, 100);
    out.push({ valid: true, card, status, remark });
  }
  return out;
}

router.post('/cards', authAdmin, upload.single('file'), asyncWrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择要导入的文件' });
  const typeId = parseInt(req.body && req.body.type_id, 10);
  const db = getDb();
  const type = db.prepare('SELECT id FROM card_types WHERE id = ?').get(typeId);
  if (!type) return res.status(400).json({ code: 400, message: '请选择有效的套餐' });

  const text = req.file.buffer.toString('utf8');
  const parsed = parseLines(text);
  const valid = parsed.filter((p) => p.valid);

  const stmt = db.prepare(
    "INSERT INTO cards (card, type_id, status, remark, created_at, source) VALUES (?,?,?,?,?,'导入')"
  );
  const existMap = new Set(
    db.prepare('SELECT card FROM cards WHERE card IS NOT NULL').all().map((r) => r.card)
  );
  const fileSeen = new Set();

  let inserted = 0;
  const skipped = [];
  for (const p of valid) {
    if (existMap.has(p.card) || fileSeen.has(p.card)) {
      skipped.push({ card: p.card, reason: '已存在' });
      continue;
    }
    try {
      stmt.run(p.card, typeId, p.status, p.remark, now());
    } catch (e) {
      skipped.push({ card: p.card, reason: e.message || '写入失败' });
      continue;
    }
    fileSeen.add(p.card);
    inserted++;
  }

  logOper(
    db,
    { id: req.admin.id, username: req.admin.username, _ip: req.ip },
    'cards:import',
    '导入',
    `套餐#${typeId} 文件 ${valid.length} 行,成功 ${inserted},跳过 ${skipped.length}`
  );
  return ok(res, {
    total: valid.length,
    invalid: parsed.length - valid.length,
    inserted,
    skipped: skipped.length,
    skippedList: skipped.slice(0, 50),
  });
}));

module.exports = router;