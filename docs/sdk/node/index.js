/**
 * 十夜卡密 · Node.js 对接客户端
 *
 * 要求:Node >= 18(内置 fetch 与 crypto)。运行:
 *   npm init -y && node index.js
 */
const crypto = require('node:crypto');

const ENDPOINT = 'https://api.your-domain.com'; // 你的十夜卡密服务地址
const APP_KEY = 'XXXXXXXXXXXXXXXXXXXXXXXX';
const APP_SECRET = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

/** 发送签名请求 */
async function request(path, body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(8).toString('hex');
  const raw = JSON.stringify(body); // 与发送字节保持一致
  const bodyHash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  const sign = crypto
    .createHmac('sha256', APP_SECRET)
    .update(`${APP_KEY}\n${timestamp}\n${nonce}\n${bodyHash}`, 'utf8')
    .digest('hex');

  const res = await fetch(`${ENDPOINT}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Key': APP_KEY,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Sign': sign,
    },
    body: raw,
  });
  return res.json();
}

const api = {
  verify: (card) => request('/api/v1/card/verify', { card }),
  activate: (card) => request('/api/v1/card/activate', { card }),
  consume: (card, times = 1) => request('/api/v1/card/consume', { card, times }),
  query: (card) => request('/api/v1/card/query', { card }),
  freeze: (card) => request('/api/v1/card/freeze', { card }),
  unfreeze: (card) => request('/api/v1/card/unfreeze', { card }),
};

module.exports = api;

// 自测(临时):
// api.activate('SY2026XXXX').then((r) => console.log(r));