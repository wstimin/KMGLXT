'use strict';

/**
 * 修改 / 创建管理员账号(供 deploy/km.sh 的「修改账号密码」调用)。
 *
 * 用法:
 *   node server/scripts/set-admin.js <用户名> <密码>
 *
 * 说明:
 * - 库中已有管理员:更新第一个管理员的用户名与密码(bcrypt 哈希,不存明文)。
 * - 库中无管理员:以超级管理员身份创建。
 * - 修改立即生效(登录校验实时读库),无需重启服务。
 */
const path = require('path');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { now } = require('../lib/time');

const username = String(process.argv[2] || '').trim();
const password = process.argv[3] || '';

if (!username || !password) {
  console.error('用法: node scripts/set-admin.js <用户名> <密码>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('密码至少 6 位');
  process.exit(1);
}

const db = getDb();
const hash = bcrypt.hashSync(password, 10);
const t = now();

const existing = db.prepare('SELECT id FROM admins ORDER BY id LIMIT 1').get();
if (existing) {
  db.prepare('UPDATE admins SET username = ?, password = ?, updated_at = ? WHERE id = ?')
    .run(username, hash, t, existing.id);
  console.log('✔ 管理员已更新: ' + username);
} else {
  db.prepare(
    'INSERT INTO admins (username, password, role, status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(username, hash, 'super', t, t);
  console.log('✔ 超级管理员已创建: ' + username);
}
db.close();