'use strict';

/**
 * 对外验卡核心业务逻辑。
 * 所有接口的返回值统一为 { code, message, data }，由路由直接 res.json 回去。
 */

const { getDb } = require('../db');
const { now } = require('../lib/time');
const { notifyCallback } = require('../lib/callback');

/* ── 常量 ── */
const STATUS_TEXT = { unused: '未使用', used: '已使用', expired: '已过期', disabled: '已禁用', void: '已作废' };

const errs = {
  2001: '卡号不存在',
  2002: '卡密已被使用',
  2003: '卡密已过期',
  2004: '卡密已被禁用',
  2005: '卡密已作废',
  2006: '卡密已绑定其他项目',
  2007: '该卡在项目不可用',
  2008: '次数不足',
  2009: '卡已被冻结',
  2010: '卡密尚未激活',
  2011: '该套餐不支持扣次数',
  2012: '金额卡不做次数核销,由外部平台核对面额',
};
function err(code) { return { code, message: errs[code] || '未知错误', data: null }; }

function ok(data) { return { code: 0, message: 'ok', data }; }

function safeJson(s) { try { return JSON.parse(s); } catch { return []; } }

/* ── 日志写入(核销流水) ── */
function logCard(db, cardId, projectId, action, detail, ip) {
  db.prepare(
    'INSERT INTO card_logs (card_id, project_id, action, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
  ).run(cardId, projectId || 0, action, detail || '', ip || '', now());
}

/* ── 基础加载 + 状态预处理 ── */
function loadCard(db, rawCard) {
  if (!rawCard || typeof rawCard !== 'string') return null;
  const card = rawCard.trim().toUpperCase();
  if (!card) return null;
  return db
    .prepare(
      `SELECT c.*, t.kind, t.days, t.times, t.amount, t.scope_projects
       FROM cards c JOIN card_types t ON t.id = c.type_id
       WHERE c.card = ?`
    )
    .get(card);
}

function scopeCheck(typeScopeProjects, project) {
  const arr = safeJson(typeScopeProjects);
  if (!arr.length) return true; // [] = 全部项目
  return arr.includes(project.id);
}

function computeRemaining(row, nowTs) {
  if (row.kind === 'duration') {
    if (row.status === 'unused') return { remaining_days: row.days, remaining_times: null };
    const exp = row.expire_at || 0;
    const left = exp - nowTs;
    return { remaining_days: left > 0 ? Math.ceil(left / 86400) : 0, remaining_times: null };
  }
  if (row.kind === 'times') {
    return { remaining_days: null, remaining_times: Math.max(0, row.times - row.times_used) };
  }
  if (row.kind === 'money') {
    // 金额卡:面额固定,十夜不动账,剩余金额始终 = 面额
    return { remaining_days: null, remaining_times: null, remaining_amount: row.amount };
  }
  return { remaining_days: null, remaining_times: null }; // permanent
}

/* ── 1. verify ── */
function doVerify(db, project, rawCard, ip) {
  const row = loadCard(db, rawCard);
  if (!row) return err(2001);

  if (row.frozen) return err(2009);

  // 已使用但绑定其他项目 → 2006
  if (row.status === 'used' && row.bound_project_id && row.bound_project_id !== project.id) {
    logCard(db, row.id, project.id, 'verify', `拒绝:已绑定项目#${row.bound_project_id}`, ip);
    return err(2006);
  }

  if (!scopeCheck(row.scope_projects, project)) {
    logCard(db, row.id, project.id, 'verify', '拒绝:套餐不适用该项目', ip);
    return err(2007);
  }

  // 惰性过期
  let st = row.status;
  if (st === 'used' && row.kind === 'duration' && row.expire_at && row.expire_at < now()) {
    db.prepare("UPDATE cards SET status = 'expired' WHERE id = ?").run(row.id);
    st = 'expired';
    row.status = 'expired';
  }

  if (st === 'disabled') { logCard(db, row.id, project.id, 'verify', '拒绝:已禁用', ip); return err(2004); }
  if (st === 'void')     { logCard(db, row.id, project.id, 'verify', '拒绝:已作废', ip); return err(2005); }
  if (st === 'expired')  { logCard(db, row.id, project.id, 'verify', '拒绝:已过期', ip); return err(2003); }

  const remaining = computeRemaining(row, now());
  const data = {
    valid: true,
    type: row.kind,
    card: row.card,
    bound_project: row.bound_project_id || null,
    ...remaining,
  };

  db.prepare('UPDATE cards SET last_verify_at = ?, last_ip = ? WHERE id = ?').run(now(), ip || '', row.id);
  logCard(db, row.id, project.id, 'verify', '验卡通过', ip);
  return ok(data);
}

/* ── 2. activate ── */
function doActivate(db, project, rawCard, ip) {
  const row = loadCard(db, rawCard);
  if (!row) return err(2001);
  if (row.frozen) return err(2009);

  if (!scopeCheck(row.scope_projects, project)) {
    logCard(db, row.id, project.id, 'activate', '拒绝:套餐不适用该项目', ip);
    return err(2007);
  }

  if (row.status === 'used')  { logCard(db, row.id, project.id, 'activate', '拒绝:已使用', ip); return err(2002); }
  if (row.status === 'disabled') { logCard(db, row.id, project.id, 'activate', '拒绝:已禁用', ip); return err(2004); }
  if (row.status === 'void')  { logCard(db, row.id, project.id, 'activate', '拒绝:已作废', ip); return err(2005); }
  if (row.status === 'expired') { logCard(db, row.id, project.id, 'activate', '拒绝:已过期', ip); return err(2003); }

  // 原子激活:仅当 status=unused 时写入
  const t = now();
  let expireAt = null;
  if (row.kind === 'duration') expireAt = t + row.days * 86400;
  const info = db.prepare(
    "UPDATE cards SET status = 'used', bound_project_id = ?, activated_at = ?, expire_at = ?, last_ip = ? WHERE id = ? AND status = 'unused'"
  ).run(project.id, t, expireAt, ip || '', row.id);
  if (info.changes === 0) return err(2002); // 并发抢先

  const times = row.kind === 'times' ? row.times : null;
  const amount = row.kind === 'money' ? row.amount : null;
  const data = {
    type: row.kind,
    card: row.card,
    expire_at: expireAt,
    remaining_times: times,
    amount,
    project_id: project.id,
  };

  logCard(db, row.id, project.id, 'activate', `激活成功,过期时间:${expireAt || '永久'}`, ip);

  // 可选回调(异步,不阻塞响应)
  if (project.callback_url) {
    const cbPayload = { card: row.card, project_id: project.id, project_name: project.name, type: row.kind, expire_at: expireAt };
    if (row.kind === 'money') cbPayload.amount = row.amount;
    notifyCallback(project.callback_url, cbPayload).catch(() => {});
  }

  return ok(data);
}

/* ── 3. consume ── */
function doConsume(db, project, rawCard, times, ip) {
  const row = loadCard(db, rawCard);
  if (!row) return err(2001);
  if (row.frozen) return err(2009);

  if (row.status === 'unused') { logCard(db, row.id, project.id, 'consume', '拒绝:尚未激活', ip); return err(2010); }
  if (row.status === 'disabled') { logCard(db, row.id, project.id, 'consume', '拒绝:已禁用', ip); return err(2004); }
  if (row.status === 'void') { logCard(db, row.id, project.id, 'consume', '拒绝:已作废', ip); return err(2005); }

  if (row.status === 'used' && row.bound_project_id !== project.id) {
    logCard(db, row.id, project.id, 'consume', `拒绝:已绑定项目#${row.bound_project_id}`, ip);
    return err(2006);
  }

  if (!scopeCheck(row.scope_projects, project)) {
    logCard(db, row.id, project.id, 'consume', '拒绝:套餐不适用', ip);
    return err(2007);
  }

  if (row.kind !== 'times') {
    const reason = row.kind === 'money' ? '金额卡不做次数核销' : '非次数卡';
    logCard(db, row.id, project.id, 'consume', `拒绝:${reason}`, ip);
    return row.kind === 'money' ? err(2012) : err(2011);
  }

  const want = Math.max(1, parseInt(times, 10) || 1);
  const remaining = row.times - row.times_used;
  if (want > remaining) {
    logCard(db, row.id, project.id, 'consume', `拒绝:剩余${remaining}次,请求${want}次`, ip);
    return err(2008);
  }

  const newUsed = row.times_used + want;
  db.prepare('UPDATE cards SET times_used = ?, last_verify_at = ?, last_ip = ? WHERE id = ?')
    .run(newUsed, now(), ip || '', row.id);

  // 次数耗尽 → 过期
  if (newUsed >= row.times) {
    db.prepare("UPDATE cards SET status = 'expired' WHERE id = ?").run(row.id);
  }

  const left = row.times - newUsed;
  logCard(db, row.id, project.id, 'consume', `扣${want}次,剩余${left}次`, ip);

  return ok({ card: row.card, consumed: want, remaining_times: left });
}

/* ── 4. query ── */
function doQuery(db, project, rawCard, ip) {
  const row = loadCard(db, rawCard);
  if (!row) return err(2001);

  // 租户隔离:已绑定其他项目 → 拒绝
  if (row.status === 'used' && row.bound_project_id && row.bound_project_id !== project.id) {
    logCard(db, row.id, project.id, 'query', `拒绝:已绑定项目#${row.bound_project_id}`, ip);
    return err(2006);
  }

  const remaining = computeRemaining(row, now());
  const boundProject = row.bound_project_id
    ? db.prepare('SELECT id, name FROM projects WHERE id = ?').get(row.bound_project_id)
    : null;

  logCard(db, row.id, project.id, 'query', '查询', ip);

  return ok({
    card: row.card,
    status: row.status,
    frozen: !!row.frozen,
    type_id: row.type_id,
    kind: row.kind,
    bound_project: boundProject || null,
    activated_at: row.activated_at,
    expire_at: row.expire_at,
    times_used: row.times_used,
    ...remaining,
  });
}

/* ── 5. freeze ── */
function doFreeze(db, project, rawCard, ip) {
  const row = loadCard(db, rawCard);
  if (!row) return err(2001);

  // 租户隔离:已绑定其他项目 → 拒绝
  if (row.status === 'used' && row.bound_project_id && row.bound_project_id !== project.id) {
    logCard(db, row.id, project.id, 'freeze', `拒绝:已绑定项目#${row.bound_project_id}`, ip);
    return err(2006);
  }

  db.prepare('UPDATE cards SET frozen = 1 WHERE id = ?').run(row.id);
  logCard(db, row.id, project.id, 'freeze', '冻结', ip);
  return ok({ card: row.card, status: 'frozen' });
}

/* ── 6. unfreeze ── */
function doUnfreeze(db, project, rawCard, ip) {
  const row = loadCard(db, rawCard);
  if (!row) return err(2001);

  // 租户隔离:已绑定其他项目 → 拒绝
  if (row.status === 'used' && row.bound_project_id && row.bound_project_id !== project.id) {
    logCard(db, row.id, project.id, 'unfreeze', `拒绝:已绑定项目#${row.bound_project_id}`, ip);
    return err(2006);
  }

  db.prepare('UPDATE cards SET frozen = 0 WHERE id = ?').run(row.id);
  logCard(db, row.id, project.id, 'unfreeze', '解冻', ip);
  return ok({ card: row.card, status: 'normal' });
}

/* ── 统一分发 ── */
const ACTIONS = { verify: doVerify, activate: doActivate, consume: doConsume, query: doQuery, freeze: doFreeze, unfreeze: doUnfreeze };

function dispatch(action, project, body, ip) {
  if (!ACTIONS[action]) return { code: 400, message: '未知操作', data: null };
  const db = getDb();
  const fn = ACTIONS[action];
  if (action === 'consume') {
    return fn(db, project, body.card, body.times, ip);
  }
  return fn(db, project, body.card, ip);
}

module.exports = { dispatch, ACTIONS };
