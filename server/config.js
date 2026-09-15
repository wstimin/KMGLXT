'use strict';

const path = require('path');

const SERVER_DIR = __dirname;
const ROOT = path.join(SERVER_DIR, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(SERVER_DIR, 'data');

module.exports = {
  port: parseInt(process.env.PORT || '1111', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dataDir: DATA_DIR,
  dbPath: path.join(DATA_DIR, 'shiyeka.db'),
  secretPath: path.join(DATA_DIR, 'secret.key'),
  webDist: path.join(SERVER_DIR, 'public'),
  jwt: {
    expiresIn: '7d',
  },
  security: {
    loginMaxFails: 5,          // 连续失败次数
    loginLockMinutes: 15,      // 锁定分钟数
    signTimeWindow: 300,       // 对外 API 签名时间窗(秒)
    signNonceTtl: 300,         // nonce 防重放窗口(秒)
  },
};

