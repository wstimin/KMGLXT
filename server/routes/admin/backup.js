'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');

const router = express.Router();
const config = require('../../config');
const { getDb, closeDb } = require('../../db');
const { getSecret, resetSecret } = require('../../lib/secret');
const { authAdmin, requireRole } = require('../../middleware/auth.admin');
const { logOper } = require('../../lib/audit');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });
const backupsDir = path.join(config.dataDir, 'backups');
const NAME_RE = /^(?:shiyeka-[\d]{8}-[\d]{6}\.db|shiyeka-full-[\d]{8}-[\d]{6}\.kmbackup)$/;
const MAX_SNAPSHOT_SIZE = 256 * 1024 * 1024;
const MAX_PORTABLE_JSON = 384 * 1024 * 1024;

const stamp = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

function sqlPath(file) {
  return String(file).replace(/\\/g, '/').replace(/'/g, "''");
}

function createPortableBackup(snapshot, target) {
  const database = fs.readFileSync(snapshot);
  if (database.length > MAX_SNAPSHOT_SIZE) throw new Error('数据库超过 256MB，请使用服务器文件方式迁移');
  getSecret();
  const payload = {
    format: 'kmglxt-portable-backup',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    database: database.toString('base64'),
    secret: fs.readFileSync(config.secretPath).toString('base64'),
  };
  fs.writeFileSync(target, zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 }), { mode: 0o600 });
}

function unpackPortableBackup(buffer) {
  let payload;
  try {
    payload = JSON.parse(zlib.gunzipSync(buffer, { maxOutputLength: MAX_PORTABLE_JSON }).toString('utf8'));
  } catch {
    throw new Error('文件不是有效的完整备份');
  }
  if (payload.format !== 'kmglxt-portable-backup' || payload.formatVersion !== 1) {
    throw new Error('不支持的备份格式');
  }
  const database = Buffer.from(String(payload.database || ''), 'base64');
  const secret = Buffer.from(String(payload.secret || ''), 'base64');
  if (!database.length || !secret.length) throw new Error('完整备份缺少必要数据');
  return { database, secret };
}

function validateDatabase(file) {
  let db;
  try {
    db = new DatabaseSync(file);
    const integrity = db.prepare('PRAGMA quick_check').get();
    if (Object.values(integrity || {})[0] !== 'ok') throw new Error('数据库完整性检查失败');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
    for (const table of ['admins', 'settings', 'projects', 'cards', 'card_types']) {
      if (!tables.has(table)) throw new Error(`备份缺少数据表：${table}`);
    }
    if (!db.prepare('SELECT id FROM admins LIMIT 1').get()) throw new Error('备份中没有管理员账号');
  } finally {
    if (db) db.close();
  }
}

/** 创建可下载、可跨服务器恢复的完整迁移包。 */
router.post('/create', authAdmin, requireRole('super'), (req, res) => {
  fs.mkdirSync(backupsDir, { recursive: true });
  const id = stamp();
  const name = `shiyeka-full-${id}.kmbackup`;
  const snapshot = path.join(config.dataDir, `.backup-${process.pid}-${Date.now()}.db`);
  const target = path.join(backupsDir, name);
  try {
    getDb().exec(`VACUUM INTO '${sqlPath(snapshot)}'`);
    createPortableBackup(snapshot, target);
  } finally {
    if (fs.existsSync(snapshot)) fs.unlinkSync(snapshot);
  }
  const size = fs.statSync(target).size;
  logOper(getDb(), { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'backup:create', '完整备份', name);
  return ok(res, { name, size, kind: 'portable' });
});

router.get('/list', authAdmin, (req, res) => {
  const list = [];
  if (fs.existsSync(backupsDir)) {
    for (const name of fs.readdirSync(backupsDir)) {
      if (!NAME_RE.test(name)) continue;
      const stat = fs.statSync(path.join(backupsDir, name));
      list.push({
        name,
        size: stat.size,
        created_at: Math.floor(stat.mtimeMs / 1000),
        kind: name.endsWith('.kmbackup') ? 'portable' : 'database',
      });
    }
  }
  list.sort((a, b) => b.created_at - a.created_at);
  return ok(res, { list });
});

router.get('/download', authAdmin, requireRole('super'), (req, res) => {
  const name = String(req.query.name || '');
  if (!NAME_RE.test(name)) return res.status(400).json({ code: 400, message: '无效的备份文件名' });
  const file = path.join(backupsDir, name);
  if (!fs.existsSync(file)) return res.status(404).json({ code: 404, message: '备份文件不存在' });
  logOper(getDb(), { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'backup:download', '备份', name);
  return res.download(file, name);
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });

/** 恢复完整迁移包，继续兼容旧版 .db 数据库备份。 */
router.post('/restore', authAdmin, requireRole('super'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择要恢复的备份文件' });
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (!['.db', '.kmbackup'].includes(ext)) {
    return res.status(400).json({ code: 400, message: '请上传 .kmbackup 或 .db 备份文件' });
  }

  const tmpDb = path.join(config.dataDir, `.restore-${process.pid}-${Date.now()}.db`);
  const portable = ext === '.kmbackup';
  let restoredSecret = null;
  try {
    if (portable) {
      const unpacked = unpackPortableBackup(req.file.buffer);
      fs.writeFileSync(tmpDb, unpacked.database);
      restoredSecret = unpacked.secret;
    } else {
      fs.writeFileSync(tmpDb, req.file.buffer);
    }
    validateDatabase(tmpDb);

    // 覆盖前再留一份服务器端快照，误操作时仍可人工回退。
    const safetyDir = path.join(backupsDir, 'auto');
    fs.mkdirSync(safetyDir, { recursive: true });
    getDb().exec(`VACUUM INTO '${sqlPath(path.join(safetyDir, `pre-restore-${stamp()}-${Date.now()}.db`))}'`);

    closeDb();
    fs.copyFileSync(tmpDb, config.dbPath);
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const file = config.dbPath + suffix;
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    if (restoredSecret) {
      fs.writeFileSync(config.secretPath, restoredSecret, { mode: 0o600 });
      resetSecret();
    }
    getDb();
    logOper(getDb(), { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'backup:restore', '完整恢复', req.file.originalname);
    return ok(res, {
      message: portable ? '完整备份已恢复' : '数据库备份已恢复',
      portable,
      requiresLogin: portable,
    });
  } catch (error) {
    try { getDb(); } catch { /* 保留原始错误 */ }
    return res.status(400).json({ code: 400, message: error.message || '备份恢复失败' });
  } finally {
    try { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb); } catch { /* ignore cleanup */ }
  }
});

module.exports = router;
