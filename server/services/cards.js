'use strict';

const { now } = require('../lib/time');

const DEFAULT_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 剔除 0O1lI
const DEFAULT_LENGTH = 16;
const MAX_PER_BATCH = 10000;

/** 解析字符集:custom 模式需 ≥4 个不重复字母/数字 */
function buildCharset(mode, custom) {
  if (mode === 'custom') {
    const seen = new Set(String(custom || '').toUpperCase().replace(/\s+/g, ''));
    const chars = [...seen].filter((c) => /[A-Z0-9]/.test(c));
    if (chars.length < 4) {
      throw new Error('自定义字符集至少需要 4 个不重复的字母或数字');
    }
    return chars.join('');
  }
  return DEFAULT_CHARSET;
}

/** 校验位:对卡号字符串计算 1 个字符,降低瞎猜成本 */
function checksumCard(str, charset) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum += charset.indexOf(str[i]) + 1 + i * 7;
  }
  return charset[sum % charset.length];
}

function genOne(prefix, contentLen, charset, checkDigit) {
  let buf = '';
  for (let i = 0; i < contentLen; i++) {
    buf += charset[Math.floor(Math.random() * charset.length)];
  }
  let s = prefix + buf;
  if (checkDigit) s += checksumCard(s, charset);
  return s;
}

/**
 * 批量生成卡密(事务内,逐张唯一性重试)。
 * @returns { inserted, batchNo, cards: string[] }
 */
function generateCards(db, { count, prefix, length, charset, checkDigit, typeId, remark = '' }) {
  const stmt = db.prepare('INSERT INTO cards (card, type_id, status, remark, created_at) VALUES (?,?,?,?,?)');
  const batchNo =
    'SY' +
    String(Date.now()).slice(-8) +
    Math.random().toString(36).slice(2, 7).toUpperCase();

  const cards = [];
  let inserted = 0;

  db.exec('BEGIN');
  try {
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const card = genOne(prefix, length - (checkDigit ? 1 : 0), charset, checkDigit);
        try {
          stmt.run(card, typeId, 'unused', remark, now());
          cards.push(card);
          inserted++;
          break;
        } catch (e) {
          const isDup = /UNIQUE|CONSTRAINT/i.test(String(e.message || e.code));
          if (!isDup || attempt === 5) throw e;
        }
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return { inserted, batchNo, cards };
}

module.exports = { DEFAULT_CHARSET, DEFAULT_LENGTH, MAX_PER_BATCH, buildCharset, generateCards };