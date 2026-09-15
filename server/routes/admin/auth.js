'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const { getDb } = require('../../db');
const { getSecret } = require('../../lib/secret');
const { now } = require('../../lib/time');
const { logOper } = require('../../lib/audit');
const config = require('../../config');
const { authAdmin } = require('../../middleware/auth.admin');
const { asyncWrap } = require('../../middleware/error');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

function issueCookie(res, admin) {
  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role },
    getSecret(),
    { expiresIn: config.jwt.expiresIn }
  );
  const secured = !!res.req.secure || res.req.headers['x-forwarded-proto'] === 'https';
  res.cookie('syk_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secured,
    maxAge: 7 * 24 * 3600 * 1000,
    path: '/',
  });
}

router.post('/login', asyncWrap(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '请输入用户名和密码' });
  }
  const db = getDb();
  const name = String(username).trim();
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(name);
  const t = now();
  const clientIp = req.ip || '';

  if (admin && admin.status !== 1) {
    return res.status(403).json({ code: 403, message: '账号已被禁用,请联系超级管理员' });
  }
  if (admin && admin.lock_until > t) {
    const leftMin = Math.ceil((admin.lock_until - t) / 60);
    return res.status(423).json({ code: 423, message: `尝试过于频繁,账号已锁定,请约 ${leftMin} 分钟后再试` });
  }

  const valid = admin ? bcrypt.compareSync(password, admin.password) : false;
  if (!valid) {
    if (!admin) {
      logOper(db, null, 'auth:login_fail', '账号', `尝试登录不存在的账号 ${name}`);
      return res.status(401).json({ code: 401, message: '用户名或密码错误' });
    }
    const fails = admin.login_fail_count + 1;
    let lockUntil = 0;
    let msg = `用户名或密码错误(剩余 ${Math.max(0, config.security.loginMaxFails - fails)} 次机会)`;
    if (fails >= config.security.loginMaxFails) {
      lockUntil = t + config.security.loginLockMinutes * 60;
      msg = '密码错误次数过多,账号已锁定 15 分钟,请稍后再试';
    }
    db.prepare('UPDATE admins SET login_fail_count = ?, lock_until = ?, updated_at = ? WHERE id = ?')
      .run(fails, lockUntil, t, admin.id);
    logOper(db, { id: admin.id, username: admin.username, _ip: clientIp }, 'auth:login_fail', '账号', msg);
    return res.status(401).json({ code: 401, message: msg });
  }

  db.prepare('UPDATE admins SET login_fail_count = 0, lock_until = 0, last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?')
    .run(t, clientIp, t, admin.id);
  logOper(db, { id: admin.id, username: admin.username, _ip: clientIp }, 'auth:login', '账号', '登录成功');
  issueCookie(res, admin);
  return ok(res, { admin: { id: admin.id, username: admin.username, role: admin.role } });
}));

router.get('/me', authAdmin, (req, res) =>
  ok(res, { admin: { id: req.admin.id, username: req.admin.username, role: req.admin.role } })
);

router.post('/logout', (req, res) => {
  res.clearCookie('syk_token', { path: '/' });
  return ok(res, null);
});

router.post('/change-password', authAdmin, asyncWrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ code: 400, message: '请输入原密码和新密码' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ code: 400, message: '新密码至少 6 位' });
  }
  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(oldPassword, admin.password)) {
    return res.status(401).json({ code: 401, message: '原密码错误' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password = ?, updated_at = ? WHERE id = ?').run(hash, now(), admin.id);
  logOper(db, { id: admin.id, username: admin.username, _ip: req.ip }, 'auth:change_password', '账号', '修改登录密码');
  return ok(res, null);
}));

router.post('/change-username', authAdmin, asyncWrap(async (req, res) => {
  const { newUsername, password } = req.body || {};
  const name = String(newUsername || '').trim();
  if (!name) return res.status(400).json({ code: 400, message: '请输入新用户名' });
  if (name.length < 2 || name.length > 32)
    return res.status(400).json({ code: 400, message: '用户名长度需在 2-32 位之间' });
  if (!/^[\w一-龥-]+$/.test(name))
    return res.status(400).json({ code: 400, message: '用户名只能包含字母/数字/下划线/中文/连字符' });
  if (!password) return res.status(400).json({ code: 400, message: '请输入当前密码确认身份' });
  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(password, admin.password))
    return res.status(401).json({ code: 401, message: '当前密码错误' });
  const dup = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?').get(name, admin.id);
  if (dup) return res.status(409).json({ code: 409, message: '该用户名已被占用' });
  db.prepare('UPDATE admins SET username = ?, updated_at = ? WHERE id = ?').run(name, now(), admin.id);
  logOper(db, { id: admin.id, username: admin.username, _ip: req.ip }, 'auth:change_username', '账号', `修改用户名为「${name}」`);
  const updated = { id: admin.id, username: name, role: admin.role };
  issueCookie(res, updated);
  return ok(res, { admin: updated });
}));

router.post('/change-username', authAdmin, asyncWrap(async (req, res) => {
  const { newUsername, password } = req.body || {};
  const name = String(newUsername || '').trim();
  if (name.length < 2 || name.length > 32) {
    return res.status(400).json({ code: 400, message: '用户名长度需在 2-32 位之间' });
  }
  if (!/^[\w一-龥-]+$/.test(name)) {
    return res.status(400).json({ code: 400, message: '用户名只能包含字母/数字/下划线/中文/连字符' });
  }
  if (!password) {
    return res.status(400).json({ code: 400, message: '请输入当前密码确认' });
  }
  const db = getDb();
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ code: 401, message: '当前密码错误' });
  }
  const dup = db.prepare('SELECT id FROM admins WHERE username = ? AND id != ?').get(name, admin.id);
  if (dup) {
    return res.status(409).json({ code: 409, message: '该用户名已被占用' });
  }
  db.prepare('UPDATE admins SET username = ?, updated_at = ? WHERE id = ?').run(name, now(), admin.id);
  logOper(db, { id: admin.id, username: admin.username, _ip: req.ip }, 'auth:change_username', '账号', `修改用户名为 ${name}`);
  const updated = { id: admin.id, username: name, role: admin.role };
  issueCookie(res, updated);
  return ok(res, { admin: updated });
}));

module.exports = router;