'use strict';

const crypto = require('crypto');

/* ── 不歧义字符集 ── */
const APP_KEY_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 大写+数字,无歧义
const SECRET_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'; // 混合,强度更高

/** 用 crypto.randomBytes 均匀采样生成密钥 */
function randomChars(len, chars) {
  const buf = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[buf[i] % chars.length]; // 微偏斜但足够用
  }
  return s;
}

function genAppKey() { return randomChars(24, APP_KEY_CHARS); }
function genAppSecret() { return randomChars(48, SECRET_CHARS); }

/* ── HMAC-SHA256 签名 ── */
/**
 * sign = HMAC_SHA256(app_secret, app_key + "\n" + timestamp + "\n" + nonce + "\n" + sha256(body))
 * 返回十六进制小写
 */
function computeSign(appSecret, appKey, timestamp, nonce, bodyHash) {
  const message = `${appKey}\n${timestamp}\n${nonce}\n${bodyHash}`;
  return crypto.createHmac('sha256', appSecret).update(message, 'utf8').digest('hex');
}

function sha256hex(str) {
  return crypto.createHash('sha256').update(str || '', 'utf8').digest('hex');
}

/** 常数时间比较两个十六进制字符串,防 timing attack */
function timingSafeEqualHex(a, b) {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { genAppKey, genAppSecret, computeSign, sha256hex, timingSafeEqualHex };
