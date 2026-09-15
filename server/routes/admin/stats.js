'use strict';

const express = require('express');

const router = express.Router();
const { getDb } = require('../../db');
const { authAdmin } = require('../../middleware/auth.admin');
const { now, startOfToday } = require('../../lib/time');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

/** 仪表盘概览:全局卡密家底 + 今日动态 */
router.get('/overview', authAdmin, (req, res) => {
  const db = getDb();
  const t0 = startOfToday();
  const countByStatus = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS c FROM cards GROUP BY status').all().map((r) => [r.status, r.c])
  );
  const total = db.prepare('SELECT COUNT(*) AS c FROM cards').get().c;
  const generatedToday = db.prepare("SELECT COUNT(*) AS c FROM cards WHERE created_at >= ? AND source = ''").get(t0).c;
  const consumedToday = db
    .prepare("SELECT COUNT(*) AS c FROM card_logs WHERE action IN ('activate','consume') AND created_at >= ?")
    .get(t0).c;
  const projects = db.prepare('SELECT COUNT(*) AS c FROM projects WHERE status = 1').get().c;
  const admins = db.prepare('SELECT COUNT(*) AS c FROM admins WHERE status = 1').get().c;
  const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));

  return ok(res, {
    total,
    status: {
      unused: countByStatus.unused || 0,
      used: countByStatus.used || 0,
      expired: countByStatus.expired || 0,
      disabled: countByStatus.disabled || 0,
      void: countByStatus.void || 0,
    },
    today: { generated: generatedToday, consumed: consumedToday },
    projects,
    admins,
    serverTime: now(),
    site: { name: settings.site_name || '十夜卡密', announcement: settings.announcement || '' },
  });
});

/**
 * 各页面顶部「总览」指标
 * scope: cards(卡池) | types(套餐) | projects(项目) | logs(日志)
 */
router.get('/page-summary', authAdmin, (req, res) => {
  const scope = String(req.query.scope || '');
  const db = getDb();
  const t0 = startOfToday();
  const sum = (sql, ...args) => db.prepare(sql).get(...args).c;
  const byStatus = () =>
    Object.fromEntries(db.prepare('SELECT status, COUNT(*) c FROM cards GROUP BY status').all().map((r) => [r.status, r.c]));

  let data = null;
  if (scope === 'cards') {
    const by = byStatus();
    data = {
      total: sum('SELECT COUNT(*) c FROM cards'),
      unused: by.unused || 0,
      used: by.used || 0,
      stale: (by.expired || 0) + (by.disabled || 0),
      voided: by.void || 0,
      generated_today: sum("SELECT COUNT(*) c FROM cards WHERE created_at >= ? AND source = ''", t0),
      consumed_today: sum("SELECT COUNT(*) c FROM card_logs WHERE action IN ('activate','consume') AND created_at >= ?", t0),
    };
  } else if (scope === 'types') {
    const by = byStatus();
    data = {
      type_count: sum('SELECT COUNT(*) c FROM card_types'),
      card_total: sum('SELECT COUNT(*) c FROM cards'),
      unused: by.unused || 0,
      used: by.used || 0,
      stale: (by.expired || 0) + (by.disabled || 0),
    };
  } else if (scope === 'projects') {
    data = {
      project_total: sum('SELECT COUNT(*) c FROM projects'),
      project_active: sum('SELECT COUNT(*) c FROM projects WHERE status = 1'),
      today_consumed: sum("SELECT COUNT(*) c FROM card_logs WHERE action IN ('activate','consume') AND created_at >= ?", t0),
      bound_cards: sum('SELECT COUNT(*) c FROM cards WHERE bound_project_id > 0'),
    };
  } else if (scope === 'logs') {
    data = {
      today_total: sum('SELECT COUNT(*) c FROM card_logs WHERE created_at >= ?', t0),
      today_activate: sum("SELECT COUNT(*) c FROM card_logs WHERE action = 'activate' AND created_at >= ?", t0),
      today_consume: sum("SELECT COUNT(*) c FROM card_logs WHERE action = 'consume' AND created_at >= ?", t0),
      today_rejected: sum("SELECT COUNT(*) c FROM card_logs WHERE detail LIKE '%拒绝%' AND created_at >= ?", t0),
      today_oper: sum('SELECT COUNT(*) c FROM oper_logs WHERE created_at >= ?', t0),
    };
  } else {
    return res.status(400).json({ code: 400, message: 'scope 参数无效' });
  }
  return ok(res, data);
});

/** 近 N 天「生成 vs 核销」趋势(默认 7,可 30) */
router.get('/trend', authAdmin, (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 7));
  const db = getDb();
  const t0 = now() - days * 86400;

  const generated = Object.fromEntries(
    db.prepare("SELECT date(created_at,'unixepoch','localtime') d, COUNT(*) c FROM cards WHERE source = '' AND created_at >= ? GROUP BY d").all(t0).map((r) => [r.d, r.c])
  );
  const consumed = Object.fromEntries(
    db.prepare("SELECT date(created_at,'unixepoch','localtime') d, COUNT(*) c FROM card_logs WHERE action IN ('activate','consume') AND created_at >= ? GROUP BY d").all(t0).map((r) => [r.d, r.c])
  );

  const list = [];
  const pad = (x) => String(x).padStart(2, '0');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400 * 1000);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    list.push({
      date: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      generated: generated[key] || 0,
      consumed: consumed[key] || 0,
    });
  }
  return ok(res, { list, days });
});

/** 项目核销占比(activate+consume 按项目分组) */
router.get('/distribution', authAdmin, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT l.project_id, COALESCE(p.name, '未归属') AS project_name, COUNT(*) c
     FROM card_logs l LEFT JOIN projects p ON p.id = l.project_id
     WHERE l.action IN ('activate','consume') AND l.project_id > 0
     GROUP BY l.project_id ORDER BY c DESC`
  ).all();
  const total = rows.reduce((s, r) => s + r.c, 0);
  return ok(res, { list: rows, total });
});

/** 最近核销动态(12 条) */
router.get('/recent', authAdmin, (req, res) => {
  const db = getDb();
  const ACTION_TEXT = { activate: '激活', verify: '验卡', consume: '扣次', freeze: '冻结', unfreeze: '解冻', query: '查询' };
  const rows = db.prepare(
    `SELECT l.id, l.card_id, l.project_id, l.action, l.detail, l.ip, l.created_at,
            c.card, p.name AS project_name
     FROM card_logs l
     LEFT JOIN cards c ON c.id = l.card_id
     LEFT JOIN projects p ON p.id = l.project_id
     ORDER BY l.id DESC LIMIT 12`
  ).all();
  return ok(res, {
    list: rows.map((r) => ({ ...r, action_text: ACTION_TEXT[r.action] || r.action, card: r.card || '(卡已删除)' })),
  });
});

module.exports = router;