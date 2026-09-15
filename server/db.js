'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { now } = require('./lib/time');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  status INTEGER NOT NULL DEFAULT 1,
  login_fail_count INTEGER NOT NULL DEFAULT 0,
  lock_until INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER NOT NULL DEFAULT 0,
  last_login_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  app_key TEXT UNIQUE NOT NULL,
  app_secret TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  callback_url TEXT NOT NULL DEFAULT '',
  ip_whitelist TEXT NOT NULL DEFAULT '',
  rate_limit INTEGER NOT NULL DEFAULT 60,
  remark TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS card_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'duration',
  days INTEGER NOT NULL DEFAULT 0,
  times INTEGER NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0,
  scope_projects TEXT NOT NULL DEFAULT '[]',
  status INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card TEXT UNIQUE NOT NULL,
  type_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  bound_project_id INTEGER,
  activated_at INTEGER,
  expire_at INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  frozen INTEGER NOT NULL DEFAULT 0,
  last_verify_at INTEGER,
  last_ip TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type_id);
CREATE INDEX IF NOT EXISTS idx_cards_project ON cards(bound_project_id);

CREATE TABLE IF NOT EXISTS card_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_logs_card ON card_logs(card_id);
CREATE INDEX IF NOT EXISTS idx_logs_project ON card_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON card_logs(created_at);

CREATE TABLE IF NOT EXISTS oper_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL DEFAULT 0,
  admin_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oper_created ON oper_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS generate_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL DEFAULT 0,
  admin_name TEXT NOT NULL DEFAULT '',
  type_id INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0,
  rule TEXT NOT NULL DEFAULT '{}',
  batch_no TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS nonces (
  nonce TEXT PRIMARY KEY,
  expire_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_nonces_expire ON nonces(expire_at);
`;

const DEFAULT_SETTINGS = {
  site_name: '十夜卡密',
  announcement: '欢迎使用十夜卡密 · 综合性卡密管理系统',
};

/** 轻量迁移:老库补列(增量演进,不破坏已有数据) */
function migrate(db) {
  const cardsCols = db.prepare('PRAGMA table_info(cards)').all().map((c) => c.name);
  if (!cardsCols.includes('frozen')) {
    db.exec('ALTER TABLE cards ADD COLUMN frozen INTEGER NOT NULL DEFAULT 0');
  }
  const typesCols = db.prepare('PRAGMA table_info(card_types)').all().map((c) => c.name);
  if (!typesCols.includes('amount')) {
    db.exec('ALTER TABLE card_types ADD COLUMN amount REAL NOT NULL DEFAULT 0');
  }
}

/**
 * 打开(必要时创建)数据库并初始化表结构。
 * 使用 Node 24 内置 node:sqlite(零原生依赖),附 WAL / 外键 / 忙碌超时 PRAGMA。
 */
function createDb() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function initSettings(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, v);
}

/**
 * 创建超级管理员(幂等:已有管理员则跳过)。
 * 生产安全策略:必须通过环境变量 ADMIN_USER / ADMIN_PASS 提供凭据,
 * 未设置且库中无管理员时明确报错,不再使用默认弱口令 admin/admin123。
 */
function initSuperAdmin(db) {
  // 库中已有管理员 → 无需环境变量(老库升级 / 重建场景)
  const existing = db.prepare('SELECT id, username FROM admins LIMIT 1').get();
  if (existing) return { username: existing.username, created: false };

  const username = (process.env.ADMIN_USER || '').trim();
  const password = process.env.ADMIN_PASS || '';
  if (!username || !password) {
    console.error('✘ 未设置 ADMIN_USER / ADMIN_PASS 环境变量,且数据库尚无管理员。');
    console.error('   首次部署请设置后重新初始化,例如:');
    console.error('     ADMIN_USER=你的用户名 ADMIN_PASS=你的密码 npm run init-db');
    throw new Error('initSuperAdmin: 缺少 ADMIN_USER / ADMIN_PASS 环境变量');
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO admins (username, password, role, status, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
  ).run(username, hash, 'super', now(), now());
  return { username, created: true };
}

/** 应用内共享的单例数据库连接(懒创建) */
let _db = null;
function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

/** 关闭并重置单例(备份恢复时替换数据库文件后会调用) */
function closeDb() {
  if (_db) {
    try { _db.close(); } catch { /* 忽略 */ }
    _db = null;
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const db = createDb();
  initSettings(db);
  const created = Boolean(argv.includes('--init'));
  let info = null;
  if (created) info = initSuperAdmin(db);
  console.log('✔ 数据库就绪:', config.dbPath);
  if (info) {
    console.log(`✔ 超级管理员: ${info.username}  (${info.created ? '新建' : '已存在,未改动'})`);
    if (info.created) console.log('  ⚠ 请妥善保管密码;登录后可在后台修改');
  }
  db.close();
}

module.exports = { createDb, getDb, closeDb, initSettings, initSuperAdmin, SCHEMA, DEFAULT_SETTINGS };