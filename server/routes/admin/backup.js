'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');

const router = express.Router();
const config = require('../../config');
const { getDb, closeDb } = require('../../db');
const { authAdmin, requireRole } = require('../../middleware/auth.admin');
const { logOper } = require('../../lib/audit');
const { now } = require('../../lib/time');

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });

const backupsDir = path.join(config.dataDir, 'backups');
/** 文件名白名单,防路径穿越 */
const NAME_RE = /^shiyeka-[\d]{8}-[\d]{6}\.db$/;

const stamp = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** 一键热备份:VACUUM INTO(不锁库,WAL 安全) */
router.post('/create', authAdmin, (req, res) => {
  fs.mkdirSync(backupsDir, { recursive: true });
  const name = `shiyeka-${stamp()}.db`;
  const target = path.join(backupsDir, name).replace(/\\/g, '/');
  getDb().exec(`VACUUM INTO '${target}'`);
  const size = fs.statSync(path.join(backupsDir, name)).size;
  logOper(getDb(), { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'backup:create', '备份', name);
  return ok(res, { name, size });
});

/** 备份列表 */
router.get('/list', authAdmin, (req, res) => {
  const list = [];
  if (fs.existsSync(backupsDir)) {
    for (const f of fs.readdirSync(backupsDir)) {
      if (!NAME_RE.test(f)) continue;
      const st = fs.statSync(path.join(backupsDir, f));
      list.push({ name: f, size: st.size, created_at: Math.floor(st.mtimeMs / 1000) });
    }
  }
  list.sort((a, b) => b.created_at - a.created_at);
  return ok(res, { list });
});

/** 下载备份 */
router.get('/download', authAdmin, (req, res) => {
  const name = String(req.query.name || '');
  if (!NAME_RE.test(name)) return res.status(400).json({ code: 400, message: '无效的备份文件名' });
  const file = path.join(backupsDir, name);
  if (!fs.existsSync(file)) return res.status(404).json({ code: 404, message: '备份文件不存在' });
  logOper(getDb(), { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'backup:download', '备份', name);
  return res.download(file, name);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 * 1024 }, // 512MB 以内
});

/** 恢复(超管):上传备份 .db → 校验 → 关闭连接 → 换文件 → 重开 */
router.post('/restore', authAdmin, requireRole('super'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择要恢复的备份文件' });
  const ext = path.extname(req.file.originalname || '').toLowerCase();
  if (ext !== '.db') return res.status(400).json({ code: 400, message: '请上传 .db 备份文件' });

  // 1. 落到临时文件并校验完整性
  const tmp = path.join(config.dataDir, 'restore.tmp.db');
  fs.writeFileSync(tmp, req.file.buffer);
  try {
    const check = new DatabaseSync(tmp);
    check.prepare('SELECT COUNT(*) FROM cards').get();
    check.close();
  } catch {
    return res.status(400).json({ code: 400, message: '文件不是有效的数据库备份' });
  }

  // 2. 关闭当前连接,替换主库文件,清理 WAL 残留
  closeDb();
  const main = config.dbPath;
  fs.copyFileSync(tmp, main);
  for (const suff of ['-wal', '-shm', '-journal']) {
    const f = main + suff;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  fs.unlinkSync(tmp);

  // 3. 重开连接
  getDb();
  logOper(getDb(), { id: req.admin.id, username: req.admin.username, _ip: req.ip }, 'backup:restore', '恢复', req.file.originalname);
  return ok(res, { message: '数据库已恢复' });
});

module.exports = router;