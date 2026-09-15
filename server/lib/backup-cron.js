'use strict';

/**
 * 定时备份脚本(供 cron 调用,独立于 web 服务进程)。
 * 用法: node server/lib/backup-cron.js [--keep N]
 *   --keep N  只保留最近 N 份备份,默认 7
 * 原理:先用 VACUUM INTO 热备份,再按文件名清理过期备份。
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

const keep = (() => {
  const i = process.argv.indexOf('--keep');
  return i > -1 ? parseInt(process.argv[i + 1], 10) || 7 : 7;
})();

const backupsDir = path.join(config.dataDir, 'backups');
const NAME_RE = /^shiyeka-[\d]{8}-[\d]{6}\.db$/;

function stamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

fs.mkdirSync(backupsDir, { recursive: true });
const name = `shiyeka-${stamp()}.db`;
const target = path.join(backupsDir, name).replace(/\\/g, '/');

const db = new DatabaseSync(config.dbPath);
db.exec(`VACUUM INTO '${target}'`);
db.close();
console.log('[backup] 已备份', name);

// 清理过期
const files = fs.readdirSync(backupsDir).filter((f) => NAME_RE.test(f)).sort().reverse();
for (const f of files.slice(keep)) {
  fs.unlinkSync(path.join(backupsDir, f));
  console.log('[backup] 已清理过期', f);
}