'use strict';

const { getDb } = require('../db');
const { now } = require('../lib/time');

/** 后台操作审计入库 */
function logOper(db, admin, action, target, detail) {
  db.prepare(
    'INSERT INTO oper_logs (admin_id, admin_name, action, target, detail, ip, created_at) VALUES (?,?,?,?,?,?,?)'
  ).run(
    admin ? admin.id : 0,
    admin ? admin.username : 'system',
    action,
    target || '',
    detail || '',
    admin && admin._ip ? admin._ip : '',
    now()
  );
}

module.exports = { logOper };