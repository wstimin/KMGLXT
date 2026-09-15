'use strict';

/**
 * 基于滑动窗口的限频器(per project,内存实现)。
 * rate_limit = 每分钟允许的最大请求数; 0 = 不限制。
 */
const buckets = new Map(); // projectId → timestamp[]

function checkAndRecord(projectId, limit, nowTs) {
  if (limit <= 0) return true; // 0 = 不限制

  let arr = buckets.get(projectId);
  if (!arr) {
    arr = [];
    buckets.set(projectId, arr);
  }

  const cutoff = nowTs - 60;
  // 滑出窗口
  while (arr.length && arr[0] <= cutoff) arr.shift();

  if (arr.length >= limit) return false;
  arr.push(nowTs);
  return true;
}

/** 定期清理 >10 分钟前的空桶,防内存泄漏(每 1000 次调用清一次) */
let calls = 0;
function gc() {
  if (++calls % 1000 !== 0) return;
  for (const [id, arr] of buckets) {
    if (!arr.length || arr[arr.length - 1] < Date.now() / 1000 - 600) buckets.delete(id);
  }
}

module.exports = { checkAndRecord, gc };
