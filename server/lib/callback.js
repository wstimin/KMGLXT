'use strict';

/**
 * 激活成功后的可选回调(POST JSON,最多重试 3 次,fire-and-forget)。
 * Node 24 自带全局 fetch。
 */
async function notifyCallback(url, payload, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        console.log(`[callback] 成功 POST ${url}`);
        return;
      }
    } catch (e) {
      console.warn(`[callback] 第${i + 1}次尝试失败: ${e.message}`);
    }
    // 指数退避
    if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  console.error(`[callback] ${retries} 次重试后仍失败,放弃 POST ${url}`);
}

module.exports = { notifyCallback };
