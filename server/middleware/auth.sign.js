'use strict';

/**
 * 对外 API 签名鉴权中间件。
 * Header: X-App-Key / X-Timestamp / X-Nonce / X-Sign
 * 顺序:时间戳→IP白名单→签名→nonce防重放→限频
 */
const { getDb } = require('../db');
const { now } = require('../lib/time');
const { computeSign, sha256hex, timingSafeEqualHex } = require('../lib/crypto');
const { checkAndRecord, gc } = require('../lib/ratelimit');
const config = require('../config');

const TS_WINDOW = config.security.signTimeWindow || 300;

function err(res, code, message) {
  return res.status(200).json({ code, message, data: null });
}

// nonce 限流 DB 清理器(每 100 条清一次过期)
let insertCount = 0;
function cleanupNonces(db) {
  if (++insertCount % 100 !== 0) return;
  try {
    db.prepare('DELETE FROM nonces WHERE expire_at < ?').run(now());
  } catch { /* 忽略 */ }
}

function authSign(req, res, next) {
  const appKey = req.headers['x-app-key'];
  const ts = req.headers['x-timestamp'];
  const nonce = req.headers['x-nonce'];
  const sign = req.headers['x-sign'];

  if (!appKey || !ts || !nonce || !sign) {
    return err(res, 1001, '缺少签名参数');
  }

  const db = getDb();
  gc();

  /* 1. 查项目 */
  const project = db.prepare('SELECT * FROM projects WHERE app_key = ?').get(appKey);
  if (!project) return err(res, 1001, '无效的凭证');
  if (project.status !== 1) return err(res, 1003, '项目已被禁用');

  /* 2. 时间戳 */
  const tsNum = parseInt(ts, 10);
  if (!Number.isFinite(tsNum) || Math.abs(now() - tsNum) > TS_WINDOW) {
    return err(res, 1001, '时间戳已过期');
  }

  /* 3. IP 白名单(尽早拒绝,节省后续开销) */
  if (project.ip_whitelist && project.ip_whitelist.trim()) {
    const allowed = project.ip_whitelist.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(req.ip)) {
      return err(res, 1001, 'IP 不在项目白名单内');
    }
  }

  /* 4. 签名校验 */
  const bodyStr = req.rawBody ? req.rawBody.toString('utf8') : '';
  const bodyHash = sha256hex(bodyStr);
  const expected = computeSign(project.app_secret, project.app_key, String(tsNum), nonce, bodyHash);
  if (!timingSafeEqualHex(expected, sign)) {
    return err(res, 1001, '签名无效');
  }

  /* 5. nonce 防重放(签名通过后才消费,防止无效请求消耗 nonce) */
  const expire = now() + (config.security.signNonceTtl || 300);
  try {
    db.prepare('INSERT INTO nonces (nonce, expire_at) VALUES (?, ?)').run(nonce, expire);
  } catch {
    return err(res, 1001, '请求已重放(nonce 重复)');
  }
  cleanupNonces(db);

  /* 6. 限频 */
  if (!checkAndRecord(project.id, project.rate_limit, now())) {
    return err(res, 1002, '接口调用过于频繁');
  }

  req.project = project;
  return next();
}

module.exports = { authSign };
