'use strict';

/**
 * 数据库热备份(供 deploy/km.sh 更新前调用,不停止服务)。
 *
 * 用法:
 *   node server/scripts/db-backup.js <输出路径.db>
 *
 * 实现:VACUUM INTO(在线一致性快照),对运行中的 SQLite(WAL)安全。
 * 依赖 DATA_DIR 环境变量定位数据库,见 server/config.js。
 */
const path = require('path');

const out = process.argv[2];
if (!out) {
  console.error('用法: node scripts/db-backup.js <输出路径.db>');
  process.exit(1);
}

const { getDb } = require('../db');
const db = getDb();
try {
  // VACUUM INTO 的路径是 SQL 字符串字面量,先转义单引号
  const esc = String(out).replace(/'/g, "''");
  db.exec(`VACUUM INTO '${esc}'`);
  console.log('✔ 数据库备份: ' + out);
} finally {
  db.close();
}